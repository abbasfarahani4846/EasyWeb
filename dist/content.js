(() => {
// --- Module: shared/constants.js ---
/**
 * Shared Application Constants
 */
const VERSION = '10';
const STORAGE_KEY = 'settings';
const TEXT_CLASS = 'easyweb-text-node';
const ROOT_ATTR = 'data-easyweb-font-root';
const DIRECTION_ATTR = 'data-easyweb-direction';
const RUNTIME_STYLE_ID = 'easyweb-runtime-style';

// --- Module: shared/defaults.js ---
/**
 * Shared Default Configurations and Font Definitions
 */
const DEFAULT_SITE = {
  enabled: false,
  direction: {
    enabled: false,
    value: 'rtl',
    scope: 'page',
    selector: '',
    label: ''
  },
  font: {
    enabled: false,
    scope: 'page',
    selector: '',
    label: '',
    family: "'Vazirmatn', 'Tahoma', sans-serif",
    size: 16,
    unit: 'px',
    lineHeight: '1.6',
    weight: '400',
    align: 'start'
  },
  translate: {
    enabled: false,
    scope: 'page',
    selector: '',
    label: '',
    targetLang: 'fa',
    engine: 'google',
    tone: 'standard',
    customPrompt: ''
  },
  targets: []
};
const TRANSLATION_TONES = [
  { id: 'standard', name: 'روان و طبیعی (پیش‌فرض)' },
  { id: 'formal', name: 'رسمی و تخصصی' },
  { id: 'colloquial', name: 'صمیمی و محاوره‌ای' },
  { id: 'literal', name: 'کلمه‌به‌کلمه و دقیق' },
  { id: 'simplified', name: 'ساده‌سازی شده' },
  { id: 'custom', name: 'پرامپت سفارشی...' }
];
const SUPPORTED_LANGUAGES = [
  { code: 'fa', name: 'فارسی (Persian)' },
  { code: 'en', name: 'English' },
  { code: 'ar', name: 'العربية (Arabic)' },
  { code: 'fr', name: 'Français (French)' },
  { code: 'de', name: 'Deutsch (German)' },
  { code: 'es', name: 'Español (Spanish)' },
  { code: 'tr', name: 'Türkçe (Turkish)' },
  { code: 'ru', name: 'Русский (Russian)' },
  { code: 'zh', name: '中文 (Chinese)' },
  { code: 'ja', name: '日本語 (Japanese)' },
  { code: 'it', name: 'Italiano (Italian)' }
];
const DEFAULT_FONTS = [
  { name: 'Vazirmatn (فارسی)', family: "'Vazirmatn', 'Tahoma', sans-serif" },
  { name: 'Estedad (فارسی)', family: "'Estedad', 'Tahoma', sans-serif" },
  { name: 'Sahel (فارسی)', family: "'Sahel', 'Tahoma', sans-serif" },
  { name: 'Lalezar (فارسی)', family: "'Lalezar', 'Tahoma', sans-serif" }
];
const BUNDLED_FONTS = [
  { name: 'Vazirmatn', family: 'Vazirmatn', file: 'assets/fonts/Vazirmatn-Regular.woff2', format: 'woff2' },
  { name: 'Estedad', family: 'Estedad', file: 'assets/fonts/Estedad-Regular.woff2', format: 'woff2' },
  { name: 'Sahel', family: 'Sahel', file: 'assets/fonts/Sahel-Regular.woff2', format: 'woff2' },
  { name: 'Lalezar', family: 'Lalezar', file: 'assets/fonts/Lalezar-Regular.woff2', format: 'woff2' }
];
const DEFAULTS = {
  settings: {},
  fonts: [],
  bundledFonts: BUNDLED_FONTS,
  providers: [],
  customTools: [],
  chatHistory: {},
  detect: { threshold: 0.2, extraFonts: [] }
};

// --- Module: shared/domain.js ---
/**
 * Domain & URL Parsing Utilities
 */

/**
 * Extract clean hostname from URL or hostname string (e.g., "gemini.google.com", "chatgpt.com").
 * Strips leading/trailing dots and "www." prefix while preserving specific subdomains.
 */
function cleanHostname(input = '') {
  try {
    const raw = String(input || '').includes('://') ? new URL(input).hostname : input;
    return String(raw || '').replace(/^\.+|\.+$/g, '').toLowerCase().replace(/^www\./, '');
  } catch (_) {
    return String(input || '').replace(/^\.+|\.+$/g, '').toLowerCase().replace(/^www\./, '');
  }
}

/**
 * Extract hostname from any URL string cleanly
 */
function hostnameFromUrl(url = '') {
  return cleanHostname(url);
}

// --- Module: shared/models.js ---
/**
 * Site Model, State Synchronization and Migration Helpers
 */
function mergeSite(value = {}) {
  return {
    enabled: Boolean(value?.enabled),
    direction: { ...DEFAULT_SITE.direction, ...(value?.direction || {}) },
    font: { ...DEFAULT_SITE.font, ...(value?.font || {}) },
    translate: { ...DEFAULT_SITE.translate, ...(value?.translate || {}) },
    targets: Array.isArray(value?.targets) ? value.targets.map((t) => ({
      id: t.id || `t${Math.random().toString(36).slice(2, 8)}`,
      selector: t.selector || '',
      label: t.label || t.selector || 'Element',
      direction: t.direction ? { ...DEFAULT_SITE.direction, ...t.direction } : null,
      font: t.font ? { ...DEFAULT_SITE.font, ...t.font } : null,
      translate: t.translate ? { ...DEFAULT_SITE.translate, ...t.translate } : null
    })) : []
  };
}
function migrateSite(value) {
  const merged = mergeSite(value);

  if (value?.direction?.scope === 'element' && value.direction.selector && !merged.targets.some((t) => t.selector === value.direction.selector)) {
    merged.targets.push({
      id: `t${Math.random().toString(36).slice(2, 8)}`,
      selector: value.direction.selector,
      label: value.direction.label || value.direction.selector,
      direction: { ...DEFAULT_SITE.direction, ...value.direction },
      font: null,
      translate: null
    });
  }

  if (value?.font?.scope === 'element' && value.font.selector) {
    const existing = merged.targets.find((t) => t.selector === value.font.selector);
    if (existing) {
      existing.font = { ...DEFAULT_SITE.font, ...value.font };
    } else {
      merged.targets.push({
        id: `t${Math.random().toString(36).slice(2, 8)}`,
        selector: value.font.selector,
        label: value.font.label || value.font.selector,
        direction: null,
        font: { ...DEFAULT_SITE.font, ...value.font },
        translate: null
      });
    }
  }

  if (value?.translate?.scope === 'element' && value.translate.selector) {
    const existing = merged.targets.find((t) => t.selector === value.translate.selector);
    if (existing) {
      existing.translate = { ...DEFAULT_SITE.translate, ...value.translate };
    } else {
      merged.targets.push({
        id: `t${Math.random().toString(36).slice(2, 8)}`,
        selector: value.translate.selector,
        label: value.translate.label || value.translate.selector,
        direction: null,
        font: null,
        translate: { ...DEFAULT_SITE.translate, ...value.translate }
      });
    }
  }

  merged.direction.scope = value?.direction?.scope || (merged.targets.some((t) => t.direction?.enabled) ? 'element' : 'page');
  merged.font.scope = value?.font?.scope || (merged.targets.some((t) => t.font?.enabled) ? 'element' : 'page');
  merged.translate.scope = value?.translate?.scope || (merged.targets.some((t) => t.translate?.enabled) ? 'element' : 'page');

  if (value && value.enabled === undefined) {
    const dirActive = merged.direction.scope === 'page' ? merged.direction.enabled : merged.targets.some((t) => t.direction?.enabled);
    const fontActive = merged.font.scope === 'page' ? merged.font.enabled : merged.targets.some((t) => t.font?.enabled);
    const transActive = merged.translate.scope === 'page' ? merged.translate.enabled : merged.targets.some((t) => t.translate?.enabled);
    merged.enabled = dirActive || fontActive || transActive;
  }
  return merged;
}
function syncSiteEnabled(site) {
  const dirScope = site.direction.scope || 'page';
  const fontScope = site.font.scope || 'page';
  const transScope = site.translate?.scope || 'page';

  const dirActive = dirScope === 'page' ? site.direction.enabled : site.targets.some((t) => t.direction?.enabled);
  const fontActive = fontScope === 'page' ? site.font.enabled : site.targets.some((t) => t.font?.enabled);
  const transActive = transScope === 'page' ? site.translate?.enabled : site.targets.some((t) => t.translate?.enabled);

  site.enabled = dirActive || fontActive || transActive;
  return site.enabled;
}

// --- Module: content/core/context.js ---
/**
 * Content Script Context Validator and Cleanup Guard
 */
function isContextValid() {
  try {
    return Boolean(typeof chrome !== 'undefined' && chrome?.runtime && chrome.runtime.id);
  } catch (_) {
    return false;
  }
}
function cleanupStaleInjections() {
  if (window.__easywebInjected === VERSION) return false;
  if (window.__easywebInjected) {
    document.getElementById(RUNTIME_STYLE_ID)?.remove();
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
  window.__easywebInjected = VERSION;
  return true;
}

// --- Module: content/core/style-engine.js ---
/**
 * Runtime Style Engine and Font-Face CSS Generator
 */


let styleElement = null;
function getStyleElement() {
  if (!styleElement || !styleElement.isConnected) {
    styleElement = document.getElementById(RUNTIME_STYLE_ID);
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = RUNTIME_STYLE_ID;
      document.documentElement.appendChild(styleElement);
    }
  }
  return styleElement;
}
function buildFontFacesCss(uploadedFonts = [], bundledFonts = []) {
  if (!isContextValid()) return '';
  const uploaded = uploadedFonts.map((f) => {
    const format = f.format || (f.type?.includes('woff2') ? 'woff2' : f.type?.includes('woff') ? 'woff' : 'truetype');
    return `@font-face{font-family:'${String(f.name).replace(/'/g, "\\'")}';src:url(${f.data}) format('${format}');font-display:swap;}`;
  }).join('');

  const bundled = bundledFonts.map((f) => {
    try {
      const url = chrome.runtime.getURL(f.file);
      return `@font-face{font-family:'${String(f.family || f.name).replace(/'/g, "\\'")}';src:url(${url}) format('${f.format || 'woff2'}');font-display:swap;}`;
    } catch (_) {
      return '';
    }
  }).join('');

  return uploaded + bundled;
}
function getDirectionBaseCss() {
  return `
    /* Direction base styling */
    [data-easyweb-direction="rtl"] {
      direction: rtl !important;
      text-align: right !important;
    }
    [data-easyweb-direction="rtl"] p,
    [data-easyweb-direction="rtl"] div,
    [data-easyweb-direction="rtl"] h1,
    [data-easyweb-direction="rtl"] h2,
    [data-easyweb-direction="rtl"] h3,
    [data-easyweb-direction="rtl"] h4,
    [data-easyweb-direction="rtl"] h5,
    [data-easyweb-direction="rtl"] h6,
    [data-easyweb-direction="rtl"] blockquote,
    [data-easyweb-direction="rtl"] article,
    [data-easyweb-direction="rtl"] section {
      text-align: right !important;
    }

    /* Fixed Lists and Bullet Points in RTL */
    [data-easyweb-direction="rtl"] ul,
    [data-easyweb-direction="rtl"] ol {
      direction: rtl !important;
      text-align: right !important;
      padding-right: 1.75em !important;
      padding-left: 0 !important;
      margin-right: 0 !important;
    }
    [data-easyweb-direction="rtl"] li {
      direction: rtl !important;
      text-align: right !important;
      margin-right: 0 !important;
    }
    [data-easyweb-direction="rtl"] li::marker {
      direction: rtl !important;
      unicode-bidi: isolate !important;
    }

    /* Fixed LTR code blocks and inline code badges */
    [data-easyweb-direction="rtl"] pre,
    [data-easyweb-direction="rtl"] code,
    [data-easyweb-direction="rtl"] kbd,
    [data-easyweb-direction="rtl"] samp,
    [data-easyweb-direction="rtl"] pre *,
    [data-easyweb-direction="rtl"] code * {
      direction: ltr !important;
      text-align: left !important;
      unicode-bidi: isolate !important;
    }
    [data-easyweb-direction="rtl"] code {
      display: inline-block;
      direction: ltr !important;
      text-align: left !important;
      unicode-bidi: isolate !important;
      margin: 0 2px;
      vertical-align: baseline;
    }

    /* LTR base */
    [data-easyweb-direction="ltr"] {
      direction: ltr !important;
      text-align: left !important;
    }
    [data-easyweb-direction="ltr"] ul,
    [data-easyweb-direction="ltr"] ol {
      direction: ltr !important;
      text-align: left !important;
      padding-left: 1.75em !important;
      padding-right: 0 !important;
    }

    /* Live Hover Preview Styles */
    [data-easyweb-preview-dir="rtl"] {
      direction: rtl !important;
      text-align: right !important;
    }
    [data-easyweb-preview-dir="rtl"] p,
    [data-easyweb-preview-dir="rtl"] li,
    [data-easyweb-preview-dir="rtl"] div {
      text-align: right !important;
    }
    [data-easyweb-preview-font="true"],
    [data-easyweb-preview-font="true"] * {
      font-family: 'Vazirmatn', 'Tahoma', sans-serif !important;
    }
  `;
}

// --- Module: content/features/direction.js ---
/**
 * Direction (RTL / LTR) Controller and Restoration
 */

const directionSnapshots = new Map();
function cleanDirection(node) {
  if (!node) return;
  node.removeAttribute(DIRECTION_ATTR);
  node.style.removeProperty('direction');
  node.style.removeProperty('text-align');
}
function restoreAllDirections() {
  directionSnapshots.forEach((original, node) => {
    if (original === null) node.removeAttribute('dir');
    else node.setAttribute('dir', original);
    cleanDirection(node);
  });
  directionSnapshots.clear();

  document.querySelectorAll(`[${DIRECTION_ATTR}]`).forEach((node) => {
    cleanDirection(node);
  });
  cleanDirection(document.documentElement);
  if (document.body) cleanDirection(document.body);
}
function applyDirectionToRoot(root, value) {
  if (!root) return;
  if (!directionSnapshots.has(root)) {
    directionSnapshots.set(root, root.getAttribute('dir'));
  }
  root.setAttribute('dir', value);
  root.setAttribute(DIRECTION_ATTR, value);
  root.style.setProperty('direction', value, 'important');
  root.style.setProperty('text-align', value === 'rtl' ? 'right' : 'left', 'important');
}

// --- Module: content/features/typography.js ---
/**
 * Typography Application, Dynamic Text Protection and Scoped CSS Generator
 */
function getElements(selector) {
  if (!selector) return [];
  try {
    const list = document.querySelectorAll(selector);
    if (list.length > 0) return Array.from(list);
  } catch (_) {}
  try {
    const segments = selector.split(/[ >+~]+/).filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      const fallback = segments[i];
      if (fallback && !fallback.includes(':')) {
        const list = document.querySelectorAll(fallback);
        if (list.length > 0) return Array.from(list);
      }
    }
  } catch (_) {}
  return [];
}
function restoreTextNodes() {
  document.querySelectorAll(`[${ROOT_ATTR}]`).forEach((node) => node.removeAttribute(ROOT_ATTR));
}
function fontCssFor(font, rootId) {
  const family = String(font.family || 'system-ui').replace(/[{};]/g, '');
  const size = `${Number(font.size) || 16}${['px', 'em', 'rem'].includes(font.unit) ? font.unit : 'px'}`;
  const lineHeight = /^(?:[0-9]+(?:\.[0-9]+)?)(?:px|em|rem|%)?$/.test(String(font.lineHeight)) ? font.lineHeight : '1.6';
  const weight = Number.isFinite(Number(font.weight)) ? Number(font.weight) : 400;
  const align = ['start', 'left', 'center', 'right', 'justify'].includes(font.align) ? font.align : 'start';

  const iconExclude = ':not(svg):not(path):not(i):not([class*="icon"]):not([class*="Icon"]):not([class*="fa-"]):not([class*="material-icons"])';
  const isPage = rootId === 'ew-page';
  const selector = `[${ROOT_ATTR}="${rootId}"]`;

  if (isPage) {
    return `
      html${selector},
      html${selector} body,
      html${selector} body *${iconExclude} {
        font-family: ${family} !important;
      }
      ${selector} h1, ${selector} h2, ${selector} h3, ${selector} h4, ${selector} h5, ${selector} h6 {
        line-height: calc(${lineHeight} * 0.85) !important;
      }
      ${selector} input, ${selector} button, ${selector} select, ${selector} textarea {
        font-family: ${family} !important;
      }
      ${selector} p, ${selector} li, ${selector} blockquote, ${selector} figcaption, ${selector} td, ${selector} th, ${selector} span, ${selector} a {
        font-size: ${size} !important;
        font-weight: ${weight} !important;
        line-height: ${lineHeight} !important;
      }
      ${selector} p, ${selector} blockquote, ${selector} figcaption {
        text-align: ${align} !important;
      }
    `;
  }

  return `
    ${selector},
    ${selector} *${iconExclude} {
      font-family: ${family} !important;
      font-size: ${size} !important;
      font-weight: ${weight} !important;
      line-height: ${lineHeight} !important;
    }
    ${selector} p, ${selector} blockquote, ${selector} figcaption {
      text-align: ${align} !important;
    }
  `;
}
function applyFontToRoot(root, font, rootId, styleElement) {
  if (!root) return;
  if (!rootId) rootId = 'ew-' + Math.random().toString(36).slice(2, 8);
  root.setAttribute(ROOT_ATTR, rootId);
  if (styleElement) {
    styleElement.textContent += fontCssFor(font, rootId);
  }
}

// --- Module: content/features/translation.js ---
/**
 * In-Page DOM Translation & Restoration Engine
 */

const originalTextMap = new Map();
let isTranslating = false;

function shouldTranslateNode(node) {
  if (!node || node.nodeType !== Node.TEXT_NODE) return false;
  const text = (node.textContent || '').trim();
  if (!text || text.length <= 1) return false;
  // Skip numbers only or pure punctuation
  if (/^[\d\s\p{P}]+$/u.test(text)) return false;

  const parent = node.parentElement;
  if (!parent) return false;
  if (parent.closest('code, pre, kbd, samp, script, style, noscript, textarea, input, select, svg, math, [contenteditable="true"]')) {
    return false;
  }
  if (parent.closest('#easyweb-floating-confirmation, #easyweb-runtime-style')) {
    return false;
  }
  const tag = parent.tagName.toLowerCase();
  if (['script', 'style', 'noscript', 'textarea', 'input', 'select'].includes(tag)) {
    return false;
  }
  return true;
}
function restoreTranslations(root) {
  if (!root || root === document.body || root === document.documentElement) {
    originalTextMap.forEach((original, node) => {
      try {
        if (node && node.parentNode) {
          node.textContent = original;
        }
      } catch (_) {}
    });
    originalTextMap.clear();
    return;
  }

  const toDelete = [];
  originalTextMap.forEach((original, node) => {
    try {
      if (root.contains && root.contains(node)) {
        if (node && node.parentNode) {
          node.textContent = original;
        }
        toDelete.push(node);
      }
    } catch (_) {}
  });
  toDelete.forEach((node) => originalTextMap.delete(node));
}
async function translateRoot(root, targetLang = 'fa', engine = 'google', tone = 'standard', customPrompt = '') {
  if (!root || !isContextValid()) return;
  if (isTranslating) return;
  isTranslating = true;

  try {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    const texts = [];
    let node;

    while ((node = walker.nextNode())) {
      if (shouldTranslateNode(node)) {
        nodes.push(node);
        // Save original text if not already saved
        if (!originalTextMap.has(node)) {
          originalTextMap.set(node, node.textContent);
        }
        texts.push(originalTextMap.get(node) || node.textContent);
      }
    }

    if (!texts.length) {
      isTranslating = false;
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: 'TRANSLATE_BATCH',
      texts,
      targetLang,
      engine,
      tone,
      customPrompt
    });

    if (response?.ok && Array.isArray(response.translations)) {
      response.translations.forEach((translatedText, idx) => {
        const targetNode = nodes[idx];
        if (targetNode && targetNode.parentNode && translatedText) {
          targetNode.textContent = translatedText;
        }
      });
    }
  } catch (error) {
    console.error('[EasyWeb Translate Root Error]:', error);
  } finally {
    isTranslating = false;
  }
}

