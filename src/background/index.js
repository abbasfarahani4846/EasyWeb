/**
 * Background Service Worker Entry Point
 */
import { DEFAULTS, BUNDLED_FONTS } from '../shared/defaults.js';
import { setPickerResult, popPickerResult } from './picker-bridge.js';
import { getActiveTab, getActiveTabContext, sendToTab } from './tab-context.js';
import { translateBatch } from './translation-service.js';
import { fetchProviderModels, callLLM } from './llm-client.js';
import {
  refresh,
  installAdblockListeners,
  getStatus,
  getAdblockStatus,
  updateGlobal,
  updateAdblockGlobal,
  setDomainList,
  updateSiteBlocker,
  recordStats,
  resetStats,
  getStats,
  guardDiagnostics
} from './adblock.js';
import { installPopupGuard, recordGesture, clearGesture } from './popup-guard.js';
import { ADBLOCK_ENABLED } from '../shared/constants.js';

async function ensureStorageInitialized() {
  try {
    const current = await chrome.storage.local.get(null);
    const updates = {};
    for (const key of Object.keys(DEFAULTS)) {
      if (current[key] === undefined) {
        updates[key] = DEFAULTS[key];
      }
    }
    if (!current.bundledFonts || !Array.isArray(current.bundledFonts) || current.bundledFonts.length === 0) {
      updates.bundledFonts = BUNDLED_FONTS;
    }
    if (Object.keys(updates).length > 0) {
      await chrome.storage.local.set(updates);
    }
  } catch (err) {
    console.warn('[EasyWeb Storage Init Error]:', err);
  }
  await refresh().catch(() => {});
}

/**
 * Push the current settings to the active tab, re-injecting the content script
 * when it is missing.
 *
 * Every already-open page loses its content script when the extension is
 * reloaded, and a plain `tabs.sendMessage` then fails silently — which is why
 * changes used to need a manual page refresh. Repairing the script here means a
 * settings change always reaches the page.
 */
async function resyncActiveTab() {
  let tab = null;
  try {
    tab = await getActiveTab();
  } catch (_) {
    return;
  }
  if (!tab?.id || !/^https?:/i.test(tab.url || '')) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'RESYNC' });
    return;
  } catch (_) {
    // No live content script — inject one and retry.
  }

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await chrome.tabs.sendMessage(tab.id, { type: 'RESYNC' });
  } catch (_) {}
}

chrome.runtime.onInstalled.addListener(ensureStorageInitialized);
if (typeof chrome.runtime.onStartup !== 'undefined') {
  chrome.runtime.onStartup.addListener(ensureStorageInitialized);
}

