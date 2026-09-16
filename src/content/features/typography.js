/**
 * Typography Application, Dynamic Text Protection and Scoped CSS Generator
 */
import { ROOT_ATTR } from '../../shared/constants.js';

export function getElements(selector) {
  if (!selector) return [];
  try {
    return Array.from(document.querySelectorAll(selector));
  } catch (_) {
    return [];
  }
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

  const iconExclude = ':not(svg):not(path):not(i):not(yt-icon):not(yt-icon *):not(tp-yt-iron-icon):not(tp-yt-iron-icon *):not([class*="icon"]):not([class*="Icon"]):not([class*="fa-"]):not([class*="material-icons"])';
  const isPage = rootId === 'ew-page';
  const selector = `[${ROOT_ATTR}="${rootId}"]`;

  if (isPage) {
    return `
      html${selector},
      html${selector} body,
      ${selector} ytd-app {
        font-family: ${family} !important;
        font-size: ${size} !important;
        font-weight: ${weight} !important;
        line-height: ${lineHeight} !important;
        --yt-sans-serif-font: ${family} !important;
        --ytd-user-comment-font-family: ${family} !important;
        --yt-endpoint-font-family: ${family} !important;
        --paper-font-common-base_-_font-family: ${family} !important;
        --yt-formatted-string-font-family: ${family} !important;
      }
      html${selector} body *${iconExclude} {
        font-family: ${family} !important;
      }
      ${selector} :is(yt-formatted-string, yt-attributed-string, yt-core-attributed-string, tp-yt-paper-item, ytd-app, #video-title, #channel-name, #content-text, .ytd-watch-metadata, .ytd-video-primary-info-renderer)${iconExclude},
      ${selector} :is(yt-formatted-string, yt-attributed-string, yt-core-attributed-string, tp-yt-paper-item) *${iconExclude} {
        font-family: ${family} !important;
      }
      ${selector} h1, ${selector} h2, ${selector} h3, ${selector} h4, ${selector} h5, ${selector} h6 {
        line-height: calc(${lineHeight} * 0.85) !important;
      }
      ${selector} input, ${selector} button, ${selector} select, ${selector} textarea {
        font-family: ${family} !important;
      }
      ${selector} :is(p, li, blockquote, figcaption, td, th) {
        font-size: ${size} !important;
        font-weight: ${weight} !important;
        line-height: ${lineHeight} !important;
      }
      ${selector} :is(p, blockquote, figcaption) {
        text-align: ${align} !important;
      }
    `;
  }

  return `
    html ${selector},
    html ${selector} *${iconExclude} {
      font-family: ${family} !important;
      font-size: ${size} !important;
      font-weight: ${weight} !important;
      line-height: ${lineHeight} !important;
    }
    html ${selector} :is(yt-formatted-string, yt-attributed-string, yt-core-attributed-string, tp-yt-paper-item) *${iconExclude} {
      font-family: ${family} !important;
    }
    html ${selector} :is(p, blockquote, figcaption) {
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
