/**
 * Element Picker, Hover Preview, and Instant Live Selection Engine
 */
import { isContextValid } from '../core/context.js';
import { DEFAULT_SITE } from '../../shared/defaults.js';

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
  const element = document.querySelector(selector);
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

function showFloatingConfirmation(label, featureText) {
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
  banner.style.border = '1px solid #8d73ff';
  banner.style.font = "13px 'Vazirmatn', system-ui, sans-serif";
  banner.style.boxShadow = '0 8px 30px rgba(0,0,0,0.6), 0 0 15px rgba(141,115,255,0.3)';
  banner.style.zIndex = '2147483647';
  banner.style.display = 'flex';
  banner.style.alignItems = 'center';
  banner.style.gap = '12px';
  banner.style.direction = 'rtl';
  banner.style.animation = 'easyweb-fadein 0.2s ease-out';

  const icon = document.createElement('span');
  icon.textContent = '✓';
  icon.style.background = '#27c8ba';
  icon.style.color = '#0c0d1b';
  icon.style.width = '20px';
  icon.style.height = '20px';
  icon.style.borderRadius = '50%';
  icon.style.display = 'inline-flex';
  icon.style.alignItems = 'center';
  icon.style.justifyContent = 'center';
  icon.style.fontWeight = 'bold';
  icon.style.fontSize = '11px';

  const text = document.createElement('span');
  text.innerHTML = `بخش <b>${label}</b> با موفقیت انتخاب و <b>${featureText}</b> روی آن اعمال شد.`;

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
  }, 4500);
}

export function startPicker(feature, currentSettings, onSelected) {
  if (pickerState) return;
  clearPreviewStyles();

  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.zIndex = '2147483645';
  overlay.style.cursor = 'crosshair';
  overlay.style.pointerEvents = 'none';

  const hint = document.createElement('div');
  const isDir = feature === 'direction';
  hint.textContent = `🎯 EasyWeb: المان مورد نظر را انتخاب کنید (پیش‌نمایش زنده فعال است · Esc برای انصراف)`;
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

  pickerState = { overlay, hint, feature, previous: null, currentSettings, onSelected };

  const move = (event) => {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (!target || target === overlay || target === hint || target === highlightBox) return;

    if (pickerState.previous !== target) {
      clearPreviewStyles();
      pickerState.previous = target;
      highlightElement(selectorFor(target));

      // Live Hover Preview
      if (isDir) {
        target.setAttribute('data-easyweb-preview-dir', 'rtl');
      } else {
        target.setAttribute('data-easyweb-preview-font', 'true');
      }
    }
  };

  const cancel = () => finish(false);
  const click = (event) => {
    event.preventDefault();
    event.stopPropagation();
    finish(true, event.target);
  };

  const finish = (selected, target = pickerState?.previous) => {
    document.removeEventListener('mousemove', move, true);
    document.removeEventListener('click', click, true);
    document.removeEventListener('keydown', keydown, true);
    overlay.remove();
    hint.remove();
    clearHighlight();
    clearPreviewStyles();

    const active = pickerState;
    pickerState = null;

    if (selected && target instanceof Element && isContextValid()) {
      const selector = selectorFor(target);
      const label = target.tagName.toLowerCase() + (target.id ? `#${target.id}` : '');

      // Instant live state modification
      const nextSettings = structuredClone(active.currentSettings || DEFAULT_SITE);
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

      if (active.feature === 'direction') {
        targetObj.direction = {
          ...DEFAULT_SITE.direction,
          enabled: true,
          value: 'rtl',
          scope: 'element',
          selector,
          label
        };
        nextSettings.direction.scope = 'element';
      } else if (active.feature === 'translate') {
        targetObj.translate = {
          ...DEFAULT_SITE.translate,
          enabled: true,
          scope: 'element',
          selector,
          label,
          targetLang: active.currentSettings?.translate?.targetLang || 'fa',
          engine: active.currentSettings?.translate?.engine || 'google'
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

      // 1. Immediately apply to page DOM
      if (typeof active.onSelected === 'function') {
        active.onSelected(targetObj, nextSettings);
      }

      // 2. Show stylish floating confirmation in-page
      const featureLabel = active.feature === 'direction' ? 'راست‌چین' : active.feature === 'translate' ? 'ترجمه' : 'فونت وزیرمتن';
      showFloatingConfirmation(label, featureLabel);

      // 3. Relay to background / popup state
      try {
        chrome.runtime.sendMessage({
          type: 'ELEMENT_PICKED',
          feature: active.feature,
          selector,
          label
        });
      } catch (_) {}
    }
  };

  const keydown = (event) => {
    if (event.key === 'Escape') cancel();
  };

  document.addEventListener('mousemove', move, true);
  document.addEventListener('click', click, true);
  document.addEventListener('keydown', keydown, true);
}
