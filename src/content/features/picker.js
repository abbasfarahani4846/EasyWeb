/**
 * Element Picker, Hover Preview, and Instant Live Selection Engine
 *
 * Two entry points share one session loop:
 *   • startPicker()    — direction / font / translation segment targeting
 *   • startAdPicker()  — mark a section of the page as advertising, to be hidden
 *                        or deleted on every future visit to this site
 */

import { isContextValid } from '../core/context.js';
import { DEFAULT_SITE } from '../../shared/defaults.js';
import { PICKER_FLAG } from '../../shared/constants.js';
import { normalizePickedRule } from '../../shared/adblock.js';

let highlightBox = null;
let pickerState = null;
let activeFloatingBanner = null;

export function clearHighlight() {
  if (highlightBox) {
    highlightBox.remove();
    highlightBox = null;
  }
}

export function clearPreviewStyles() {
  document.querySelectorAll('[data-easyweb-preview-dir]').forEach((el) => el.removeAttribute('data-easyweb-preview-dir'));
  document.querySelectorAll('[data-easyweb-preview-font]').forEach((el) => el.removeAttribute('data-easyweb-preview-font'));
}

export function highlightElement(selector) {
  clearHighlight();
  if (!selector) return;
  let element;
  try {
    element = document.querySelector(selector);
  } catch (_) {
    return;
  }
  if (!element) return;
  const rect = element.getBoundingClientRect();
  const box = document.createElement('div');
  box.style.position = 'fixed';
  box.style.left = `${rect.left}px`;
  box.style.top = `${rect.top}px`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;
  box.style.border = '2px solid #8d73ff';
  box.style.background = 'rgba(141, 115, 255, 0.15)';
  box.style.zIndex = '2147483646';
  box.style.pointerEvents = 'none';
  box.style.transition = 'all 0.1s ease';
  box.style.borderRadius = '4px';
  document.documentElement.appendChild(box);
  highlightBox = box;
}

export function selectorFor(element) {
  if (!element || !(element instanceof Element)) return 'body';
  if (element.id && !/^[0-9]/.test(element.id) && !element.id.includes(':')) {
    return `#${CSS.escape(element.id)}`;
  }
  const parts = [];
  let current = element;
  while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement) {
    if (current.id && !/^[0-9]/.test(current.id) && !current.id.includes(':')) {
      parts.unshift(`#${CSS.escape(current.id)}`);
      break;
    }
    const tag = current.tagName.toLowerCase();
    const classes = Array.from(current.classList || []).filter((c) => !c.startsWith('easyweb-') && !c.includes(':')).slice(0, 2);
    if (classes.length) {
      parts.unshift(`${tag}.${classes.map((c) => CSS.escape(c)).join('.')}`);
    } else {
      let index = 1;
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === current.tagName) index += 1;
        sibling = sibling.previousElementSibling;
      }
      parts.unshift(index > 1 ? `${tag}:nth-of-type(${index})` : tag);
    }
    current = current.parentElement;
    if (parts.length >= 4) break;
  }
  return parts.join(' > ') || 'body';
}

/* ------------------------------------------------------------------ */
/* Advertising-aware selector generation                               */
/* ------------------------------------------------------------------ */

/** Class names that literally read as advertising. */
const AD_CLASS_HINT = /(^|[-_])(ads?|advert\w*|banner|sponsor\w*|promo\w*|commercial|gpt|dfp|google[-_]?ads?|adsbygoogle|taboola|outbrain|mgid|native[-_]?ad|interstitial)([-_]|$)/i;

/** Layout scaffolding — never distinctive enough to target on its own. */
const GENERIC_CLASSES = new Set([
  'container', 'wrapper', 'row', 'col', 'column', 'grid', 'flex', 'inner', 'outer',
  'box', 'item', 'items', 'content', 'main', 'header', 'footer', 'sidebar', 'section',
  'block', 'area', 'panel', 'list', 'text', 'title', 'left', 'right', 'top', 'bottom',
  'center', 'active', 'hidden', 'visible', 'open', 'closed', 'clearfix', 'relative',
  'absolute', 'fixed', 'responsive', 'card', 'media', 'body', 'page', 'site', 'root'
]);

