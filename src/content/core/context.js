/**
 * Content Script Context Validator and Cleanup Guard
 */
import { VERSION, RUNTIME_STYLE_ID, TEXT_CLASS, DIRECTION_ATTR } from '../../shared/constants.js';

export function isContextValid() {
  try {
    return Boolean(typeof chrome !== 'undefined' && chrome?.runtime && chrome.runtime.id);
  } catch (_) {
    return false;
  }
}

export function cleanupStaleInjections() {
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
