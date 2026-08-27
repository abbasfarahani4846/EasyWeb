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
      document.documentElement.appendChild(styleElement);
    }
  }
  return styleElement;
}

export function buildFontFacesCss(uploadedFonts = [], bundledFonts = []) {
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

export function getDirectionBaseCss() {
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
