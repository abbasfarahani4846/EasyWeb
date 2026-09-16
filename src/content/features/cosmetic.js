/**
 * EasyWeb Ad Blocker — Cosmetic Filtering
 *
 * Hides advertising containers with a `display:none !important` stylesheet and
 * keeps up with dynamically injected ads through a debounced DOM sweep.
 * The stylesheet can be injected as early as `document_start` (from guard.js) so
 * ads never get a chance to flash before the page paints.
 *
 * Two kinds of rule are applied:
 *   • catalogue + custom selectors  → hidden
 *   • sections the user picked with the element picker → hidden, or (in
 *     "remove" mode) deleted from the DOM and re-deleted if the page puts
 *     them back.
 *
 * Everything applied here is reversible. Hiding records the element's original
 * `style` attribute, and deleting keeps the detached node plus its position, so
 * that removing or disabling a rule (or turning cosmetic filtering off) restores
 * the page instead of leaving elements hidden forever.
 */

import {
  ADBLOCK_STYLE_ID,
  ADBLOCK_FLAG_ATTR,
  ADBLOCK_PREV_STYLE_ATTR
} from '../../shared/constants.js';
import {
  buildCosmeticCss,
  BASE_COSMETIC_SELECTORS,
  ANNOYANCE_SELECTORS,
  extractCosmeticRules,
  activePickedSelector
} from '../../shared/adblock.js';
import { profileForHost } from '../../shared/inject-profiles.js';

/** Elements we are comfortable deleting outright rather than merely hiding. */
const REMOVABLE_TAGS = new Set(['IFRAME', 'INS', 'EMBED', 'OBJECT']);

/** Never delete these, no matter what the user picked — it would blank the page. */
const UNREMOVABLE_TAGS = new Set(['HTML', 'HEAD', 'BODY']);

/** Upper bound on how many detached nodes we hold for restoration. */
const MAX_REMEMBERED_REMOVALS = 200;

let observer = null;
let sweepTimer = null;
let reportTimer = null;
let hideSelectorText = '';
let removeSelectorText = '';
let hiddenCount = 0;
let reportCallback = null;
let removeFrames = true;
let onCountChange = null;

/** Detached nodes, kept so that a deleted rule can bring them back. */
const removedNodes = [];

function getStyleElement() {
  let el = document.getElementById(ADBLOCK_STYLE_ID);
  if (!el) {
    el = document.createElement('style');
    el.id = ADBLOCK_STYLE_ID;
    el.setAttribute(ADBLOCK_FLAG_ATTR, 'style');
    (document.head || document.documentElement).appendChild(el);
  }
  return el;
}

/** A selector is only usable if the browser can actually parse it. */
function isValidSelector(selector) {
  try {
    document.querySelector(selector);
    return true;
  } catch (_) {
    return false;
  }
}

/** Join selectors into one query, dropping anything unparseable. */
function combineSelectors(selectors) {
  const usable = selectors.filter((s) => s && isValidSelector(s));
  return usable.length ? usable.join(',\n') : '';
}

/**
 * Write (or clear) the cosmetic stylesheet.
 * @param {{toggles:object, config:object, customRules?:string[], picked?:Array}} options
 */
export function injectCosmeticCss({ toggles, config, customRules = [], picked = [] }) {
  try {
    if (!toggles?.cosmetic) {
      document.getElementById(ADBLOCK_STYLE_ID)?.remove();
      document.documentElement.removeAttribute(ADBLOCK_FLAG_ATTR);
      return false;
    }

    const extraSelectors = [
      ...(config?.customSelectors || []),
      ...extractCosmeticRules(customRules)
    ];

    const css = buildCosmeticCss({
      customSelectors: extraSelectors,
      includeAnnoyances: Boolean(toggles.annoyances),
      collapseEmptySlots: config?.cosmetic?.collapseEmptySlots !== false,
      picked
    });

    const style = getStyleElement();
    if (style.textContent !== css) style.textContent = css;
    document.documentElement.setAttribute(ADBLOCK_FLAG_ATTR, 'on');
    return true;
  } catch (_) {
    return false;
  }
}

/** Host of the current page, or '' when there is no DOM context. */
function currentHost() {
  try {
    return typeof location !== 'undefined' ? location.hostname : '';
  } catch (_) {
    return '';
  }
}

