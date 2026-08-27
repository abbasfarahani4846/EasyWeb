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

export function updateDetectConfig(cfg) {
  if (!cfg) return;
  detectConfig = {
    threshold: typeof cfg.threshold === 'number' ? Math.max(0.05, Math.min(0.95, cfg.threshold)) : 0.2,
    extraFonts: Array.isArray(cfg.extraFonts) ? cfg.extraFonts : []
  };
}

export function isFontPersianCapable(fontFamily = '') {
  const list = fontFamily.split(',').map(normalizeFont).filter(Boolean);
  if (!list.length) return false;
  return list.some((f) => PERSIAN_CAPABLE.has(f) || detectConfig.extraFonts.map(normalizeFont).includes(f));
}

export function detectPageLanguage() {
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
