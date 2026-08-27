/**
 * Content Script Engine Entry Point
 */
import { STORAGE_KEY, VERSION } from '../shared/constants.js';
import { DEFAULT_SITE, BUNDLED_FONTS } from '../shared/defaults.js';
import { cleanHostname } from '../shared/domain.js';
import { mergeSite } from '../shared/models.js';
import { isContextValid, cleanupStaleInjections } from './core/context.js';
import { getStyleElement, buildFontFacesCss, getDirectionBaseCss } from './core/style-engine.js';
import { restoreAllDirections, applyDirectionToRoot } from './features/direction.js';
import { restoreTextNodes, applyFontToRoot, getElements } from './features/typography.js';
import { translateRoot, restoreTranslations } from './features/translation.js';
import { updateDetectConfig, detectPageLanguage } from './features/detection.js';
import { startPicker, highlightElement, clearHighlight } from './features/picker.js';
import { startMutationObserver } from './observer.js';

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