/** Selectors from the built-in catalogue plus the user's own custom selectors. */
function buildHideSelectors({ toggles, config, customRules }) {
  const selectors = [...BASE_COSMETIC_SELECTORS];
  if (toggles?.annoyances) selectors.push(...ANNOYANCE_SELECTORS);
  selectors.push(...(config?.customSelectors || []));
  selectors.push(...extractCosmeticRules(customRules));

  // Site-specific containers (YouTube ad overlays and cards, Spotify banners).
  // Only added where they can actually match, so other sites do not pay for them.
  const profile = profileForHost(currentHost());
  if (profile?.selectors?.length) selectors.push(...profile.selectors);

  return [...new Set(selectors.filter(Boolean))];
}

/** Selectors the user explicitly asked to delete from the DOM. */
function buildRemoveSelectors(picked = []) {
  return [...new Set(
    picked
      .filter((rule) => rule?.enabled !== false && rule?.mode === 'remove')
      .map((rule) => activePickedSelector(rule))
      .filter(Boolean)
  )];
}

/** Everything the picker marked as "hide" (the default mode). */
function buildPickedHideSelectors(picked = []) {
  return [...new Set(
    picked
      .filter((rule) => rule?.enabled !== false && rule?.mode !== 'remove')
      .map((rule) => activePickedSelector(rule))
      .filter(Boolean)
  )];
}

function countAndNotify() {
  if (onCountChange) onCountChange(hiddenCount);
}

/* ------------------------------------------------------------------ */
/* Reversible hiding                                                   */
/* ------------------------------------------------------------------ */

/** Remember the element's original inline style before we override it. */
function rememberStyle(el) {
  if (el.hasAttribute(ADBLOCK_PREV_STYLE_ATTR)) return;
  el.setAttribute(ADBLOCK_PREV_STYLE_ATTR, el.getAttribute('style') || '');
}

/** Remember a detached node and where it came from. */
function rememberRemoval(node) {
  const parent = node.parentNode;
  if (!parent) return;
  removedNodes.push({ node, parent, next: node.nextSibling });
  if (removedNodes.length > MAX_REMEMBERED_REMOVALS) removedNodes.shift();
}

function detach(el) {
  rememberRemoval(el);
  el.setAttribute(ADBLOCK_FLAG_ATTR, 'removed');
  el.remove();
}

/** Put back every element we hid, restoring its exact original inline style. */
export function restoreHiddenElements() {
  let restored = 0;
  let nodes;
  try {
    nodes = document.querySelectorAll(`[${ADBLOCK_FLAG_ATTR}="hidden"]`);
  } catch (_) {
    return 0;
  }

  for (const el of nodes) {
    const saved = el.getAttribute(ADBLOCK_PREV_STYLE_ATTR);
    el.removeAttribute(ADBLOCK_FLAG_ATTR);
    if (saved !== null) {
      if (saved) el.setAttribute('style', saved);
      else el.removeAttribute('style');
      el.removeAttribute(ADBLOCK_PREV_STYLE_ATTR);
    } else {
      // Defensive: we hid it without recording the original.
      el.style.removeProperty('display');
      el.style.removeProperty('pointer-events');
    }
    restored += 1;
  }
  return restored;
}

/** Re-attach everything we deleted, as close to its original position as we can. */
export function restoreRemovedNodes() {
  let restored = 0;
  while (removedNodes.length) {
    const entry = removedNodes.pop();
    try {
      if (entry.next && entry.next.parentNode === entry.parent) {
        entry.parent.insertBefore(entry.node, entry.next);
      } else {
        entry.parent.appendChild(entry.node);
      }
      entry.node.removeAttribute(ADBLOCK_FLAG_ATTR);
      restored += 1;
    } catch (_) {
      // The page moved on and the original parent is gone — nothing to restore.
    }
  }
  return restored;
}

/**
 * Undo everything the cosmetic engine did. Called before re-applying settings so
 * that a deleted or disabled rule stops hiding its elements.
 */
export function restoreCosmetic() {
  return restoreHiddenElements() + restoreRemovedNodes();
}

/* ------------------------------------------------------------------ */
/* Sweeps                                                             */
/* ------------------------------------------------------------------ */

/** Remove the nodes the user asked to delete. */
function removalPass() {
  if (!removeSelectorText) return 0;
  let touched = 0;
  let matches;
  try {
    matches = document.querySelectorAll(removeSelectorText);
  } catch (_) {
    return 0;
  }
  for (const el of matches) {
    if (touched > 300) break;
    if (el.hasAttribute(ADBLOCK_FLAG_ATTR)) continue;
    // Deleting the document root or the body would blank the whole page.
    if (UNREMOVABLE_TAGS.has(el.tagName)) continue;
    detach(el);
    touched += 1;
    hiddenCount += 1;
  }
  return touched;
}

