(() => {
// --- Module: shared/defaults.js ---
/**
 * Shared Default Configurations and Font Definitions
 */
const DEFAULT_SITE = {
  enabled: false,
  direction: {
    enabled: false,
    value: 'rtl',
    scope: 'page',
    selector: '',
    label: ''
  },
  font: {
    enabled: false,
    scope: 'page',
    selector: '',
    label: '',
    family: "'Vazirmatn', 'Tahoma', sans-serif",
    size: 16,
    unit: 'px',
    lineHeight: '1.6',
    weight: '400',
    align: 'start'
  },
  translate: {
    enabled: false,
    scope: 'page',
    selector: '',
    label: '',
    targetLang: 'fa',
    engine: 'google',
    tone: 'standard',
    customPrompt: ''
  },
  targets: []
};
const TRANSLATION_TONES = [
  { id: 'standard', name: 'روان و طبیعی (پیش‌فرض)' },
  { id: 'formal', name: 'رسمی و تخصصی' },
  { id: 'colloquial', name: 'صمیمی و محاوره‌ای' },
  { id: 'literal', name: 'کلمه‌به‌کلمه و دقیق' },
  { id: 'simplified', name: 'ساده‌سازی شده' },
  { id: 'custom', name: 'پرامپت سفارشی...' }
];
const SUPPORTED_LANGUAGES = [
  { code: 'fa', name: 'فارسی (Persian)' },
  { code: 'en', name: 'English' },
  { code: 'ar', name: 'العربية (Arabic)' },
  { code: 'fr', name: 'Français (French)' },
  { code: 'de', name: 'Deutsch (German)' },
  { code: 'es', name: 'Español (Spanish)' },
  { code: 'tr', name: 'Türkçe (Turkish)' },
  { code: 'ru', name: 'Русский (Russian)' },
  { code: 'zh', name: '中文 (Chinese)' },
  { code: 'ja', name: '日本語 (Japanese)' },
  { code: 'it', name: 'Italiano (Italian)' }
];
const DEFAULT_FONTS = [
  { name: 'Vazirmatn (فارسی)', family: "'Vazirmatn', 'Tahoma', sans-serif" },
  { name: 'Estedad (فارسی)', family: "'Estedad', 'Tahoma', sans-serif" },
  { name: 'Sahel (فارسی)', family: "'Sahel', 'Tahoma', sans-serif" },
  { name: 'Lalezar (فارسی)', family: "'Lalezar', 'Tahoma', sans-serif" }
];
const BUNDLED_FONTS = [
  { name: 'Vazirmatn', family: 'Vazirmatn', file: 'assets/fonts/Vazirmatn-Regular.woff2', format: 'woff2' },
  { name: 'Estedad', family: 'Estedad', file: 'assets/fonts/Estedad-Regular.woff2', format: 'woff2' },
  { name: 'Sahel', family: 'Sahel', file: 'assets/fonts/Sahel-Regular.woff2', format: 'woff2' },
  { name: 'Lalezar', family: 'Lalezar', file: 'assets/fonts/Lalezar-Regular.woff2', format: 'woff2' }
];
const DEFAULTS = {
  settings: {},
  fonts: [],
  bundledFonts: BUNDLED_FONTS,
  providers: [],
  customTools: [],
  chatHistory: {},
  detect: { threshold: 0.2, extraFonts: [] }
};

// --- Module: background/picker-bridge.js ---
/**
 * Element Picker Bridge for Background Service Worker
 */
const pickerResults = new Map();
function setPickerResult(tabId, result) {
  if (!tabId) return;
  pickerResults.set(tabId, result);
}
function popPickerResult(tabId) {
  if (!tabId) return null;
  const result = pickerResults.get(tabId) || null;
  pickerResults.delete(tabId);
  return result;
}

// --- Module: shared/domain.js ---
/**
 * Domain & URL Parsing Utilities
 */

/**
 * Extract clean hostname from URL or hostname string (e.g., "gemini.google.com", "chatgpt.com").
 * Strips leading/trailing dots and "www." prefix while preserving specific subdomains.
 */
function cleanHostname(input = '') {
  try {
    const raw = String(input || '').includes('://') ? new URL(input).hostname : input;
    return String(raw || '').replace(/^\.+|\.+$/g, '').toLowerCase().replace(/^www\./, '');
  } catch (_) {
    return String(input || '').replace(/^\.+|\.+$/g, '').toLowerCase().replace(/^www\./, '');
  }
}

/**
 * Extract hostname from any URL string cleanly
 */
function hostnameFromUrl(url = '') {
  return cleanHostname(url);
}

// --- Module: background/tab-context.js ---
/**
 * Tab and Context Management for Background Service Worker
 */
async function getStore() {
  return chrome.storage.local.get(DEFAULTS);
}
async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}
async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
async function getActiveTabContext() {
  const tab = await getActiveTab();
  if (!tab?.id) return { ok: false, error: 'No active tab.' };
  const store = await getStore();
  const domain = hostnameFromUrl(tab.url);
  return {
    ok: true,
    tab,
    domain,
    settings: store.settings[domain] || null
  };
}

// --- Module: shared/ai-providers.js ---
/**
 * Standard AI / LLM Provider Definitions & Endpoints
 */
const AI_PROVIDERS_CONFIG = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    authHeader: 'query', // key passed as query param ?key=...
    docUrl: 'https://aistudio.google.com/app/apikey',
    defaultModels: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', isFree: true },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', isFree: true },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', isFree: false }
    ]
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelsUrl: 'https://openrouter.ai/api/v1/models',
    authHeader: 'bearer',
    docUrl: 'https://openrouter.ai/keys',
    defaultModels: [
      { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (Free)', isFree: true },
      { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash Exp (Free)', isFree: true },
      { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Free)', isFree: true },
      { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B (Free)', isFree: true },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', isFree: false }
    ]
  },
  groq: {
    id: 'groq',
    name: 'Groq Cloud',
    baseUrl: 'https://api.groq.com/openai/v1',
    modelsUrl: 'https://api.groq.com/openai/v1/models',
    authHeader: 'bearer',
    docUrl: 'https://console.groq.com/keys',
    defaultModels: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile (Free tier)', isFree: true },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant (Free tier)', isFree: true },
      { id: 'gemma2-9b-it', name: 'Gemma 2 9B (Free tier)', isFree: true },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (Free tier)', isFree: true }
    ]
  },
  nvidia: {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    modelsUrl: 'https://integrate.api.nvidia.com/v1/models',
    authHeader: 'bearer',
    docUrl: 'https://build.nvidia.com',
    defaultModels: [
      { id: 'meta/llama-3.1-70b-instruct', name: 'Llama 3.1 70B Instruct', isFree: true },
      { id: 'meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B Instruct', isFree: true },
      { id: 'mistralai/mixtral-8x22b-instruct-v0.1', name: 'Mixtral 8x22B Instruct', isFree: true }
    ]
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    modelsUrl: 'https://api.openai.com/v1/models',
    authHeader: 'bearer',
    docUrl: 'https://platform.openai.com/api-keys',
    defaultModels: [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', isFree: false },
      { id: 'gpt-4o', name: 'GPT-4o', isFree: false },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', isFree: false }
    ]
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    modelsUrl: null,
    authHeader: 'x-api-key',
    docUrl: 'https://console.anthropic.com/settings/keys',
    defaultModels: [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', isFree: false },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', isFree: false }
    ]
  },
  custom: {
    id: 'custom',
    name: 'Custom / Ollama / Local',
    baseUrl: 'http://localhost:11434/v1',
    modelsUrl: 'http://localhost:11434/v1/models',
    authHeader: 'bearer',
    docUrl: 'https://ollama.com',
    defaultModels: [
      { id: 'llama3.2', name: 'Llama 3.2 (Local)', isFree: true },
      { id: 'qwen2.5', name: 'Qwen 2.5 (Local)', isFree: true },
      { id: 'mistral', name: 'Mistral (Local)', isFree: true }
    ]
  }
};

