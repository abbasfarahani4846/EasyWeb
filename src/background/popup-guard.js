/**
 * EasyWeb Ad Blocker — Popup / Tab Guard
 *
 * Stops the "click a video and a new advertising tab opens" pattern.
 *
 * Strategy
 *   1. The document_start guard reports every genuine user gesture (mousedown /
 *      keydown / auxclick) together with the link it landed on, whether that
 *      link was a real anchor, and whether the target looked like a hijack
 *      overlay.
 *   2. Every new navigation target (window.open / target=_blank / pop-under) is
 *      evaluated against that gesture, the source site's settings and the known
 *      advertising host list.
 *   3. Anything that fails the check is closed immediately.
 */

import { normalizeHost, isKnownAdHost, isAuthHost } from '../shared/adblock.js';
import { GESTURE_WINDOW_MS } from '../shared/constants.js';
import { recordStats, togglesForDomain, popupGuardSettings, getConfig } from './adblock.js';

/** tabId -> last genuine gesture seen in that tab. */
const gestures = new Map();
/** Tabs created by a page that we still need to inspect once they navigate. */
const suspects = new Map();

const URL_SCHEME_ALLOW = /^(?:about:|blob:|data:|chrome:|chrome-extension:|edge:|moz-extension:)/i;

function sameSite(a, b) {
  const hostA = normalizeHost(a);
  const hostB = normalizeHost(b);
  if (!hostA || !hostB) return false;
  return hostA === hostB || hostA.endsWith(`.${hostB}`) || hostB.endsWith(`.${hostA}`);
}

/** Record a gesture reported by the content guard. */
export function recordGesture(tabId, gesture = {}) {
  if (!tabId) return;
  gestures.set(tabId, {
    at: Date.now(),
    href: gesture.href || '',
    hrefHost: gesture.href ? normalizeHost(gesture.href) : '',
    isLink: Boolean(gesture.isLink),
    onOverlay: Boolean(gesture.onOverlay),
    onMedia: Boolean(gesture.onMedia),
    onPlayer: Boolean(gesture.onPlayer)
  });
  // Keep the map from leaking entries for long-lived tabs.
  if (gestures.size > 300) {
    const cutoff = Date.now() - 60000;
    for (const [key, value] of gestures) {
      if (value.at < cutoff) gestures.delete(key);
    }
  }
}

export function clearGesture(tabId) {
  gestures.delete(tabId);
  suspects.delete(tabId);
}

function recentGesture(tabId) {
  const gesture = gestures.get(tabId);
  if (!gesture) return null;
  if (Date.now() - gesture.at > GESTURE_WINDOW_MS) return null;
  return gesture;
}

/**
 * Decide whether a navigation target should be allowed.
 * Exported for testing.
 * @returns {{allow: boolean, reason: string}}
 */
export function evaluate({ sourceDomain, targetUrl, gesture, guard }) {
  const targetHost = normalizeHost(targetUrl);

  if (!targetHost) return { allow: true, reason: 'no-host' };
  if (URL_SCHEME_ALLOW.test(targetUrl)) return { allow: true, reason: 'internal-scheme' };
  if (isAuthHost(targetHost, guard.allowedHosts)) return { allow: true, reason: 'auth-flow' };
  if (sameSite(targetHost, sourceDomain)) return { allow: true, reason: 'same-site' };

  if (!gesture) {
    return guard.blockWithoutGesture
      ? { allow: false, reason: 'no-gesture' }
      : { allow: true, reason: 'no-gesture-allowed' };
  }

  // A known advertising / pop-under destination is never legitimate, even if
  // the hostile player deliberately put it in a visible anchor.
  if (isKnownAdHost(targetHost)) {
    return { allow: false, reason: 'ad-host' };
  }

  // The click landed on a transparent overlay sitting on top of the content.
  if (gesture.onOverlay) {
    return { allow: false, reason: 'overlay-hijack' };
  }

  // A seek/fullscreen/volume/play click must never become a redirect button.
  // Check this *before* accepting a matching href: many hostile players wrap
  // their control surface in an ordinary-looking <a href="external-host">.
  if (guard.blockFromMedia !== false && (gesture.onMedia || gesture.onPlayer)) {
    return { allow: false, reason: 'media-popup' };
  }

  // The gesture pointed at this very destination — a normal link click.
  if (gesture.hrefHost && sameSite(gesture.hrefHost, targetHost)) {
    return { allow: true, reason: 'gesture-target' };
  }

  // A click that was not on a real link, yet produced a third-party window.
  if (guard.blockThirdPartyPopup && !gesture.isLink) {
    return { allow: false, reason: 'synthetic-popup' };
  }

  return { allow: true, reason: 'gesture-allowed' };
}

