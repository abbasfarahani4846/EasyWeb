/**
 * Background Service Worker Entry Point
 */
import { DEFAULTS, BUNDLED_FONTS } from '../shared/defaults.js';
import { setPickerResult, popPickerResult } from './picker-bridge.js';
import { getActiveTab, getActiveTabContext, sendToTab } from './tab-context.js';
import { translateBatch } from './translation-service.js';
import { fetchProviderModels, callLLM } from './llm-client.js';

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
    console.error('[EasyWeb Storage Init Error]:', err);
  }
}

chrome.runtime.onInstalled.addListener(ensureStorageInitialized);
if (typeof chrome.runtime.onStartup !== 'undefined') {
  chrome.runtime.onStartup.addListener(ensureStorageInitialized);
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
        label: message.label
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

    return sendResponse({ ok: false, error: 'Unknown message type.' });
  })();
  return true;
});
