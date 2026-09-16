/**
 * Content Script Engine Entry Point
 */
import { STORAGE_KEY, VERSION, ADBLOCK_ENABLED, ROOT_ATTR } from '../shared/constants.js';
import { DEFAULT_SITE, BUNDLED_FONTS } from '../shared/defaults.js';
import { ADBLOCK_STORAGE_KEY, DEFAULT_ADBLOCK, resolveToggles, pickToggleValues } from '../shared/adblock.js';
import { cleanHostname } from '../shared/domain.js';
import { mergeSite } from '../shared/models.js';
import { isContextValid, cleanupStaleInjections } from './core/context.js';
import { getStyleElement, buildFontFacesCss, getDirectionBaseCss, ensureFontsLoaded } from './core/style-engine.js';
import { cleanDirection, restoreAllDirections, applyDirectionToRoot } from './features/direction.js';
import { restoreTextNodes, applyFontToRoot, fontCssFor, getElements } from './features/typography.js';
import { translateRoot, restoreTranslations } from './features/translation.js';
import { updateDetectConfig, detectPageLanguage } from './features/detection.js';
import { startPicker, startAdPicker, highlightElement, clearHighlight } from './features/picker.js';
import { injectCosmeticCss, startCosmeticEngine, stopCosmeticEngine, restoreCosmetic, sweepNow } from './features/cosmetic.js';
import { bootGuard } from './features/guard-boot.js';
import { startMutationObserver } from './observer.js';