// --- Module: background/llm-client.js ---
/**
 * Universal LLM API Client & Model Discovery
 * Supports Google Gemini, OpenRouter, Groq, NVIDIA, OpenAI, Anthropic, and Ollama/Custom.
 */
async function fetchProviderModels(providerType, apiKey, customBaseUrl = '') {
  const config = AI_PROVIDERS_CONFIG[providerType] || AI_PROVIDERS_CONFIG.custom;
  const baseUrl = customBaseUrl.trim() || config.baseUrl;

  try {
    if (providerType === 'gemini') {
      const url = `${baseUrl}/models?key=${encodeURIComponent(apiKey.trim())}`;
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Gemini API HTTP ${res.status}`);
      }
      const data = await res.json();
      const rawModels = data.models || [];
      const models = rawModels
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => {
          const id = m.name.replace(/^models\//, '');
          const isFree = id.includes('flash') || id.includes('exp');
          return {
            id,
            name: m.displayName || id,
            description: m.description || '',
            isFree
          };
        });
      return { ok: true, models: models.length ? models : config.defaultModels };
    }

    if (providerType === 'anthropic') {
      // Anthropic does not have a public models list endpoint with simple key query; return standard list
      return { ok: true, models: config.defaultModels };
    }

    // OpenAI-compatible endpoints (OpenRouter, Groq, NVIDIA, OpenAI, Custom/Ollama)
    const modelsEndpoint = config.modelsUrl ? (customBaseUrl ? `${customBaseUrl}/models` : config.modelsUrl) : `${baseUrl}/models`;
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey?.trim()) {
      headers.Authorization = `Bearer ${apiKey.trim()}`;
    }

    const res = await fetch(modelsEndpoint, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API HTTP ${res.status}`);
    }
    const data = await res.json();
    const rawList = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];

    const models = rawList.map((m) => {
      const id = m.id || m.name;
      let isFree = false;
      if (providerType === 'openrouter') {
        isFree = id.endsWith(':free') || m.pricing?.prompt === '0' || Number(m.pricing?.prompt) === 0;
      } else if (providerType === 'groq' || providerType === 'custom') {
        isFree = true;
      }
      return {
        id,
        name: m.name || id,
        description: m.description || '',
        isFree
      };
    });

    return { ok: true, models: models.length ? models : config.defaultModels };
  } catch (error) {
    console.error(`[Fetch Models Error ${providerType}]:`, error);
    return { ok: false, error: error.message, models: config.defaultModels };
  }
}
async function callLLM({ providerType, apiKey, baseUrl, model, prompt, systemPrompt = '' }) {
  const config = AI_PROVIDERS_CONFIG[providerType] || AI_PROVIDERS_CONFIG.custom;
  const endpointBase = (baseUrl || config.baseUrl).replace(/\/+$/, '');

  try {
    if (providerType === 'gemini') {
      const modelId = model || 'gemini-1.5-flash';
      const url = `${endpointBase}/models/${modelId}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
      const body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 }
      };
      if (systemPrompt) {
        body.systemInstruction = { parts: [{ text: systemPrompt }] };
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Gemini API error ${res.status}`);
      }
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return { ok: true, text };
    }

    if (providerType === 'anthropic') {
      const modelId = model || 'claude-3-5-haiku-20241022';
      const url = `${endpointBase}/messages`;
      const body = {
        model: modelId,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }]
      };
      if (systemPrompt) body.system = systemPrompt;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey.trim(),
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Anthropic error ${res.status}`);
      }
      const data = await res.json();
      const text = data.content?.[0]?.text || '';
      return { ok: true, text };
    }

    // OpenAI-compatible (OpenRouter, Groq, NVIDIA, OpenAI, Ollama)
    const modelId = model || (providerType === 'groq' ? 'llama-3.3-70b-versatile' : providerType === 'openrouter' ? 'meta-llama/llama-3.3-70b-instruct:free' : 'gpt-4o-mini');
    const url = `${endpointBase}/chat/completions`;
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey?.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
    if (providerType === 'openrouter') {
      headers['HTTP-Referer'] = 'https://easyweb.extension';
      headers['X-Title'] = 'EasyWeb Extension';
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelId,
        messages,
        temperature: 0.3
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Chat API error ${res.status}`);
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    return { ok: true, text };
  } catch (error) {
    console.error(`[LLM Completion Error (${providerType})]:`, error);
    return { ok: false, error: error.message };
  }
}

