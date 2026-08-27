/**
 * Dynamic SPA MutationObserver for EasyWeb
 */
import { ROOT_ATTR } from '../shared/constants.js';
import { isContextValid } from './core/context.js';
import { getElements } from './features/typography.js';

let observerInstance = null;

export function startMutationObserver(getSettings, onReapply) {
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

export function stopMutationObserver() {
  if (observerInstance) {
    try { observerInstance.disconnect(); } catch (_) {}
    observerInstance = null;
  }
}
