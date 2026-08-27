/**
 * In-Page DOM Translation & Restoration Engine
 */
import { isContextValid } from '../core/context.js';

const originalTextMap = new Map();
let isTranslating = false;

function shouldTranslateNode(node) {
  if (!node || node.nodeType !== Node.TEXT_NODE) return false;
  const text = (node.textContent || '').trim();
  if (!text || text.length <= 1) return false;
  // Skip numbers only or pure punctuation
  if (/^[\d\s\p{P}]+$/u.test(text)) return false;

  const parent = node.parentElement;
  if (!parent) return false;
  if (parent.closest('code, pre, kbd, samp, script, style, noscript, textarea, input, select, svg, math, [contenteditable="true"]')) {
    return false;
  }
  if (parent.closest('#easyweb-floating-confirmation, #easyweb-runtime-style')) {
    return false;
  }
  const tag = parent.tagName.toLowerCase();
  if (['script', 'style', 'noscript', 'textarea', 'input', 'select'].includes(tag)) {
    return false;
  }
  return true;
}

export function restoreTranslations(root) {
  if (!root || root === document.body || root === document.documentElement) {
    originalTextMap.forEach((original, node) => {
      try {
        if (node && node.parentNode) {
          node.textContent = original;
        }
      } catch (_) {}
    });
    originalTextMap.clear();
    return;
  }

  const toDelete = [];
  originalTextMap.forEach((original, node) => {
    try {
      if (root.contains && root.contains(node)) {
        if (node && node.parentNode) {
          node.textContent = original;
        }
        toDelete.push(node);
      }
    } catch (_) {}
  });
  toDelete.forEach((node) => originalTextMap.delete(node));
}

export async function translateRoot(root, targetLang = 'fa', engine = 'google', tone = 'standard', customPrompt = '') {
  if (!root || !isContextValid()) return;
  if (isTranslating) return;
  isTranslating = true;

  try {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    const texts = [];
    let node;

    while ((node = walker.nextNode())) {
      if (shouldTranslateNode(node)) {
        nodes.push(node);
        // Save original text if not already saved
        if (!originalTextMap.has(node)) {
          originalTextMap.set(node, node.textContent);
        }
        texts.push(originalTextMap.get(node) || node.textContent);
      }
    }

    if (!texts.length) {
      isTranslating = false;
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: 'TRANSLATE_BATCH',
      texts,
      targetLang,
      engine,
      tone,
      customPrompt
    });

    if (response?.ok && Array.isArray(response.translations)) {
      response.translations.forEach((translatedText, idx) => {
        const targetNode = nodes[idx];
        if (targetNode && targetNode.parentNode && translatedText) {
          targetNode.textContent = translatedText;
        }
      });
    }
  } catch (error) {
    console.error('[EasyWeb Translate Root Error]:', error);
  } finally {
    isTranslating = false;
  }
}