// --- Module: background/translation-service.js ---
/**
 * Background Translation Service
 * Implements high-speed batch translation via Google Translate GTX API
 * and AI-driven translation using configured LLM providers.
 */

const translationCache = new Map();
const SEPARATOR = '\n====EW_SEP====\n';

/**
 * Translate a single chunk or joined text block via Google Translate GTX endpoint
 */
async function fetchGoogleTranslate(text, targetLang = 'fa') {
  if (!text || !text.trim()) return text;
  const cacheKey = `google:${targetLang}:${text}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Google Translate HTTP ${response.status}`);
    }
    const data = await response.json();
    let translated = '';
    if (Array.isArray(data?.[0])) {
      translated = data[0].map((item) => (Array.isArray(item) ? item[0] : '')).join('');
    } else {
      translated = text;
    }
    translationCache.set(cacheKey, translated);
    return translated;
  } catch (error) {
    console.error('[EasyWeb Translation Error]:', error);
    return text;
  }
}

/**
 * Translate a batch using an active AI / LLM Provider
 */
async function translateWithAI(texts = [], targetLang = 'fa', tone = 'standard', customPrompt = '') {
  const store = await chrome.storage.local.get({ providers: [], activeProviderId: '', translationAi: {} });
  const providers = store.providers || [];
  const activeId = store.translationAi?.providerId || store.activeProviderId;
  const provider = providers.find((p) => p.id === activeId) || providers[0];

  if (!provider || !provider.secret) {
    console.warn('[EasyWeb AI Translate]: No AI provider configured, falling back to Google Translate.');
    return null;
  }

  const model = store.translationAi?.model || provider.selectedModel || provider.defaultModel;
  const targetLangNames = {
    fa: 'Persian (فارسی)',
    en: 'English',
    ar: 'Arabic (العربية)',
    fr: 'French (Français)',
    de: 'German (Deutsch)',
    es: 'Spanish (Español)',
    tr: 'Turkish (Türkçe)',
    ru: 'Russian (Русский)',
    zh: 'Chinese (中文)',
    ja: 'Japanese (日本語)'
  };
  const langName = targetLangNames[targetLang] || targetLang;

  const toneInstructions = {
    standard: 'Translate with a fluent, natural, and idiomatic tone.',
    formal: 'Translate with a highly formal, scholarly, and professional tone suitable for official or academic texts.',
    colloquial: 'Translate with a friendly, conversational, and accessible everyday tone.',
    literal: 'Translate with high precision, strictly preserving the original sentence structure and literal meanings.',
    simplified: 'Translate into clear, simplified, and easy-to-understand language.',
    custom: customPrompt?.trim() || 'Translate accurately and naturally.'
  };

  const selectedTone = (tone === 'custom' && customPrompt?.trim())
    ? customPrompt.trim()
    : ((toneInstructions[tone] || toneInstructions.standard) + (customPrompt?.trim() ? ` Additional guidance: ${customPrompt.trim()}` : ''));

  const combined = texts.join(SEPARATOR);
  const systemPrompt = `You are a professional website translator. Translate the following text blocks into ${langName}.\nTranslation Style & Instructions: ${selectedTone}\nPreserve all line breaks, code tokens, technical tags, and punctuation. Maintain exact count of blocks separated by '====EW_SEP===='. Output ONLY the translated blocks separated by '====EW_SEP====' with NO commentary.`;

  const response = await callLLM({
    providerType: provider.type,
    apiKey: provider.secret,
    baseUrl: provider.baseUrl,
    model,
    prompt: combined,
    systemPrompt
  });

  if (!response?.ok || !response?.text) {
    console.error('[EasyWeb AI Translate Error]:', response?.error);
    return null;
  }

  const parts = response.text.split(/====EW_SEP====/i);
  return texts.map((original, i) => (parts[i] !== undefined ? parts[i].trim() : original));
}

