/**
 * EasyWeb Ad Blocker — Content-side Popup Guard
 *
 * Runs as early as `document_start` so it can neutralise the page's popup
 * machinery before the site's own scripts capture the references.
 *
 * Layers
 *   1. `window.open` wrapper — blocks pop-unders during unload, known ad hosts
 *      and calls made with no user activation at all.
 *   2. Capture-phase click / auxclick guard — blocks invisible hijack links,
 *      links pointing at advertising hosts, and synthetic clicks.
 *   3. Video overlay neutralisation — a transparent layer stacked on top of a
 *      player is switched to `pointer-events: none` and the click is forwarded
 *      to the player underneath, so playback still starts.
 *   4. Gesture reporting — every genuine interaction is described to the
 *      background worker, which uses it to judge new tabs and windows.
 */

import { normalizeHost, isKnownAdHost, isAuthHost } from '../../shared/adblock.js';
import { OVERLAY_ATTR, PICKER_FLAG } from '../../shared/constants.js';

let active = false;
let guardConfig = null;
let lastGestureReport = 0;
let lastGestureHref = '';
let lastGestureAt = 0;
let lastPlayerInteractionAt = 0;
let pageUnloading = false;
let forwarding = false;

/** Player controls are often siblings of the <video>, not descendants. */
const PLAYER_HINT = /(?:^|[-_\s])(video|media|player|jwplayer|vjs|plyr|shaka|dplayer|artplayer|clappr)(?:[-_\s]|$)/i;
const PLAYER_ATTR_SELECTOR = '[data-player],[data-video-player],[data-media-player],[class*="player"],[id*="player"],[class*="video"],[id*="video"],[class*="media"],[id*="media"]';
const AD_SELECTOR_HINT = 'ins,iframe,[data-ad-slot],[data-ad-client],[id^="google_ads"],[class*="adsbygoogle"],.adsbygoogle';
const PLAYER_INTERACTION_WINDOW_MS = 1800;

function sameSite(a, b) {
  const hostA = normalizeHost(a);
  const hostB = normalizeHost(b);
  if (!hostA || !hostB) return false;
  return hostA === hostB || hostA.endsWith(`.${hostB}`) || hostB.endsWith(`.${hostA}`);
}

function resolveUrl(url) {
  if (!url) return '';
  try {
    return new URL(String(url), location.href).href;
  } catch (_) {
    return '';
  }
}

/** Old listeners remain on a page after an extension reload. They must become
 * inert so a fresh guard can take over without a page refresh. */
function hasLiveExtensionContext() {
  try {
    return Boolean(typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.runtime.getURL(''));
  } catch (_) {
    return false;
  }
}

function report(patch) {
  try {
    chrome.runtime.sendMessage({ type: 'ADBLOCK_RECORD', patch });
  } catch (_) {}
}

function eventPoint(event) {
  const touch = event?.touches?.[0] || event?.changedTouches?.[0];
  return {
    x: Number(touch?.clientX ?? event?.clientX ?? -1),
    y: Number(touch?.clientY ?? event?.clientY ?? -1)
  };
}

function pathHasMedia(path = []) {
  return path.some((node) => node instanceof Element
    && (node.tagName === 'VIDEO' || node.tagName === 'AUDIO'));
}

/**
 * Is this interaction on a real media player or one of its controls?
 *
 * Native controls land directly on <video>. Custom controls are normally in a
 * wrapper that contains media; `elementsFromPoint` catches overlays sitting on
 * top of the video. The final class/id check covers popular player libraries
 * while still requiring a media element in that wrapper, avoiding ordinary
 * buttons that merely happen to have "player" in a class name.
 */
function isPlayerInteraction(event, element, path = []) {
  try {
    if (pathHasMedia(path)) return true;
    if (element?.closest?.('video, audio')) return true;

    const { x, y } = eventPoint(event);
    if (x >= 0 && y >= 0 && document.elementsFromPoint) {
      const stack = document.elementsFromPoint(x, y) || [];
      if (stack.some((node) => node?.tagName === 'VIDEO' || node?.tagName === 'AUDIO')) return true;
    }

    let node = element;
    for (let depth = 0; node instanceof Element && depth < 7; depth += 1, node = node.parentElement) {
      const hint = `${node.id || ''} ${String(node.className || '')}`;
      if (!PLAYER_HINT.test(hint) && !node.matches?.(PLAYER_ATTR_SELECTOR)) continue;
      if (node.querySelector?.('video, audio')) return true;
    }
  } catch (_) {}
  return false;
}

function rememberPlayerInteraction(event, element, path) {
  if (!isPlayerInteraction(event, element, path)) return false;
  lastPlayerInteractionAt = Date.now();
  return true;
}

