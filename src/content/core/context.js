/**
 * Content Script Context Validator, Injection Gate and Cleanup Guard
 */

import {
  VERSION,
  RUNTIME_STYLE_ID,
  TEXT_CLASS,
  DIRECTION_ATTR,
  ADBLOCK_STYLE_ID
} from '../../shared/constants.js';

/** Per-frame marker holding the running instance and a liveness probe. */
export const INSTANCE_KEY = '__easywebInstance';

export function isContextValid() {
  try {
    return Boolean(typeof chrome !== 'undefined' && chrome?.runtime && chrome.runtime.id);
  } catch (_) {
    return false;
  }
}

/**
 * Build a probe that reports whether the context which created it is still
 * usable.
 *
 * `chrome.runtime.getURL` throws "Extension context invalidated" as soon as the
 * extension is reloaded and the old content script is orphaned. That is the only
 * reliable way to tell a *live* previous injection from a *dead* one — and the
 * difference matters enormously: treating a dead instance as live means a
 * re-injected script refuses to start, leaving the page with no content script
 * at all until the user refreshes.
 */
export function makeLivenessProbe() {
  return function probe() {
    if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
      throw new Error('extension-context-invalid');
    }
    chrome.runtime.getURL('');
    return true;
  };
}

/** Is a previously stored instance still running and from this version? */
export function isInstanceAlive(instance, version = VERSION) {
  if (!instance || instance.version !== version) return false;
  try {
    return instance.isAlive() === true;
  } catch (_) {
    return false;
  }
}

/**
 * Claim a per-frame slot (the content script, or the document_start guard).
 * Returns true when the caller may install, false when a live instance of the
 * same version already owns it.
 */
export function claimInstance(key = INSTANCE_KEY, version = VERSION) {
  if (isInstanceAlive(window[key], version)) return false;
  window[key] = { version, isAlive: makeLivenessProbe() };
  return true;
}

/** Undo the DOM changes a previous *version* left behind. */
function clearPreviousDom() {
  document.getElementById(RUNTIME_STYLE_ID)?.remove();
  document.getElementById(ADBLOCK_STYLE_ID)?.remove();
  document.getElementById('easyweb-adblock-ui-style')?.remove();

  document.querySelectorAll(`.${TEXT_CLASS}`).forEach((node) => {
    const parent = node.parentNode;
    if (parent) parent.replaceChild(document.createTextNode(node.textContent || ''), node);
  });
  document.querySelectorAll(`[${DIRECTION_ATTR}]`).forEach((node) => {
    node.removeAttribute(DIRECTION_ATTR);
    node.style.removeProperty('direction');
    node.style.removeProperty('text-align');
  });
  document.documentElement.removeAttribute(DIRECTION_ATTR);
  document.documentElement.style.removeProperty('direction');
  document.documentElement.style.removeProperty('text-align');
  if (document.body) {
    document.body.removeAttribute(DIRECTION_ATTR);
    document.body.style.removeProperty('direction');
    document.body.style.removeProperty('text-align');
  }
}

/**
 * Returns true when this content script should run.
 *
 * False only when a live instance of the same version is already running, which
 * makes a double injection harmless. A dead instance (the extension was
 * reloaded) or one from an older version is replaced.
 */
export function cleanupStaleInjections() {
  const previous = window[INSTANCE_KEY];
  if (isInstanceAlive(previous)) return false;

  // Only strip the page when the conventions may have changed between versions.
  // For a same-version takeover the apply path restores and re-applies anyway.
  if (previous && previous.version !== VERSION) clearPreviousDom();

  window[INSTANCE_KEY] = { version: VERSION, isAlive: makeLivenessProbe() };
  return true;
}