/** Hide everything else the stylesheet may have missed. */
function hidePass() {
  if (!hideSelectorText) return 0;
  let touched = 0;
  let matches;
  try {
    matches = document.querySelectorAll(hideSelectorText);
  } catch (_) {
    return 0;
  }
  for (const el of matches) {
    if (touched > 400) break;
    if (el.hasAttribute(ADBLOCK_FLAG_ATTR)) continue;
    if (el.id === ADBLOCK_STYLE_ID) continue;

    if (removeFrames && REMOVABLE_TAGS.has(el.tagName)) {
      detach(el);
      touched += 1;
      hiddenCount += 1;
      continue;
    }

    if (el.getAttribute(ADBLOCK_FLAG_ATTR) === 'hidden') continue;
    rememberStyle(el);
    el.setAttribute(ADBLOCK_FLAG_ATTR, 'hidden');
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
    touched += 1;
    hiddenCount += 1;
  }
  return touched;
}

/**
 * One pass over the document. Removal runs first so that deleted nodes never
 * reach the hide pass.
 */
function sweep() {
  if (!hideSelectorText && !removeSelectorText) return 0;
  const touched = removalPass() + hidePass();
  if (touched) countAndNotify();
  return touched;
}

/** Run a sweep immediately instead of waiting for the debounce. */
export function sweepNow() {
  if (sweepTimer) {
    clearTimeout(sweepTimer);
    sweepTimer = null;
  }
  try {
    return sweep();
  } catch (_) {
    return 0;
  }
}

function scheduleSweep() {
  if (sweepTimer) return;
  sweepTimer = setTimeout(() => {
    sweepTimer = null;
    try {
      sweep();
    } catch (_) {}
  }, 350);
}

function scheduleReport() {
  if (!reportCallback || reportTimer) return;
  reportTimer = setTimeout(() => {
    reportTimer = null;
    const pending = hiddenCount - (scheduleReport.reported || 0);
    if (pending <= 0) return;
    scheduleReport.reported = hiddenCount;
    reportCallback(pending);
  }, 2500);
}
scheduleReport.reported = 0;

function attachObserver() {
  if (observer || typeof MutationObserver === 'undefined') return;
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes?.length) {
        scheduleSweep();
        return;
      }
    }
  });
  try {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}
}

/** Install the long-lived engine (observer + periodic sweep). */
export function startCosmeticEngine({ toggles, config, customRules = [], picked = [], onCount }) {
  reportCallback = typeof onCount === 'function' ? onCount : null;
  removeFrames = config?.cosmetic?.hideAdFrames !== false;

  if (!toggles?.cosmetic) {
    stopCosmeticEngine();
    return;
  }

  hideSelectorText = combineSelectors([
    ...buildHideSelectors({ toggles, config, customRules }),
    ...buildPickedHideSelectors(picked)
  ]);
  removeSelectorText = combineSelectors(buildRemoveSelectors(picked));

  attachObserver();
  scheduleSweep();

  // Some pages swap content in long after load without a clean mutation burst.
  if (!startCosmeticEngine.timer) {
    startCosmeticEngine.timer = setInterval(() => {
      scheduleSweep();
      scheduleReport();
    }, 12000);
  }
}
startCosmeticEngine.timer = null;

/** Tear the engine down and put the page back the way we found it. */
export function stopCosmeticEngine() {
  if (observer) {
    try { observer.disconnect(); } catch (_) {}
    observer = null;
  }
  if (sweepTimer) {
    clearTimeout(sweepTimer);
    sweepTimer = null;
  }
  if (reportTimer) {
    clearTimeout(reportTimer);
    reportTimer = null;
  }
  if (startCosmeticEngine.timer) {
    clearInterval(startCosmeticEngine.timer);
    startCosmeticEngine.timer = null;
  }
  hideSelectorText = '';
  removeSelectorText = '';
  restoreCosmetic();
  document.getElementById(ADBLOCK_STYLE_ID)?.remove();
  document.documentElement.removeAttribute(ADBLOCK_FLAG_ATTR);
}

export function cosmeticCount() {
  return hiddenCount;
}