function isUsableClass(cls) {
  if (!cls || cls.length < 3 || cls.length > 64) return false;
  if (/^[0-9]/.test(cls)) return false;
  if (cls.includes(':') || cls.includes('.')) return false;
  if (cls.startsWith('easyweb-')) return false;
  if (GENERIC_CLASSES.has(cls.toLowerCase())) return false;
  return true;
}

/** Does this class name literally read as advertising? (exported for tests) */
export function looksLikeAdClass(cls) {
  return AD_CLASS_HINT.test(String(cls || ''));
}

/** Is this class name specific enough to target on its own? (exported for tests) */
export function usableClass(cls) {
  return isUsableClass(cls);
}

function classCount(cls) {
  try {
    return document.getElementsByClassName(cls).length;
  } catch (_) {
    return 0;
  }
}

/**
 * Pick the class most likely to identify the advertising wrapper.
 * An advertising-looking class wins outright; otherwise the rarest class that
 * is still shared by a handful of nodes (so it generalises past this one element).
 */
export function distinctiveClass(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return '';

  const candidates = [];
  let current = element;
  let depth = 0;
  while (current && current.nodeType === Node.ELEMENT_NODE
    && current !== document.documentElement && depth < 3) {
    for (const cls of current.classList || []) {
      if (isUsableClass(cls)) candidates.push(cls);
    }
    current = current.parentElement;
    depth += 1;
  }

  const unique = [...new Set(candidates)];
  if (!unique.length) return '';

  const adLike = unique
    .filter((cls) => AD_CLASS_HINT.test(cls))
    .map((cls) => ({ cls, count: classCount(cls) }))
    .filter((entry) => entry.count > 0 && entry.count <= 120)
    .sort((a, b) => a.count - b.count);
  if (adLike.length) return adLike[0].cls;

  const ranked = unique
    .map((cls) => ({ cls, count: classCount(cls) }))
    .filter((entry) => entry.count > 0 && entry.count <= 25)
    .sort((a, b) => a.count - b.count);
  return ranked.length ? ranked[0].cls : '';
}

/**
 * A looser selector that still covers the picked element (or an ancestor of it),
 * for when the exact element is re-created with different attributes each load.
 */
export function broadSelectorFor(element) {
  const cls = distinctiveClass(element);
  if (!cls) return '';
  const selector = `.${CSS.escape(cls)}`;
  try {
    const applies = element.matches(selector) || Boolean(element.closest(selector));
    return applies ? selector : '';
  } catch (_) {
    return '';
  }
}

function describeElement(el) {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const cls = el.classList?.[0] ? `.${el.classList[0]}` : '';
  return `${tag}${id}${cls}`.slice(0, 60);
}

/**
 * Does a generated selector actually resolve to the element we picked (or to an
 * ancestor/descendant of it)?
 *
 * Framework-rendered markup (Angular `ng-tns-*`, hashed CSS modules) is often
 * rebuilt between loads, and a class path can end up matching a sibling instead.
 * Without this check the rule would sit in the list and silently do nothing.
 */
