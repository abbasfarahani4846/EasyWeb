/**
 * Tab and Context Management for Background Service Worker
 */
import { hostnameFromUrl } from '../shared/domain.js';
import { DEFAULTS } from '../shared/defaults.js';

export async function getStore() {
  return chrome.storage.local.get(DEFAULTS);
}

export async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

export async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export async function getActiveTabContext() {
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