(() => {
  // Bail out when a live instance of this version is already running, so a second
  // injection cannot register duplicate listeners or a second cosmetic engine.
  // A dead instance (extension reloaded) is replaced, which is what keeps the
  // extension live on pages that were already open.
  if (!cleanupStaleInjections()) return;

  // Re-establish the document_start guard if it is gone or orphaned. This is a
  // no-op when the guard is still alive.
  // Parked behind ADBLOCK_ENABLED (see shared/constants.js).
  if (ADBLOCK_ENABLED) bootGuard();

  const domain = cleanHostname(location.hostname);

  let settings = null;
  let adblockConfig = { ...DEFAULT_ADBLOCK };
  let uploadedFonts = [];
  let bundledFonts = BUNDLED_FONTS;
  let detectionToastShown = false;

  // Preload bundled fonts into document.fonts via FontFace API to bypass host page CSP
  ensureFontsLoaded(uploadedFonts, bundledFonts);

  function settingsFor(store) {
    return store?.[domain] || null;
  }

  function apply() {
    settings = mergeSite(settings);

    // 1. Master site gate
    if (!settings.enabled) {
      restoreAllDirections();
      restoreTextNodes();
      restoreTranslations();
      const style = getStyleElement();
      if (style.textContent !== '') style.textContent = '';
      return;
    }

    const dir = settings.direction || {};
    const dirScope = dir.scope || 'page';
    const isPageDir = Boolean(dir.enabled && dirScope === 'page');
    const isElementDir = Boolean(dirScope === 'element');

    const font = settings.font || {};
    const fontScope = font.scope || 'page';
    const isPageFont = Boolean(font.enabled && fontScope === 'page');
    const isElementFont = Boolean(fontScope === 'element');

    // 2. Build full CSS in one pass and update <style> only if changed (prevents FOUT)
    let nextCss = buildFontFacesCss(uploadedFonts, bundledFonts) + getDirectionBaseCss();
    if (isPageFont) {
      nextCss += fontCssFor(font, 'ew-page');
    } else if (isElementFont && Array.isArray(settings.targets)) {
      settings.targets.forEach((target, i) => {
        if (target.font?.enabled) {
          nextCss += fontCssFor(target.font, `ew-t${i}`);
        }
      });
    }

    const style = getStyleElement();
    if (style.textContent !== nextCss) {
      style.textContent = nextCss;
    }
    ensureFontsLoaded(uploadedFonts, bundledFonts);

    // 3. Direction (non-destructive)
    if (isPageDir) {
      applyDirectionToRoot(document.documentElement, dir.value || 'rtl');
      if (Array.isArray(settings.targets)) {
        settings.targets.forEach((target) => {
          const elements = getElements(target.selector);
          elements.forEach((el) => {
            if (el !== document.documentElement && el !== document.body) cleanDirection(el);
          });
        });
      }
    } else if (isElementDir && Array.isArray(settings.targets)) {
      cleanDirection(document.documentElement);
      if (document.body) cleanDirection(document.body);

      settings.targets.forEach((target) => {
        const elements = getElements(target.selector);
        if (target.direction?.enabled) {
          elements.forEach((el) => applyDirectionToRoot(el, target.direction.value || 'rtl'));
        } else {
          elements.forEach((el) => cleanDirection(el));
        }
      });
    } else {
      restoreAllDirections();
    }

    // 4. Typography (non-destructive)
    if (isPageFont) {
      if (document.documentElement.getAttribute(ROOT_ATTR) !== 'ew-page') {
        document.documentElement.setAttribute(ROOT_ATTR, 'ew-page');
      }
      document.querySelectorAll(`[${ROOT_ATTR}]:not(html)`).forEach((node) => node.removeAttribute(ROOT_ATTR));
    } else if (isElementFont && Array.isArray(settings.targets)) {
      if (document.documentElement.getAttribute(ROOT_ATTR) === 'ew-page') {
        document.documentElement.removeAttribute(ROOT_ATTR);
      }
      const activeIds = new Set();
      settings.targets.forEach((target, i) => {
        const targetId = `ew-t${i}`;
        if (target.font?.enabled) {
          activeIds.add(targetId);
          const elements = getElements(target.selector);
          elements.forEach((el) => {
            if (el.getAttribute(ROOT_ATTR) !== targetId) el.setAttribute(ROOT_ATTR, targetId);
          });
        }
      });
      document.querySelectorAll(`[${ROOT_ATTR}]`).forEach((node) => {
        const id = node.getAttribute(ROOT_ATTR);
        if (id && id !== 'ew-page' && !activeIds.has(id)) node.removeAttribute(ROOT_ATTR);
      });
    } else {
      restoreTextNodes();
    }

    // 5. Translation check
    const pageTransEnabled = Boolean(settings.translate?.enabled && (settings.translate?.scope === 'page' || !settings.translate?.scope));
    const anyTargetTransEnabled = Array.isArray(settings.targets) && settings.targets.some((t) => t.translate?.enabled);
    if (!pageTransEnabled && !anyTargetTransEnabled) {
      restoreTranslations();
    }
  }

  function maybeNotifyPersian() {
    if (detectionToastShown || !settings || settings.enabled) return;
    const info = detectPageLanguage();
    if (info.persian && info.needsFont) {
      detectionToastShown = true;
    }
  }

  /* ---------------- Ad blocker ---------------- */

  let cosmeticReported = 0;

  function reportCosmetic(count) {
    if (!count || count <= 0) return;
    cosmeticReported += count;
    try {
      chrome.runtime.sendMessage({
        type: 'ADBLOCK_RECORD',
        domain,
        patch: { cosmetic: count, total: count }
      });
    } catch (_) {}
  }

  function applyAdblock() {
    // The ad blocker is parked; every call site funnels through here.
    if (!ADBLOCK_ENABLED) return;

    const toggles = resolveToggles(adblockConfig, settings, domain);
    const picked = Array.isArray(settings?.blocker?.picked) ? settings.blocker.picked : [];

    // Undo everything first. A rule that was deleted, disabled or switched to
    // the other mode must stop hiding (or deleting) its elements — otherwise the
    // inline `display:none` we applied would keep them hidden forever.
    restoreCosmetic();

    injectCosmeticCss({
      toggles,
      config: adblockConfig,
      customRules: adblockConfig.customRules,
      picked
    });

    if (toggles.cosmetic) {
      startCosmeticEngine({
        toggles,
        config: adblockConfig,
        customRules: adblockConfig.customRules,
        picked,
        onCount: reportCosmetic
      });
      // Re-apply inline overrides immediately so restored nodes never flash.
      sweepNow();
    } else {
      stopCosmeticEngine();
    }
  }

  /** Persist the current site settings without disturbing other domains. */
  async function persistSite() {
    if (!isContextValid()) return;
    try {
      const store = await chrome.storage.local.get({ [STORAGE_KEY]: {} });
      const map = store[STORAGE_KEY] || {};
      map[domain] = settings;
      await chrome.storage.local.set({ [STORAGE_KEY]: map });
    } catch (_) {}
  }

  const TOAST_STYLE_ID = 'easyweb-adblock-ui-style';

  function ensureToastStyles() {
    if (document.getElementById(TOAST_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = TOAST_STYLE_ID;
    style.textContent = `
      #easyweb-adblock-toast {
        position: fixed;
        z-index: 2147483647;
        bottom: 18px;
        inset-inline-start: 18px;
        display: flex;
        align-items: center;
        gap: 8px;
        max-width: 320px;
        padding: 9px 14px;
        border-radius: 10px;
        background: rgba(15, 17, 34, 0.96);
        border: 1px solid rgba(141, 115, 255, 0.55);
        box-shadow: 0 8px 26px rgba(0, 0, 0, 0.45);
        color: #f7f7ff;
        font: 500 12px/1.6 'Vazirmatn', Tahoma, system-ui, sans-serif;
        direction: rtl;
        text-align: right;
        opacity: 0;
        transform: translateY(10px);
        transition: opacity 0.22s ease, transform 0.22s ease;
        pointer-events: none;
      }
      #easyweb-adblock-toast.show {
        opacity: 1;
        transform: translateY(0);
      }
      #easyweb-adblock-toast b { color: #27c8ba; font-weight: 700; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function showPopupToast(host) {
    if (window.top !== window || !document.body) return;
    ensureToastStyles();
    let toast = document.getElementById('easyweb-adblock-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'easyweb-adblock-toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `🛡️ <span>تب تبلیغاتی مسدود شد${host ? ` · <b>${host}</b>` : ''}</span>`;
    toast.classList.add('show');
    clearTimeout(showPopupToast.timer);
    showPopupToast.timer = setTimeout(() => {
      toast.classList.remove('show');
    }, 3200);
  }
  showPopupToast.timer = null;

  function pageText() {
    return (document.body?.innerText || '').slice(0, 40000);
  }

  async function load() {
    if (!isContextValid()) return;
    try {
      const result = await chrome.storage.local.get({
        [STORAGE_KEY]: {},
        [ADBLOCK_STORAGE_KEY]: DEFAULT_ADBLOCK,
        fonts: [],
        bundledFonts: BUNDLED_FONTS,
        detect: { threshold: 0.2, extraFonts: [] }
      });
      if (!isContextValid()) return;
      uploadedFonts = result.fonts || [];
      bundledFonts = (result.bundledFonts && result.bundledFonts.length > 0) ? result.bundledFonts : BUNDLED_FONTS;
      updateDetectConfig(result.detect);
      adblockConfig = { ...DEFAULT_ADBLOCK, ...(result[ADBLOCK_STORAGE_KEY] || {}) };
      settings = mergeSite(settingsFor(result[STORAGE_KEY]) || DEFAULT_SITE);
      apply();
      applyAdblock();
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
        if (message.type === 'APPLY_SETTINGS') {
          const nextSettings = mergeSite(message.settings);
          const settingsChanged = JSON.stringify(settings) !== JSON.stringify(nextSettings);
          const fontsChanged = Array.isArray(message.fonts) && JSON.stringify(uploadedFonts) !== JSON.stringify(message.fonts);
          if (Array.isArray(message.fonts)) uploadedFonts = message.fonts;
          settings = nextSettings;
          if (settingsChanged || fontsChanged) {
            apply();
            applyAdblock();
          }
          sendResponse({ ok: true });
        }
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
          if (message.feature === 'adblock') {
            startAdPicker(settings, message.mode, async (rule, newSettings) => {
              settings = mergeSite(newSettings);

              // Picking a section implies cosmetic filtering has to be active on
              // this site, otherwise the new rule would never be applied.
              const effective = resolveToggles(adblockConfig, settings, domain);
              if (!effective.cosmetic) {
                settings.blocker.mode = 'custom';
                settings.blocker.toggles = { ...pickToggleValues(effective), cosmetic: true };
              }
              settings.blocker.enabled = true;

              applyAdblock();
              await persistSite();
            });
          } else {
            startPicker(message.feature, settings, async (_targetObj, newSettings) => {
              settings = mergeSite(newSettings);
              apply();
              await persistSite();
            });
          }
          sendResponse({ ok: true });
        }
        if (message.type === 'HIGHLIGHT') { highlightElement(message.selector); sendResponse({ ok: true }); }
        if (message.type === 'CLEAR_HIGHLIGHT') { clearHighlight(); sendResponse({ ok: true }); }
        if (message.type === 'GET_PAGE_TEXT') sendResponse({ ok: true, text: pageText() });
        if (message.type === 'ADBLOCK_POPUP_BLOCKED') { showPopupToast(message.host); sendResponse({ ok: true }); }
        if (message.type === 'RESYNC') {
          // Re-read everything from storage and re-apply, so a push is correct
          // even when the change notification has not been delivered yet.
          load()
            .then(() => sendResponse({ ok: true }))
            .catch(() => sendResponse({ ok: false }));
          return true;
        }
        if (message.type === 'ADBLOCK_STATE') {
          const toggles = resolveToggles(adblockConfig, settings, domain);
          sendResponse({ ok: true, toggles, cosmeticHidden: cosmeticReported });
        }
        if (message.type === 'ADBLOCK_TEST_SELECTORS') {
          // Lets the popup show whether each picked rule still matches anything,
          // so a stale selector becomes visible instead of failing silently.
          const results = {};
          for (const selector of message.selectors || []) {
            try {
              results[selector] = document.querySelectorAll(selector).length;
            } catch (_) {
              results[selector] = -1;
            }
          }
          sendResponse({ ok: true, results });
        }
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
          // A missing entry means "back to defaults" — not "leave the page as it
          // is", which would strand the page on settings that no longer exist.
          const nextSettings = mergeSite(settingsFor(changes[STORAGE_KEY].newValue) || DEFAULT_SITE);
          if (JSON.stringify(settings) !== JSON.stringify(nextSettings)) {
            settings = nextSettings;
            apply();
            applyAdblock();
          }
        }
        if (area === 'local' && changes[ADBLOCK_STORAGE_KEY]) {
          adblockConfig = { ...DEFAULT_ADBLOCK, ...(changes[ADBLOCK_STORAGE_KEY].newValue || {}) };
          applyAdblock();
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