/**
 * Main batch translation handler: dispatches to Google Translate or AI engine.
 */
async function translateBatch(texts = [], targetLang = 'fa', engine = 'google', tone = 'standard', customPrompt = '') {
  if (!Array.isArray(texts) || !texts.length) {
    return { ok: true, translations: [] };
  }

  // 1. If engine is 'ai', attempt AI translation
  if (engine === 'ai') {
    const aiResults = await translateWithAI(texts, targetLang, tone, customPrompt);
    if (aiResults && aiResults.length === texts.length) {
      return { ok: true, translations: aiResults };
    }
    // Fallback to Google Translate if AI is not configured or fails
  }

  // 2. Default high-speed Google Translate
  const results = new Array(texts.length);
  const toFetchIndices = [];
  const toFetchTexts = [];

  texts.forEach((txt, idx) => {
    const clean = String(txt || '').trim();
    if (!clean) {
      results[idx] = txt;
      return;
    }
    const cacheKey = `google:${targetLang}:${clean}`;
    if (translationCache.has(cacheKey)) {
      results[idx] = translationCache.get(cacheKey);
    } else {
      toFetchIndices.push(idx);
      toFetchTexts.push(clean);
    }
  });

  if (!toFetchTexts.length) {
    return { ok: true, translations: results };
  }

  // Chunk into batches
  const chunks = [];
  let currentChunk = [];
  let currentLength = 0;
  let currentIndices = [];

  for (let i = 0; i < toFetchTexts.length; i++) {
    const item = toFetchTexts[i];
    const index = toFetchIndices[i];
    if (currentChunk.length >= 20 || currentLength + item.length > 2500) {
      chunks.push({ texts: currentChunk, indices: currentIndices });
      currentChunk = [];
      currentIndices = [];
      currentLength = 0;
    }
    currentChunk.push(item);
    currentIndices.push(index);
    currentLength += item.length;
  }
  if (currentChunk.length) {
    chunks.push({ texts: currentChunk, indices: currentIndices });
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      const combined = chunk.texts.join(SEPARATOR);
      const translatedCombined = await fetchGoogleTranslate(combined, targetLang);
      const parts = translatedCombined.split(new RegExp(SEPARATOR.trim(), 'i'));

      chunk.indices.forEach((origIndex, i) => {
        const trans = (parts[i] !== undefined ? parts[i] : chunk.texts[i]).trim();
        results[origIndex] = trans || texts[origIndex];
        const cacheKey = `google:${targetLang}:${chunk.texts[i]}`;
        translationCache.set(cacheKey, results[origIndex]);
      });
    })
  );

  return { ok: true, translations: results };
}

// --- Module: background/index.js ---
/**
 * Background Service Worker Entry Point
 */





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
})();
