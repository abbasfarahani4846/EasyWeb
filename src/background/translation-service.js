/**
 * Background Translation Service
 * Implements high-speed batch translation via Google Translate GTX API
 * and AI-driven translation using configured LLM providers.
 */
import { callLLM } from './llm-client.js';

const translationCache = new Map();
const SEPARATOR = '\n====EW_SEP====\n';

/**
 * Translate a single chunk or joined text block via Google Translate GTX endpoint
 */
export async function fetchGoogleTranslate(text, targetLang = 'fa') {
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
export async function translateWithAI(texts = [], targetLang = 'fa', tone = 'standard', customPrompt = '') {
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
export async function translateBatch(texts = [], targetLang = 'fa', engine = 'google', tone = 'standard', customPrompt = '') {
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