function hasRecentPlayerInteraction() {
  return Date.now() - lastPlayerInteractionAt <= PLAYER_INTERACTION_WINDOW_MS;
}

/** A harmless stand-in returned instead of a real popup window. */
function makeWindowStub(target) {
  const href = target || 'about:blank';
  return {
    closed: true,
    name: '',
    opener: null,
    length: 0,
    focus() {},
    blur() {},
    close() {},
    print() {},
    moveTo() {},
    resizeTo() {},
    scrollTo() {},
    postMessage() {},
    alert() {},
    confirm() { return false; },
    prompt() { return null; },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true; },
    document: {
      write() {},
      writeln() {},
      open() { return this; },
      close() {},
      getElementById() { return null; },
      getElementsByTagName() { return []; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      createElement() { return document.createElement('div'); },
      body: null,
      documentElement: null,
      readyState: 'complete'
    },
    location: {
      href,
      replace() {},
      assign() {},
      reload() {},
      toString() { return href; }
    }
  };
}

/* ------------------------------------------------------------------ */
/* 1. window.open                                                      */
/* ------------------------------------------------------------------ */

function installWindowOpenGuard() {
  const currentOpen = window.open;
  if (typeof currentOpen !== 'function') return;

  // On a later extension reload, `window.open` may still be the wrapper from an
  // orphaned content script. Keep a reference to the *native* opener on every
  // wrapper so the new guard can replace the old one instead of nesting wrappers
  // (nested old wrappers retain stale settings and a dead chrome context).
  const nativeOpen = currentOpen.__easywebNativeOpen || currentOpen;

  const guarded = function (url, name, features) {
    // An orphaned wrapper from a reloaded extension must defer to the browser;
    // the freshly injected wrapper (if any) is now the one that decides.
    if (!hasLiveExtensionContext()) return nativeOpen.call(window, url, name, features);
    if (!active) return nativeOpen.call(window, url, name, features);

    const target = resolveUrl(url);
    const host = normalizeHost(target);

    if (target && host) {
      if (isAuthHost(host, guardConfig?.allowedHosts)) {
        return nativeOpen.call(window, url, name, features);
      }
      if (sameSite(host, location.hostname)) {
        return nativeOpen.call(window, url, name, features);
      }

      // Player controls (seek, fullscreen, volume, play) are never consent to
      // leave the site. This must run before userActivation: hostile scripts
      // call window.open synchronously inside the trusted control click.
      if (guardConfig?.blockFromMedia !== false && hasRecentPlayerInteraction()) {
        report({ popups: 1, total: 1 });
        return makeWindowStub(target);
      }

      // Pop-under: a window opened while the page is being torn down.
      if (pageUnloading) {
        report({ popups: 1, total: 1 });
        return makeWindowStub(target);
      }

      if (isKnownAdHost(host)) {
        report({ popups: 1, total: 1 });
        return makeWindowStub(target);
      }

      // Third-party popup guard: if the user did not click on a link pointing to this destination host
      if (guardConfig?.blockThirdPartyPopup) {
        const matchingLink = lastGestureHref && sameSite(normalizeHost(lastGestureHref), host) && (Date.now() - lastGestureAt <= 2000);
        if (!matchingLink) {
          report({ popups: 1, total: 1 });
          return makeWindowStub(target);
        }
      }

      // No user activation whatsoever — nothing the visitor did caused this.
      const activated = navigator.userActivation ? navigator.userActivation.isActive : true;
      if (!activated && !pageUnloading) {
        report({ popups: 1, total: 1 });
        return makeWindowStub(target);
      }
    } else {
      if (guardConfig?.blockFromMedia !== false && hasRecentPlayerInteraction()) {
        report({ popups: 1, total: 1 });
        return makeWindowStub(target);
      }
      const activated = navigator.userActivation ? navigator.userActivation.isActive : true;
      if (!activated && !pageUnloading && guardConfig?.blockWithoutGesture) {
        report({ popups: 1, total: 1 });
        return makeWindowStub(target);
      }
    }

    return nativeOpen.call(window, url, name, features);
  };

  guarded.__easywebGuarded = true;
  guarded.__easywebNativeOpen = nativeOpen;
  try {
    window.open = guarded;
  } catch (_) {}
}

/* ------------------------------------------------------------------ */
/* 2. Click / auxclick guard                                           */
/* ------------------------------------------------------------------ */

function findAnchor(path) {
  for (const node of path) {
    if (node instanceof Element && node.tagName === 'A' && node.hasAttribute('href')) {
      return node;
    }
  }
  return null;
}

