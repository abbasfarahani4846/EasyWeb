/**
 * Typography Application, Dynamic Text Protection and Scoped CSS Generator
 */
import { ROOT_ATTR } from '../../shared/constants.js';

export function getElements(selector) {
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

export function restoreTextNodes() {
  document.querySelectorAll(`[${ROOT_ATTR}]`).forEach((node) => node.removeAttribute(ROOT_ATTR));
}

export function fontCssFor(font, rootId) {
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

export function applyFontToRoot(root, font, rootId, styleElement) {
  if (!root) return;
  if (!rootId) rootId = 'ew-' + Math.random().toString(36).slice(2, 8);
  root.setAttribute(ROOT_ATTR, rootId);
  if (styleElement) {
    styleElement.textContent += fontCssFor(font, rootId);
  }
}