// The service worker is torn down and restarted often; session rules live only
// for the browser session, so re-apply the blocker every time we boot.
// The whole subsystem is parked behind ADBLOCK_ENABLED (see shared/constants.js).
if (ADBLOCK_ENABLED) {
  installAdblockListeners();
  installPopupGuard();
  refresh().catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === 'GET_ACTIVE_CONTEXT') {
      const context = await getActiveTabContext();
      return sendResponse(context);
    }

    if (message.type === 'FETCH_MODELS') {
      const { providerType, apiKey, baseUrl } = message;
      const res = await fetchProviderModels(providerType, apiKey, baseUrl);
      return sendResponse(res);
    }

    if (message.type === 'AI_REQUEST') {
      const store = await chrome.storage.local.get({ providers: [], activeProviderId: '' });
      const providers = store.providers || [];
      const provider = providers.find((p) => p.id === message.providerId) ||
                       providers.find((p) => p.id === store.activeProviderId) ||
                       providers[0];

      if (!provider || !provider.secret) {
        return sendResponse({
          ok: false,
          error: 'No AI provider configured. Open Settings (⚙) to add your API key.'
        });
      }

      const model = message.model || provider.selectedModel || provider.defaultModel;
      const res = await callLLM({
        providerType: provider.type,
        apiKey: provider.secret,
        baseUrl: provider.baseUrl,
        model,
        prompt: message.prompt,
        systemPrompt: message.pageText ? `Active page content:\n${message.pageText.slice(0, 8000)}` : ''
      });
      return sendResponse(res);
    }

    if (message.type === 'TRANSLATE_BATCH') {
      const { texts, targetLang, engine, tone, customPrompt } = message;
      const res = await translateBatch(texts, targetLang, engine, tone, customPrompt);
      return sendResponse(res);
    }

    if (message.type === 'ELEMENT_PICKED' && sender.tab?.id) {
      setPickerResult(sender.tab.id, {
        feature: message.feature,
        selector: message.selector,
        label: message.label,
        broad: message.broad,
        mode: message.mode,
        ruleId: message.ruleId
      });
      return sendResponse({ ok: true });
    }

    if (message.type === 'GET_PICKER_RESULT') {
      const tab = await getActiveTab();
      const result = tab?.id ? popPickerResult(tab.id) : null;
      return sendResponse({ ok: true, result: result || null });
    }

    if (message.type === 'OPEN_SIDEBAR') {
      const tab = await getActiveTab();
      if (!tab?.id) return sendResponse({ ok: false, error: 'No active tab.' });
      if (chrome.sidePanel?.open) {
        await chrome.sidePanel.open({ tabId: tab.id });
        return sendResponse({ ok: true });
      }
      return sendResponse({ ok: false, error: 'Side panel not supported.' });
    }

    if (message.type === 'PAGE_ACTION') {
      const tab = await getActiveTab();
      if (!tab?.id) return sendResponse({ ok: false, error: 'No active tab.' });
      let page = await sendToTab(tab.id, { type: 'GET_PAGE_TEXT' });
      if (!page?.ok && !page?.text) {
        try {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
          page = await sendToTab(tab.id, { type: 'GET_PAGE_TEXT' });
        } catch (_) {}
      }
      return sendResponse({ ok: true, text: page?.text || '' });
    }

    /* ---------------- Ad blocker ---------------- */

    // Parked for now: answer politely instead of touching APIs whose permissions
    // are no longer declared in the manifest.
    if (!ADBLOCK_ENABLED && typeof message.type === 'string' && message.type.startsWith('ADBLOCK_')) {
      return sendResponse({ ok: false, disabled: true });
    }

    if (message.type === 'USER_GESTURE' && sender.tab?.id) {
      recordGesture(sender.tab.id, message.gesture || {});
      return sendResponse({ ok: true });
    }

    if (message.type === 'ADBLOCK_STATUS') {
      const tab = message.tabId
        ? await chrome.tabs.get(message.tabId).catch(() => null)
        : await getActiveTab();
      return sendResponse(await getAdblockStatus(tab));
    }

    if (message.type === 'ADBLOCK_UPDATE_GLOBAL') {
      const config = await updateAdblockGlobal(message.patch || {});
      // Apply to the page the user is looking at, without waiting for the
      // storage notification (and repairing an orphaned content script).
      resyncActiveTab();
      return sendResponse({ ok: true, config });
    }

    if (message.type === 'ADBLOCK_SET_LIST') {
      const result = await setDomainList(message.list, message.domain, Boolean(message.present));
      resyncActiveTab();
      return sendResponse(result);
    }

    if (message.type === 'ADBLOCK_SET_SITE') {
      const result = await updateSiteBlocker(message.domain, message.blocker || {});
      resyncActiveTab();
      return sendResponse(result);
    }

    if (message.type === 'ADBLOCK_RECORD') {
      const domain = message.domain || (sender.tab?.url ? new URL(sender.tab.url).hostname : '');
      const stats = await recordStats(message.patch || {}, domain);
      return sendResponse({ ok: true, stats });
    }

    if (message.type === 'ADBLOCK_STATS') {
      return sendResponse({ ok: true, stats: await getStats() });
    }

    if (message.type === 'ADBLOCK_RESET_STATS') {
      return sendResponse({ ok: true, stats: await resetStats() });
    }

    if (message.type === 'ADBLOCK_DIAGNOSTICS') {
      let sessionRuleCount = 0;
      try {
        sessionRuleCount = (await chrome.declarativeNetRequest.getSessionRules()).length;
      } catch (_) {}
      return sendResponse({
        ok: true,
        guard: guardDiagnostics(),
        stats: await getStats(),
        sessionRuleCount
      });
    }

    if (message.type === 'ADBLOCK_CLEAR_GESTURES' && sender.tab?.id) {
      clearGesture(sender.tab.id);
      return sendResponse({ ok: true });
    }

    return sendResponse({ ok: false, error: 'Unknown message type.' });
  })();
  return true;
});