/** A link nobody could physically have clicked. */
function isInvisible(el) {
  try {
    const style = getComputedStyle(el);
    if (style.display === 'none') return true;
    if (style.visibility === 'hidden') return true;
    if (Number(style.opacity) < 0.05) return true;
    if (style.pointerEvents === 'none') return true;

    const rect = el.getBoundingClientRect();
    const offScreen = rect.right < -40 || rect.bottom < -40
      || rect.left > window.innerWidth + 40 || rect.top > window.innerHeight + 40;
    if (offScreen) return true;

    // A 1x1 (or smaller) box that the visitor supposedly hit with a mouse.
    if (rect.width <= 1 && rect.height <= 1) return true;
    return false;
  } catch (_) {
    return false;
  }
}

/**
 * Is the clicked element a transparent layer stacked above a video player?
 * Returns the video element it is covering, or null.
 */
function findCoveredVideo(event, clicked) {
  if (!clicked || clicked.tagName === 'VIDEO') return null;
  let stack;
  try {
    stack = document.elementsFromPoint(event.clientX, event.clientY);
  } catch (_) {
    return null;
  }
  if (!stack?.length) return null;

  const clickedIndex = stack.indexOf(clicked);
  const videoIndex = stack.findIndex((el) => el?.tagName === 'VIDEO');
  if (videoIndex === -1) return null;
  // The video must be *behind* the clicked element.
  if (clickedIndex !== -1 && videoIndex < clickedIndex) return null;

  const video = stack[videoIndex];
  if (!isOverlayLike(clicked, video)) return null;
  return video;
}

function isOverlayLike(el, video) {
  try {
    if (el.contains(video)) return false;
    if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') return false;

    const style = getComputedStyle(el);
    if (style.position !== 'absolute' && style.position !== 'fixed') return false;

    // Real controls (play button, caption toggle) are interactive elements.
    if (el.querySelector('button, [role="button"], input, select, textarea, a[href], video')) return false;
    if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') return false;

    // Meaningful text means it is content, not a hijack layer.
    if ((el.innerText || '').trim().length > 24) return false;

    // Advertising markers make it unambiguous.
    if (el.matches?.(AD_SELECTOR_HINT) || el.querySelector?.(AD_SELECTOR_HINT)) return true;

    const rect = el.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();
    const videoArea = videoRect.width * videoRect.height;
    if (!videoArea || !rect.width || !rect.height) return false;

    const overlapX = Math.max(0, Math.min(rect.right, videoRect.right) - Math.max(rect.left, videoRect.left));
    const overlapY = Math.max(0, Math.min(rect.bottom, videoRect.bottom) - Math.max(rect.top, videoRect.top));
    const coverage = (overlapX * overlapY) / videoArea;

    // Must be empty (no text, no controls) and cover most of the player.
    return coverage > 0.5;
  } catch (_) {
    return false;
  }
}

function neutralizeOverlay(el) {
  try {
    el.setAttribute(OVERLAY_ATTR, 'true');
    el.style.setProperty('pointer-events', 'none', 'important');
  } catch (_) {}
}

/** Re-issue the click on whatever sits underneath the neutralised overlay. */
function forwardClick(event) {
  let target = null;
  try {
    target = document.elementFromPoint(event.clientX, event.clientY);
  } catch (_) {}
  if (!target) return;

  const base = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
    button: 0,
    buttons: 1
  };

  forwarding = true;
  try {
    if (typeof PointerEvent === 'function') {
      target.dispatchEvent(new PointerEvent('pointerdown', base));
    }
    target.dispatchEvent(new MouseEvent('mousedown', base));
    if (typeof PointerEvent === 'function') {
      target.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0 }));
    }
    target.dispatchEvent(new MouseEvent('mouseup', { ...base, buttons: 0 }));
    target.dispatchEvent(new MouseEvent('click', { ...base, buttons: 0 }));
  } catch (_) {}
  setTimeout(() => { forwarding = false; }, 0);
}

function stopEvent(event) {
  try {
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
  } catch (_) {}
}