async function getSourceDomain(sourceTabId, sourceUrl) {
  if (sourceUrl) return normalizeHost(sourceUrl);
  if (!sourceTabId) return '';
  try {
    const tab = await chrome.tabs.get(sourceTabId);
    return normalizeHost(tab?.url || '');
  } catch (_) {
    return '';
  }
}

async function closeTarget(tabId, reason, sourceTabId, targetUrl) {
  try {
    await chrome.tabs.remove(tabId);
  } catch (_) {
    return false;
  }

  const targetHost = normalizeHost(targetUrl);
  const sourceDomain = await getSourceDomain(sourceTabId, '');

  recordStats({ popups: 1, total: 1 }, sourceDomain || targetHost);

  // Tell the page so it can show a small toast.
  if (sourceTabId) {
    try {
      await chrome.tabs.sendMessage(sourceTabId, {
        type: 'ADBLOCK_POPUP_BLOCKED',
        host: targetHost,
        reason
      });
    } catch (_) {}
  }

  return true;
}

/** Core handler shared by both detection paths. */
async function handleTarget({ targetTabId, sourceTabId, targetUrl, sourceUrl }) {
  const config = getConfig();
  if (!config.enabled) return;
  const guard = popupGuardSettings();
  if (!guard.enabled) return;

  const sourceDomain = await getSourceDomain(sourceTabId, sourceUrl);
  if (!sourceDomain) return;

  const toggles = togglesForDomain(sourceDomain);
  if (!toggles.popups) return;

  const gesture = sourceTabId ? recentGesture(sourceTabId) : null;
  const decision = evaluate({ sourceDomain, targetUrl, gesture, guard });

  if (!decision.allow) {
    await closeTarget(targetTabId, decision.reason, sourceTabId, targetUrl);
  }
}

/* ------------------------------------------------------------------ */
/* Detection paths                                                     */
/* ------------------------------------------------------------------ */

/** Primary path: fires for window.open, target=_blank and pop-unders. */
function onCreatedNavigationTarget(details) {
  const { tabId, sourceTabId, url } = details;
  if (!sourceTabId || !tabId) return;
  if (!url || url === 'about:blank') {
    suspects.set(tabId, { openerTabId: sourceTabId, at: Date.now() });
    return;
  }
  handleTarget({ targetTabId: tabId, sourceTabId, targetUrl: url }).catch(() => {});
}

/**
 * Secondary path: a page opens a blank window/tab and navigates it a moment
 * later. We remember the tab when it is created and inspect it on first
 * navigation.
 */
function onTabCreated(tab) {
  if (!tab?.id || !tab.openerTabId) return;
  const config = getConfig();
  if (!config.enabled) return;
  const guard = popupGuardSettings();
  if (!guard.enabled) return;
  // A brand-new tab with no URL or about:blank — decide once it navigates.
  const initialUrl = tab.url || tab.pendingUrl || '';
  if (!initialUrl || initialUrl === 'about:blank') {
    suspects.set(tab.id, { openerTabId: tab.openerTabId, at: Date.now() });
  }
}

function onTabUpdated(tabId, changeInfo, tab) {
  const suspect = suspects.get(tabId);
  if (!suspect) return;
  const url = changeInfo.url || tab?.url || '';
  if (!url) return;
  suspects.delete(tabId);
  if (!/^https?:/i.test(url)) return;
  handleTarget({
    targetTabId: tabId,
    sourceTabId: suspect.openerTabId,
    targetUrl: url
  }).catch(() => {});
}

export function installPopupGuard() {
  if (!chrome.webNavigation?.onCreatedNavigationTarget) {
    console.warn('[EasyWeb Adblock] webNavigation unavailable — popup guard degraded.');
  } else {
    chrome.webNavigation.onCreatedNavigationTarget.addListener(onCreatedNavigationTarget);
  }

  chrome.tabs?.onCreated?.addListener(onTabCreated);
  chrome.tabs?.onUpdated?.addListener(onTabUpdated);
  chrome.tabs?.onRemoved?.addListener((tabId) => {
    clearGesture(tabId);
  });
}

/** Diagnostics for the sidebar. */
export function guardDiagnostics() {
  return {
    trackedGestures: gestures.size,
    pendingSuspects: suspects.size
  };
}
