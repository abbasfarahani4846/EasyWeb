/**
 * Universal LLM API Client & Model Discovery
 * Supports Google Gemini, OpenRouter, Groq, NVIDIA, OpenAI, Anthropic, and Ollama/Custom.
 */
import { AI_PROVIDERS_CONFIG } from '../shared/ai-providers.js';

export async function fetchProviderModels(providerType, apiKey, customBaseUrl = '') {
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
    console.warn(`[Fetch Models Error ${providerType}]:`, error.message);
    return { ok: false, error: error.message, models: config.defaultModels };
  }
}

export async function callLLM({ providerType, apiKey, baseUrl, model, prompt, systemPrompt = '' }) {
  const config = AI_PROVIDERS_CONFIG[providerType] || AI_PROVIDERS_CONFIG.custom;
  const endpointBase = (baseUrl || config.baseUrl).replace(/\/+$/, '');
  // ponytail: 35s timeout ceiling for chat completion requests
  const timeoutSignal = AbortSignal.timeout(35000);

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
        body: JSON.stringify(body),
        signal: timeoutSignal
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 524) throw new Error('Chat API timeout 524: server took too long to respond');
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
        body: JSON.stringify(body),
        signal: timeoutSignal
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 524) throw new Error('Chat API timeout 524: server took too long to respond');
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
      }),
      signal: timeoutSignal
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 524) throw new Error('Chat API timeout 524: server took too long to respond');
      throw new Error(err.error?.message || `Chat API error ${res.status}`);
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    return { ok: true, text };
  } catch (error) {
    const isTimeout = error.name === 'TimeoutError' || error.name === 'AbortError';
    const msg = isTimeout ? 'Chat API request timed out (35s)' : error.message;
    console.warn(`[LLM Completion Error (${providerType})]:`, msg);
    return { ok: false, error: msg };
  }
}