function onCaptureClick(event) {
  if (!hasLiveExtensionContext()) return;
  if (!active || forwarding) return;
  // The element picker needs to receive the click it was invoked for; blocking
  // it here would make it impossible to pick an ad link or an overlay.
  if (window[PICKER_FLAG]) return;
  if (event.defaultPrevented && !event.isTrusted) return;

  const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
  const clicked = event.target instanceof Element ? event.target : null;
  const onPlayer = rememberPlayerInteraction(event, clicked, path);
  const anchor = findAnchor(path);

  // (a) Hijack overlay sitting on top of a video player.
  const coveredVideo = findCoveredVideo(event, clicked);
  if (coveredVideo) {
    neutralizeOverlay(clicked);
    stopEvent(event);
    report({ cosmetic: 1, total: 1 });
    forwardClick(event);
    return;
  }

  if (!anchor) return;

  const host = normalizeHost(anchor.href);
  const isExternal = host && !sameSite(host, location.hostname);

  // A player control wrapped in a visible external link is the exact technique
  // used by many video sites. Stop the navigation here, before the site handler
  // sees it, even when the destination is too new to be in an ad-host list.
  if (onPlayer && isExternal && guardConfig?.blockFromMedia !== false && !isAuthHost(host, guardConfig?.allowedHosts)) {
    stopEvent(event);
    report({ popups: 1, total: 1 });
    return;
  }

  // (b) A link the visitor could not possibly have clicked.
  if (isInvisible(anchor)) {
    stopEvent(event);
    report({ popups: 1, total: 1 });
    return;
  }

  // (c) A visible link straight to an advertising destination.
  if (isExternal && isKnownAdHost(host)) {
    stopEvent(event);
    report({ popups: 1, total: 1 });
    return;
  }

  // (d) Programmatic click on an external link — the classic auto-popup trick.
  if (!event.isTrusted && isExternal && anchor.target === '_blank') {
    stopEvent(event);
    report({ popups: 1, total: 1 });
  }
}

function onCaptureAuxClick(event) {
  if (!hasLiveExtensionContext()) return;
  if (!active || event.button !== 1) return;
  if (window[PICKER_FLAG]) return;
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
  const clicked = event.target instanceof Element ? event.target : null;
  const onPlayer = rememberPlayerInteraction(event, clicked, path);
  const anchor = findAnchor(path);
  if (!anchor) return;
  if (isInvisible(anchor)) {
    stopEvent(event);
    return;
  }
  const host = normalizeHost(anchor.href);
  if (host && !sameSite(host, location.hostname)
    && ((onPlayer && guardConfig?.blockFromMedia !== false && !isAuthHost(host, guardConfig?.allowedHosts))
      || isKnownAdHost(host))) {
    stopEvent(event);
    report({ popups: 1, total: 1 });
  }
}

/* ------------------------------------------------------------------ */
/* 3. Gesture reporting                                                */
/* ------------------------------------------------------------------ */

function onGesture(event) {
  if (!hasLiveExtensionContext()) return;
  if (!active) return;
  if (window[PICKER_FLAG]) return;

  const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
  const el = event.target instanceof Element ? event.target : null;
  // This is intentionally before the throttled report: window.open can happen
  // synchronously in the same click, and the wrapper needs this flag immediately.
  const onPlayer = rememberPlayerInteraction(event, el, path);
  let anchor = null;
  try {
    anchor = el?.closest?.('a[href]') || null;
  } catch (_) {}

  lastGestureHref = anchor?.href || '';
  lastGestureAt = Date.now();

  const now = Date.now();
  if (now - lastGestureReport < 90) return;
  lastGestureReport = now;

  const gesture = {
    href: anchor?.href || '',
    isLink: Boolean(anchor),
    onOverlay: Boolean(el?.closest?.(`[${OVERLAY_ATTR}]`)),
    onMedia: Boolean(el?.tagName === 'VIDEO' || el?.tagName === 'AUDIO' || el?.closest?.('video, audio')),
    onPlayer
  };

  try {
    chrome.runtime.sendMessage({ type: 'USER_GESTURE', gesture });
  } catch (_) {}
}

function onKeyGesture(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  onGesture(event);
}

/* ------------------------------------------------------------------ */
/* 4. Pop-unders triggered while the page is closing                   */
/* ------------------------------------------------------------------ */

function markUnloading() {
  pageUnloading = true;
}

/* ------------------------------------------------------------------ */
/* Installation                                                        */
/* ------------------------------------------------------------------ */

export function installInteractionGuard({ guard, isActive }) {
  guardConfig = guard || {};
  active = Boolean(isActive);

  installWindowOpenGuard();

  // Listeners are attached unconditionally (each handler exits immediately when
  // the guard is inactive) so a later settings change takes effect without a
  // page reload.
  document.addEventListener('click', onCaptureClick, true);
  document.addEventListener('auxclick', onCaptureAuxClick, true);
  // pointerdown/touchstart happen before a player can synchronously call
  // window.open; mousedown remains for older browsers and mouse-only players.
  document.addEventListener('pointerdown', onGesture, true);
  document.addEventListener('touchstart', onGesture, true);
  document.addEventListener('mousedown', onGesture, true);
  document.addEventListener('auxclick', onGesture, true);
  document.addEventListener('keydown', onKeyGesture, true);

  window.addEventListener('beforeunload', markUnloading, true);
  window.addEventListener('pagehide', markUnloading, true);
}

/** Allow the page to be re-evaluated when settings change. */
export function setGuardActive(next) {
  active = Boolean(next);
}

export function updateGuardConfig(next) {
  guardConfig = next || guardConfig;
}
