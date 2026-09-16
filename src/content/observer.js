/**
 * Dynamic SPA MutationObserver for EasyWeb
 */
import { ROOT_ATTR, DIRECTION_ATTR } from '../shared/constants.js';
import { isContextValid } from './core/context.js';
import { getElements } from './features/typography.js';

let observerInstance = null;
let reapplyTimer = null;

export function startMutationObserver(getSettings, onReapply) {
  if (observerInstance || !isContextValid()) return;

  function scheduleReapply() {
    if (reapplyTimer) return;
    reapplyTimer = setTimeout(() => {
      reapplyTimer = null;
      if (!isContextValid()) return;

      // Temporarily disconnect observer to prevent catching EasyWeb's own DOM mutations
      if (observerInstance) {
        try { observerInstance.disconnect(); } catch (_) {}
      }

      try {
        onReapply();
      } finally {
        if (observerInstance && isContextValid()) {
          try {
            observerInstance.observe(document.documentElement, { childList: true, subtree: true });
          } catch (_) {}
        }
      }
    }, 250);
  }

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

    if (!needsReapply && settings.direction?.enabled && (settings.direction.scope === 'page' || !settings.direction.scope)) {
      if (document.documentElement.getAttribute('dir') !== settings.direction.value) {
        needsReapply = true;
      }
    }

    if (!needsReapply && (settings.font?.enabled || settings.direction?.enabled)) {
      const style = document.getElementById('easyweb-runtime-style');
      if (!style || !style.isConnected) {
        needsReapply = true;
      }
    }

    if (!needsReapply && Array.isArray(settings.targets)) {
      for (let i = 0; i < settings.targets.length; i++) {
        const t = settings.targets[i];
        if (t.font?.enabled || t.direction?.enabled) {
          const els = getElements(t.selector);
          if (els.some((el) => (!el.hasAttribute(ROOT_ATTR) && t.font?.enabled) || (!el.hasAttribute(DIRECTION_ATTR) && t.direction?.enabled))) {
            needsReapply = true;
            break;
          }
        }
      }
    }

    if (needsReapply) {
      scheduleReapply();
    }
  });

  try {
    observerInstance.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}

  window.addEventListener('yt-navigate-finish', () => {
    if (!isContextValid()) return;
    const settings = getSettings();
    if (settings?.enabled) scheduleReapply();
  }, { passive: true });
}

export function stopMutationObserver() {
  if (reapplyTimer) {
    clearTimeout(reapplyTimer);
    reapplyTimer = null;
  }
  if (observerInstance) {
    try { observerInstance.disconnect(); } catch (_) {}
    observerInstance = null;
  }
}