// --- Module: content/features/detection.js ---
/**
 * Persian Language and Font Suitability Detection Analyzer
 */
const PERSIAN_LETTERS = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_LETTERS = /[A-Za-z]/;

const normalizeFont = (name) => String(name || '').toLowerCase().replace(/['"]/g, '').trim();

const PERSIAN_CAPABLE = new Set([
  'vazirmatn', 'estedad', 'sahel', 'lalezar', 'shabnam', 'samim', 'parastoo', 'tanha', 'gandom',
  'iransans', 'iranyekan', 'iranian sans', 'noto sans arabic', 'noto naskh arabic', 'noto kufi arabic',
  'amiri', 'cairo', 'tajawal', 'almarai', 'scheherazade', 'scheherazade new', 'markazi text',
  'traditional arabic', 'simplified arabic', 'arabic typesetting', 'tahoma', 'arial', 'segoe ui',
  'times new roman', 'georgia', 'verdana', 'helvetica', 'system-ui', '-apple-system', 'blinkmacsystemfont',
  'sans-serif', 'serif', 'monospace', 'ui-sans-serif', 'ui-serif', 'ui-monospace'
]);

let detectConfig = { threshold: 0.2, extraFonts: [] };
function updateDetectConfig(cfg) {
  if (!cfg) return;
  detectConfig = {
    threshold: typeof cfg.threshold === 'number' ? Math.max(0.05, Math.min(0.95, cfg.threshold)) : 0.2,
    extraFonts: Array.isArray(cfg.extraFonts) ? cfg.extraFonts : []
  };
}
function isFontPersianCapable(fontFamily = '') {
  const list = fontFamily.split(',').map(normalizeFont).filter(Boolean);
  if (!list.length) return false;
  return list.some((f) => PERSIAN_CAPABLE.has(f) || detectConfig.extraFonts.map(normalizeFont).includes(f));
}
function detectPageLanguage() {
  const text = (document.body?.innerText || '').slice(0, 15000);
  let fa = 0;
  let en = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (PERSIAN_LETTERS.test(ch)) fa += 1;
    else if (LATIN_LETTERS.test(ch)) en += 1;
  }
  const total = fa + en;
  const isPersian = total >= 40 && (fa / total) >= detectConfig.threshold;
  if (!isPersian) return { persian: false, ratio: total ? fa / total : 0, needsFont: false, currentFont: '' };

  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
  const checkedFonts = [];
  let checkedCount = 0;
  let node;
  while ((node = walker.nextNode()) && checkedCount < 20) {
    const val = node.textContent || '';
    if (PERSIAN_LETTERS.test(val) && val.trim().length > 3) {
      const parent = node.parentElement;
      if (parent) {
        const family = window.getComputedStyle(parent).fontFamily;
        if (family) {
          checkedFonts.push(family);
          checkedCount += 1;
        }
      }
    }
  }
  const sample = checkedFonts[0] || '';
  const needsFont = checkedFonts.length > 0 && !checkedFonts.some(isFontPersianCapable);
  return {
    persian: true,
    ratio: total ? fa / total : 1,
    needsFont,
    currentFont: sample
  };
}

// --- Module: content/features/picker.js ---
/**
 * Element Picker, Hover Preview, and Instant Live Selection Engine
 */


let highlightBox = null;
let pickerState = null;
let activeFloatingBanner = null;
function clearHighlight() {
  if (highlightBox) {
    highlightBox.remove();
    highlightBox = null;
  }
}
function clearPreviewStyles() {
  document.querySelectorAll('[data-easyweb-preview-dir]').forEach((el) => el.removeAttribute('data-easyweb-preview-dir'));
  document.querySelectorAll('[data-easyweb-preview-font]').forEach((el) => el.removeAttribute('data-easyweb-preview-font'));
}
function highlightElement(selector) {
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
function selectorFor(element) {
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
function startPicker(feature, currentSettings, onSelected) {
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

// --- Module: content/observer.js ---
/**
 * Dynamic SPA MutationObserver for EasyWeb
 */



let observerInstance = null;
function startMutationObserver(getSettings, onReapply) {
  if (observerInstance || !isContextValid()) return;

  observerInstance = new MutationObserver(() => {
    if (!isContextValid()) {
      if (observerInstance) {
        try { observerInstance.disconnect(); } catch (_) {}
        observerInstance = null;
      }
      return;
    }

    const settings = getSettings();
    if (!settings?.enabled) return;

    let needsReapply = false;
    if (settings.font?.enabled && (settings.font.scope === 'page' || !settings.font.scope)) {
      if (!document.documentElement.hasAttribute(ROOT_ATTR)) {
        needsReapply = true;
      }
    }

    if (!needsReapply && Array.isArray(settings.targets)) {
      for (let i = 0; i < settings.targets.length; i++) {
        const t = settings.targets[i];
        if (t.font?.enabled || t.direction?.enabled) {
          const els = getElements(t.selector);
          if (els.some((el) => !el.hasAttribute(ROOT_ATTR) && t.font?.enabled)) {
            needsReapply = true;
            break;
          }
        }
      }
    }

    if (needsReapply) {
      onReapply();
    }
  });

  try {
    observerInstance.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}
}
function stopMutationObserver() {
  if (observerInstance) {
    try { observerInstance.disconnect(); } catch (_) {}
    observerInstance = null;
  }
}

// --- Module: content/index.js ---
/**
 * Content Script Engine Entry Point
 */












(() => {
  cleanupStaleInjections();

  const domain = cleanHostname(location.hostname);

  let settings = null;
  let uploadedFonts = [];
  let bundledFonts = [];
  let detectionToastShown = false;

  function settingsFor(store) {
    return store?.[domain] || null;
  }

  function apply() {
    settings = mergeSite(settings);

    // 1. Reset previous directions and styles
    restoreAllDirections();
    restoreTextNodes();

    const style = getStyleElement();
    style.textContent = buildFontFacesCss(uploadedFonts, bundledFonts) + getDirectionBaseCss();

    // 2. Master site gate
    if (!settings.enabled) {
      restoreTranslations();
      return;
    }

    // If translation is disabled across both page and target scopes, restore original text
    const pageTransEnabled = Boolean(settings.translate?.enabled && (settings.translate?.scope === 'page' || !settings.translate?.scope));
    const anyTargetTransEnabled = Array.isArray(settings.targets) && settings.targets.some((t) => t.translate?.enabled);
    if (!pageTransEnabled && !anyTargetTransEnabled) {
      restoreTranslations();
    }

    // 3. Page-wide direction
    const dir = settings.direction;
    if (dir.enabled && (dir.scope === 'page' || !dir.scope)) {
      applyDirectionToRoot(document.documentElement, dir.value);
    }

    // 4. Page-wide typography
    const font = settings.font;
    if (font.enabled && (font.scope === 'page' || !font.scope)) {
      applyFontToRoot(document.documentElement, font, 'ew-page', style);
    }

    // 5. Per-element targets
    settings.targets.forEach((target, i) => {
      const elements = getElements(target.selector);
      if (!elements.length) return;
      const targetId = `ew-t${i}`;
      elements.forEach((el) => {
        if (target.direction?.enabled) applyDirectionToRoot(el, target.direction.value);
        if (target.font?.enabled) applyFontToRoot(el, target.font, targetId, style);
      });
    });
  }

  function maybeNotifyPersian() {
    if (detectionToastShown || !settings || settings.enabled) return;
    const info = detectPageLanguage();
    if (info.persian && info.needsFont) {
      detectionToastShown = true;
    }
  }

  function pageText() {
    return (document.body?.innerText || '').slice(0, 40000);
  }

  async function load() {
    if (!isContextValid()) return;
    try {
      const result = await chrome.storage.local.get({
        [STORAGE_KEY]: {},
        fonts: [],
        bundledFonts: BUNDLED_FONTS,
        detect: { threshold: 0.2, extraFonts: [] }
      });
      if (!isContextValid()) return;
      uploadedFonts = result.fonts || [];
      bundledFonts = (result.bundledFonts && result.bundledFonts.length > 0) ? result.bundledFonts : BUNDLED_FONTS;
      updateDetectConfig(result.detect);
      settings = mergeSite(settingsFor(result[STORAGE_KEY]) || DEFAULT_SITE);
      apply();
      maybeNotifyPersian();
    } catch (_) {}
  }

  async function loadWithRetry() {
    await load();
    for (let i = 1; i <= 3; i += 1) {
      setTimeout(async () => {
        if (!isContextValid()) return;
        try {
          const result = await chrome.storage.local.get({ [STORAGE_KEY]: {} });
          if (!isContextValid()) return;
          const next = settingsFor(result[STORAGE_KEY]);
          if (next) {
            settings = mergeSite(next);
            apply();
          }
        } catch (_) {}
      }, 400 * i);
    }
  }

  async function executeTranslation(options = {}) {
    const cfg = settings?.translate || {};
    const targetLang = options.targetLang || cfg.targetLang || 'fa';
    const engine = options.engine || cfg.engine || 'google';
    const tone = options.tone || cfg.tone || 'standard';
    const customPrompt = options.customPrompt || cfg.customPrompt || '';
    const scope = options.scope || cfg.scope || 'page';
    const targetId = options.targetId || null;

    if (scope === 'element') {
      const targets = (Array.isArray(settings?.targets) ? settings.targets : []).filter((t) => {
        if (targetId) return t.id === targetId;
        return t.translate?.enabled || t.translate;
      });

      if (targets.length) {
        for (const t of targets) {
          const elements = getElements(t.selector);
          for (const el of elements) {
            await translateRoot(
              el,
              t.translate?.targetLang || targetLang,
              t.translate?.engine || engine,
              t.translate?.tone || tone,
              t.translate?.customPrompt || customPrompt
            );
          }
        }
        return { ok: true, count: targets.length };
      }
    }

    // Default: Whole page
    await translateRoot(document.body || document.documentElement, targetLang, engine, tone, customPrompt);
    return { ok: true, count: 1 };
  }

  // --- Message & Storage Listeners ---
  if (typeof chrome !== 'undefined' && chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!isContextValid()) return;
      try {
        if (message.type === 'PING') sendResponse({ ok: true, version: VERSION });
        if (message.type === 'GET_DEBUG') sendResponse({ ok: true, domain, version: VERSION, dir: document.documentElement.getAttribute('dir'), targets: settings?.targets?.length || 0 });
        if (message.type === 'APPLY_SETTINGS') { settings = mergeSite(message.settings); apply(); sendResponse({ ok: true }); }
        if (message.type === 'EXECUTE_TRANSLATION') {
          executeTranslation(message).then((res) => sendResponse(res || { ok: true })).catch((err) => sendResponse({ ok: false, error: err.message }));
          return true;
        }
        if (message.type === 'RESTORE_TRANSLATION') {
          if (message.selector) {
            const els = getElements(message.selector);
            if (els.length) {
              els.forEach((el) => restoreTranslations(el));
            } else {
              restoreTranslations();
            }
          } else {
            restoreTranslations();
          }
          sendResponse({ ok: true });
          return true;
        }
        if (message.type === 'START_PICKER') {
          startPicker(message.feature, settings, async (_targetObj, newSettings) => {
            settings = mergeSite(newSettings);
            apply();
            if (isContextValid()) {
              try {
                const store = await chrome.storage.local.get({ [STORAGE_KEY]: {} });
                const currentSettingsMap = store[STORAGE_KEY] || {};
                currentSettingsMap[domain] = settings;
                await chrome.storage.local.set({ [STORAGE_KEY]: currentSettingsMap });
              } catch (_) {}
            }
          });
          sendResponse({ ok: true });
        }
        if (message.type === 'HIGHLIGHT') { highlightElement(message.selector); sendResponse({ ok: true }); }
        if (message.type === 'CLEAR_HIGHLIGHT') { clearHighlight(); sendResponse({ ok: true }); }
        if (message.type === 'GET_PAGE_TEXT') sendResponse({ ok: true, text: pageText() });
        if (message.type === 'GET_PAGE_INFO') {
          chrome.storage.local.get({ detect: { threshold: 0.2, extraFonts: [] } }).then((res) => {
            if (!isContextValid()) return;
            updateDetectConfig(res.detect);
            sendResponse({ ok: true, info: detectPageLanguage() });
          }).catch(() => {
            if (!isContextValid()) return;
            sendResponse({ ok: true, info: detectPageLanguage() });
          });
          return true;
        }
      } catch (_) {}
      return true;
    });
  }

  if (typeof chrome !== 'undefined' && chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (!isContextValid()) return;
      try {
        if (area === 'local' && changes[STORAGE_KEY]) {
          const next = settingsFor(changes[STORAGE_KEY].newValue);
          if (next) { settings = mergeSite(next); apply(); }
        }
        if (area === 'local' && changes.fonts) { uploadedFonts = changes.fonts.newValue || []; apply(); }
        if (area === 'local' && changes.bundledFonts) {
          bundledFonts = (changes.bundledFonts.newValue && changes.bundledFonts.newValue.length > 0)
            ? changes.bundledFonts.newValue
            : BUNDLED_FONTS;
          apply();
        }
        if (area === 'local' && changes.detect) { updateDetectConfig(changes.detect.newValue); }
      } catch (_) {}
    });
  }

  loadWithRetry().then(() => {
    startMutationObserver(() => settings, apply);
  });
})();
})();
