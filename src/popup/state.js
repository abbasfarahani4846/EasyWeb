/**
 * Reactive Popup State Management
 */
import { DEFAULT_SITE, DEFAULTS } from '../shared/defaults.js';
import { VERSION } from '../shared/constants.js';
import { migrateSite, syncSiteEnabled } from '../shared/models.js';

export const state = {
  domain: '',
  tabId: null,
  site: structuredClone(DEFAULT_SITE),
  fonts: [],
  activeTargetId: null,
  openPanels: [],
  adblock: null,
  /** How a newly picked advertising section should be neutralised. */
  adPickMode: 'hide'
};

export const $ = (id) => document.getElementById(id);

export function setStatus(message, error = false) {
  const node = $('status');
  if (!node) return;
  node.textContent = message;
  node.style.color = error ? '#ff8d9c' : '';
}

export function activeTarget(feature) {
  return state.site.targets.find((t) => t.id === state.activeTargetId) || null;
}

export async function getStorage() {
  return chrome.storage.local.get(DEFAULTS);
}

export async function ensureContentScript() {
  if (!state.tabId) return false;
  let alive = false;
  try {
    const status = await chrome.tabs.sendMessage(state.tabId, { type: 'PING' });
    // Compare against the live VERSION constant. A hardcoded value here used to
    // make every popup interaction re-inject content.js, which left two content
    // script instances running on the page.
    alive = !!(status?.ok && (!status.version || status.version === VERSION));
  } catch (_) {}
  if (alive) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId: state.tabId }, files: ['content.js'] });
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Send a message to the active tab, re-injecting the content script first when
 * it is missing or orphaned.
 *
 * This is what removes the need for a manual page refresh: after the extension
 * is reloaded, every already-open page has a dead content script, and a plain
 * `tabs.sendMessage` would simply fail.
 */
export async function messageTab(message) {
  if (!state.tabId) return false;
  try {
    const ready = await ensureContentScript();
    if (!ready) return false;
    await chrome.tabs.sendMessage(state.tabId, message);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Instant live preview: sends current settings directly to the page content script
 * without awaiting PING roundtrips or disk storage writes.
 */
export async function applyLive() {
  if (!state.tabId) return false;
  syncSiteEnabled(state.site);
  try {
    const res = await chrome.tabs.sendMessage(state.tabId, {
      type: 'APPLY_SETTINGS',
      settings: state.site,
      fonts: state.fonts
    });
    if (res?.ok) return true;
  } catch (_) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: state.tabId }, files: ['content.js'] });
      const retry = await chrome.tabs.sendMessage(state.tabId, {
        type: 'APPLY_SETTINGS',
        settings: state.site,
        fonts: state.fonts
      });
      return !!retry?.ok;
    } catch (_) {
      return false;
    }
  }
  return false;
}

let saveTimer = null;

/**
 * Schedule site persistence to storage with debounce for responsive input typing.
 */
export function scheduleSaveSite(delay = 120) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveSite();
  }, delay);
}

export async function pushSettings() {
  return applyLive();
}

export async function saveSite() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!state.domain) return;
  syncSiteEnabled(state.site);
  // Apply changes to the active tab in real time
  applyLive();
  try {
    const store = await getStorage();
    const settingsMap = store.settings || {};
    settingsMap[state.domain] = state.site;
    await chrome.storage.local.set({ settings: settingsMap });
    if (state.tabId) {
      setStatus('✓ ذخیره و اعمال شد');
    } else {
      setStatus('✓ ذخیره شد');
    }
  } catch (err) {
    console.error('[EasyWeb Save Error]:', err);
    setStatus('خطا در ذخیره‌سازی', true);
  }
}

/**
 * Re-read the current domain's stored site object.
 *
 * The ad-blocker card writes through the background worker (which merges into
 * the same storage entry), so the popup's cached copy has to be refreshed
 * before `saveSite()` writes the whole object back — otherwise it would clobber
 * the blocker settings.
 */
export async function reloadSite() {
  if (!state.domain) return state.site;
  try {
    const store = await getStorage();
    state.site = migrateSite((store.settings || {})[state.domain]);
  } catch (_) {}
  return state.site;
}

export async function highlightOnPage(selector) {
  if (!state.tabId || !selector) return;
  await chrome.tabs.sendMessage(state.tabId, { type: 'HIGHLIGHT', selector }).catch(() => {});
}

export async function clearHighlightOnPage() {
  if (!state.tabId) return;
  await chrome.tabs.sendMessage(state.tabId, { type: 'CLEAR_HIGHLIGHT' }).catch(() => {});
}
