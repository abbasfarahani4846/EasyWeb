/**
 * Runtime Style Engine and Font-Face CSS Generator
 */
import { RUNTIME_STYLE_ID } from '../../shared/constants.js';
import { isContextValid } from './context.js';

let styleElement = null;

export function getStyleElement() {
  if (!styleElement || !styleElement.isConnected) {
    styleElement = document.getElementById(RUNTIME_STYLE_ID);
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = RUNTIME_STYLE_ID;
      (document.head || document.documentElement).appendChild(styleElement);
    }
  }
  return styleElement;
}

const loadedFamilies = new Set();

/**
 * Load fonts directly into document.fonts using the CSS Font Loading API and ArrayBuffer.
 * This completely bypasses host page Content Security Policy (CSP) font-src restrictions
 * (such as on YouTube, GitHub, etc.) that block chrome-extension:// URLs in @font-face.
 */
export async function ensureFontsLoaded(uploadedFonts = [], bundledFonts = []) {
  if (!('fonts' in document) || typeof FontFace === 'undefined' || !isContextValid()) return;

  // 1. Bundled extension fonts
  for (const f of bundledFonts) {
    const fam = (f.family || f.name || '').replace(/^['"]|['"]$/g, '').trim();
    if (!fam || loadedFamilies.has(fam)) continue;
    try {
      const url = chrome.runtime?.getURL?.(f.file);
      if (!url) continue;
      const res = await fetch(url);
      if (!res.ok) continue;
      const buffer = await res.arrayBuffer();

      let face;
      try {
        face = new FontFace(fam, buffer.slice(0), { weight: '100 900', style: 'normal', display: 'swap' });
      } catch (_) {
        face = new FontFace(fam, buffer.slice(0));
      }
      const loaded = await face.load();
      document.fonts.add(loaded);
      loadedFamilies.add(fam);

      const altName = (f.name || '').replace(/^['"]|['"]$/g, '').trim();
      if (altName && altName !== fam && !loadedFamilies.has(altName)) {
        try {
          const altFace = new FontFace(altName, buffer.slice(0), { weight: '100 900', style: 'normal', display: 'swap' });
          const altLoaded = await altFace.load();
          document.fonts.add(altLoaded);
          loadedFamilies.add(altName);
        } catch (_) {}
      }
    } catch (err) {
      console.warn('[EasyWeb] FontFace load failed for', fam, err);
    }
  }

  // 2. Uploaded user fonts
  for (const f of uploadedFonts) {
    const fam = (f.name || '').replace(/^['"]|['"]$/g, '').trim();
    const cacheKey = `user-${fam}-${f.size || 0}`;
    if (!fam || loadedFamilies.has(cacheKey)) continue;
    try {
      let buffer;
      if (typeof f.data === 'string' && f.data.startsWith('data:')) {
        const res = await fetch(f.data);
        buffer = await res.arrayBuffer();
      } else if (f.data instanceof ArrayBuffer) {
        buffer = f.data;
      }
      if (!buffer) continue;
      let face;
      try {
        face = new FontFace(fam, buffer, { weight: '100 900', style: 'normal', display: 'swap' });
      } catch (_) {
        face = new FontFace(fam, buffer);
      }
      const loaded = await face.load();
      document.fonts.add(loaded);
      loadedFamilies.add(cacheKey);
    } catch (err) {
      console.warn('[EasyWeb] FontFace load failed for uploaded font', fam, err);
    }
  }
}

export function buildFontFacesCss(uploadedFonts = [], bundledFonts = []) {
  if (!isContextValid()) return '';
  const uploaded = uploadedFonts.map((f) => {
    const format = f.format || (f.type?.includes('woff2') ? 'woff2' : f.type?.includes('woff') ? 'woff' : 'truetype');
    return `@font-face{font-family:'${String(f.name).replace(/'/g, "\\'")}';src:url(${f.data}) format('${format}');font-weight:100 900;font-style:normal;font-display:swap;}`;
  }).join('');

  const bundled = bundledFonts.map((f) => {
    try {
      const url = chrome.runtime.getURL(f.file);
      const fam = String(f.family || f.name).replace(/'/g, "\\'");
      return `@font-face{font-family:'${fam}';src:url('${url}') format('${f.format || 'woff2'}');font-weight:100 900;font-style:normal;font-display:swap;}`;
    } catch (_) {
      return '';
    }
  }).join('');

  return uploaded + bundled;
}

export function getDirectionBaseCss() {
  return `
    /* Direction base styling */
    [data-easyweb-direction="rtl"] {
      direction: rtl !important;
      text-align: right !important;
    }
    [data-easyweb-direction="rtl"] :is(p, h1, h2, h3, h4, h5, h6, blockquote, article, section, main, li) {
      direction: rtl !important;
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
    [data-easyweb-direction="ltr"] :is(p, h1, h2, h3, h4, h5, h6, blockquote, article, section, main, li) {
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