export function selectorMatchesElement(selector, element) {
  if (!selector || !element) return false;
  try {
    for (const found of document.querySelectorAll(selector)) {
      if (found === element || found.contains(element) || element.contains(found)) return true;
    }
    return false;
  } catch (_) {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Shared session loop                                                 */
/* ------------------------------------------------------------------ */

/** True for EasyWeb's own injected UI, which must never be pickable. */
function isOwnUi(node) {
  if (!node || !(node instanceof Element)) return false;
  if (node.id && node.id.startsWith('easyweb-')) return true;
  if (node.hasAttribute('data-easyweb-adblock')) return true;
  try {
    return Boolean(node.closest('#easyweb-adblock-toast, #easyweb-floating-confirmation'));
  } catch (_) {
    return false;
  }
}

function showFloatingConfirmation(label, featureText, warning = '') {
  if (activeFloatingBanner) {
    activeFloatingBanner.remove();
    activeFloatingBanner = null;
  }

  const banner = document.createElement('div');
  banner.id = 'easyweb-floating-confirmation';
  banner.style.position = 'fixed';
  banner.style.bottom = '20px';
  banner.style.left = '50%';
  banner.style.transform = 'translateX(-50%)';
  banner.style.background = 'linear-gradient(135deg, #15172b, #1d2038)';
  banner.style.color = '#f7f7ff';
  banner.style.padding = '10px 18px';
  banner.style.borderRadius = '10px';
  banner.style.border = `1px solid ${warning ? '#ffb266' : '#8d73ff'}`;
  banner.style.font = "13px 'Vazirmatn', system-ui, sans-serif";
  banner.style.boxShadow = '0 8px 30px rgba(0,0,0,0.6), 0 0 15px rgba(141,115,255,0.3)';
  banner.style.zIndex = '2147483647';
  banner.style.display = 'flex';
  banner.style.alignItems = 'center';
  banner.style.gap = '12px';
  banner.style.direction = 'rtl';
  banner.style.maxWidth = 'min(560px, 90vw)';
  banner.style.animation = 'easyweb-fadein 0.2s ease-out';

  const icon = document.createElement('span');
  icon.textContent = warning ? '!' : '✓';
  icon.style.background = warning ? '#ffb266' : '#27c8ba';
  icon.style.color = '#0c0d1b';
  icon.style.width = '20px';
  icon.style.height = '20px';
  icon.style.borderRadius = '50%';
  icon.style.display = 'inline-flex';
  icon.style.alignItems = 'center';
  icon.style.justifyContent = 'center';
  icon.style.fontWeight = 'bold';
  icon.style.fontSize = '11px';
  icon.style.flexShrink = '0';

  const text = document.createElement('span');
  text.innerHTML = `بخش <b>${label}</b> با موفقیت انتخاب و <b>${featureText}</b> روی آن اعمال شد.`
    + (warning ? `<br><span style="color:#ffd9a0">${warning}</span>` : '');

  const close = document.createElement('button');
  close.textContent = '✕';
  close.style.background = 'transparent';
  close.style.border = '0';
  close.style.color = '#8f93b3';
  close.style.cursor = 'pointer';
  close.style.fontSize = '12px';
  close.style.padding = '2px 6px';
  close.onclick = () => {
    banner.remove();
    activeFloatingBanner = null;
  };

  banner.append(icon, text, close);
  document.documentElement.appendChild(banner);
  activeFloatingBanner = banner;

  setTimeout(() => {
    if (activeFloatingBanner === banner) {
      banner.style.transition = 'opacity 0.4s ease';
      banner.style.opacity = '0';
      setTimeout(() => banner.remove(), 400);
    }
  }, warning ? 8000 : 4500);
}

/**
 * Run one picking session.
 * @param {{feature:string, hintText:string, previewKind:('dir'|'font'|null), onPick:Function}} options
 */
function runSession({ feature, hintText, previewKind, onPick }) {
  if (pickerState) return;
  clearPreviewStyles();

  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.zIndex = '2147483645';
  overlay.style.cursor = 'crosshair';
  overlay.style.pointerEvents = 'none';

  const hint = document.createElement('div');
  hint.textContent = hintText;
  hint.style.position = 'fixed';
  hint.style.bottom = '20px';
  hint.style.left = '50%';
  hint.style.transform = 'translateX(-50%)';
  hint.style.background = '#15172b';
  hint.style.color = '#f7f7ff';
  hint.style.padding = '9px 16px';
  hint.style.borderRadius = '8px';
  hint.style.border = '1px solid #8d73ff';
  hint.style.font = "12px 'Vazirmatn', system-ui, sans-serif";
  hint.style.boxShadow = '0 6px 25px rgba(0,0,0,0.6)';
  hint.style.zIndex = '2147483647';
  hint.style.pointerEvents = 'none';
  hint.style.direction = 'rtl';

  document.documentElement.appendChild(overlay);
  document.documentElement.appendChild(hint);

  pickerState = { overlay, hint, feature, previous: null, onPick };

  // Tell the popup guard to stand down: it would otherwise swallow the click we
  // need (invisible-link and overlay-hijack detection run in the capture phase).
  window[PICKER_FLAG] = true;

  const move = (event) => {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (!target || target === overlay || target === hint || target === highlightBox) return;
    if (isOwnUi(target)) return;

    if (pickerState.previous !== target) {
      clearPreviewStyles();
      pickerState.previous = target;
      highlightElement(selectorFor(target));

      if (previewKind === 'dir') {
        target.setAttribute('data-easyweb-preview-dir', 'rtl');
      } else if (previewKind === 'font') {
        target.setAttribute('data-easyweb-preview-font', 'true');
      }
    }
  };

  const finish = (selected, target) => {
    document.removeEventListener('mousemove', move, true);
    document.removeEventListener('click', click, true);
    document.removeEventListener('keydown', keydown, true);
    overlay.remove();
    hint.remove();
    clearHighlight();
    clearPreviewStyles();

    const active = pickerState;
    pickerState = null;
    window[PICKER_FLAG] = false;

    if (selected && target instanceof Element && !isOwnUi(target) && isContextValid()) {
      try {
        active.onPick(target);
      } catch (err) {
        console.error('[EasyWeb Picker Error]:', err);
      }
    }
  };

  const cancel = () => finish(false);

  const click = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.target;
    if (isOwnUi(target)) return;
    finish(true, target);
  };

  const keydown = (event) => {
    if (event.key === 'Escape') cancel();
  };

  document.addEventListener('mousemove', move, true);
  document.addEventListener('click', click, true);
  document.addEventListener('keydown', keydown, true);
}

/* ------------------------------------------------------------------ */
/* Direction / font / translation targeting                            */
/* ------------------------------------------------------------------ */

export function startPicker(feature, currentSettings, onSelected) {
  const isDir = feature === 'direction';

  runSession({
    feature,
    hintText: '🎯 EasyWeb: المان مورد نظر را انتخاب کنید (پیش‌نمایش زنده فعال است · Esc برای انصراف)',
    previewKind: isDir ? 'dir' : 'font',
    onPick: (target) => {
      const selector = selectorFor(target);
      const label = target.tagName.toLowerCase() + (target.id ? `#${target.id}` : '');

      // Instant live state modification
      const nextSettings = structuredClone(currentSettings || DEFAULT_SITE);
      if (!Array.isArray(nextSettings.targets)) nextSettings.targets = [];

      const existingIndex = nextSettings.targets.findIndex((t) => t.selector === selector);
      const targetId = existingIndex >= 0 ? nextSettings.targets[existingIndex].id : `t${Math.random().toString(36).slice(2, 8)}`;
      const targetObj = existingIndex >= 0 ? nextSettings.targets[existingIndex] : {
        id: targetId,
        selector,
        label,
        direction: null,
        font: null
      };

      if (feature === 'direction') {
        targetObj.direction = {
          ...DEFAULT_SITE.direction,
          enabled: true,
          value: 'rtl',
          scope: 'element',
          selector,
          label
        };
        nextSettings.direction.scope = 'element';
      } else if (feature === 'translate') {
        targetObj.translate = {
          ...DEFAULT_SITE.translate,
          enabled: true,
          scope: 'element',
          selector,
          label,
          targetLang: currentSettings?.translate?.targetLang || 'fa',
          engine: currentSettings?.translate?.engine || 'google'
        };
        nextSettings.translate.scope = 'element';
      } else {
        targetObj.font = {
          ...DEFAULT_SITE.font,
          enabled: true,
          scope: 'element',
          selector,
          label,
          family: "'Vazirmatn', 'Tahoma', sans-serif",
          size: 16,
          unit: 'px',
          lineHeight: '1.6',
          weight: 400,
          align: 'start'
        };
        nextSettings.font.scope = 'element';
      }

      if (existingIndex >= 0) {
        nextSettings.targets[existingIndex] = targetObj;
      } else {
        nextSettings.targets.push(targetObj);
      }
      nextSettings.enabled = true;

      if (typeof onSelected === 'function') onSelected(targetObj, nextSettings);

      const featureLabel = feature === 'direction' ? 'راست‌چین' : feature === 'translate' ? 'ترجمه' : 'فونت وزیرمتن';
      showFloatingConfirmation(label, featureLabel);

      try {
        chrome.runtime.sendMessage({
          type: 'ELEMENT_PICKED',
          feature,
          selector,
          label
        });
      } catch (_) {}
    }
  });
}

/* ------------------------------------------------------------------ */
/* Ad-section picking                                                  */
/* ------------------------------------------------------------------ */

/**
 * Let the user mark a section of the page as advertising.
 *
 * @param {object} currentSettings  the site's current settings object
 * @param {'hide'|'remove'} mode    how the section should be neutralised
 * @param {Function} onSelected     called with (rule, nextSettings)
 */
export function startAdPicker(currentSettings, mode, onSelected) {
  const normalizedMode = mode === 'remove' ? 'remove' : 'hide';

  runSession({
    feature: 'adblock',
    hintText: normalizedMode === 'remove'
      ? '🛡 EasyWeb: روی بخش تبلیغاتی کلیک کنید تا کامل حذف شود · Esc برای انصراف'
      : '🛡 EasyWeb: روی بخش تبلیغاتی کلیک کنید تا مخفی شود · Esc برای انصراف',
    previewKind: null,
    onPick: (target) => {
      let selector = selectorFor(target);
      let broad = broadSelectorFor(target);
      let warning = '';

      // If the precise selector does not resolve to what was clicked (dynamic
      // framework class names, re-rendered containers) fall back to the broader
      // one, otherwise the rule would be stored and silently do nothing.
      if (!selectorMatchesElement(selector, target)) {
        if (broad && selectorMatchesElement(broad, target)) {
          selector = broad;
          broad = '';
          warning = 'سلکتور دقیق پایدار نبود؛ از سلکتور گسترده استفاده شد.';
        } else {
          warning = 'هشدار: این سلکتور همین حالا هم در صفحه پیدا نشد. ممکن است پس از رفرش کار نکند.';
        }
      }

      const label = describeElement(target);

      const rule = normalizePickedRule({
        selector,
        broad,
        label,
        mode: normalizedMode,
        enabled: true
      });
      if (!rule) return;

      const nextSettings = structuredClone(currentSettings || DEFAULT_SITE);
      if (!nextSettings.blocker || typeof nextSettings.blocker !== 'object') {
        nextSettings.blocker = { enabled: true, mode: 'inherit', toggles: null, picked: [] };
      }
      if (!Array.isArray(nextSettings.blocker.picked)) nextSettings.blocker.picked = [];

      // Re-picking the same element replaces the previous rule instead of stacking.
      nextSettings.blocker.picked = nextSettings.blocker.picked
        .filter((existing) => existing?.selector !== selector);
      nextSettings.blocker.picked.push(rule);
      nextSettings.blocker.enabled = true;

      if (typeof onSelected === 'function') onSelected(rule, nextSettings);

      showFloatingConfirmation(
        label,
        normalizedMode === 'remove' ? 'حذف کامل' : 'مخفی‌سازی',
        warning
      );

      try {
        chrome.runtime.sendMessage({
          type: 'ELEMENT_PICKED',
          feature: 'adblock',
          selector,
          broad,
          label,
          mode: normalizedMode,
          ruleId: rule.id
        });
      } catch (_) {}
    }
  });
}
