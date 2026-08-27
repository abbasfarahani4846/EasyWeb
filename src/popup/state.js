/**
 * Reactive Popup State Management
 */
import { DEFAULT_SITE, DEFAULTS } from '../shared/defaults.js';
import { migrateSite, syncSiteEnabled } from '../shared/models.js';

export const state = {
  domain: '',
  tabId: null,
  site: structuredClone(DEFAULT_SITE),
  fonts: [],
  activeTargetId: null,
  openPanels: []
};

export const $ = (id) => document.getElementById(id);

export function setStatus(message, error = false) {
  const node = $('status');
  if (!node) return;
  node.textContent = message;
  node.style.color = error ? '#ff8d9c' : '';
}

export function activeTarget(feature) {
  return state.site.targets.find((t) => t.id === state.activeTargetId) || null;
}

export async function getStorage() {
  return chrome.storage.local.get(DEFAULTS);
}

export async function ensureContentScript() {
  if (!state.tabId) return false;
  let alive = false;
  try {
    const status = await chrome.tabs.sendMessage(state.tabId, { type: 'PING' });
    alive = !!(status?.ok && (!status.version || status.version === '10'));
  } catch (_) {}
  if (alive) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId: state.tabId }, files: ['content.js'] });
    return true;
  } catch (_) {
    return false;
  }
}

export async function pushSettings() {
  if (!state.tabId) return false;
  const ready = await ensureContentScript();
  if (!ready) return false;
  await chrome.tabs.sendMessage(state.tabId, { type: 'APPLY_SETTINGS', settings: state.site }).catch(() => {});
  return true;
}

export async function saveSite() {
  if (!state.domain) return;
  syncSiteEnabled(state.site);
  try {
    const store = await getStorage();
    const settingsMap = store.settings || {};
    settingsMap[state.domain] = state.site;
    await chrome.storage.local.set({ settings: settingsMap });
    if (state.tabId) {
      const applied = await pushSettings();
      if (applied) setStatus('✓ ذخیره و اعمال شد');
      else setStatus('✓ ذخیره شد');
    } else {
      setStatus('✓ ذخیره شد');
    }
  } catch (err) {
    console.error('[EasyWeb Save Error]:', err);
    setStatus('خطا در ذخیره‌سازی', true);
  }
}

export async function highlightOnPage(selector) {
  if (!state.tabId || !selector) return;
  await chrome.tabs.sendMessage(state.tabId, { type: 'HIGHLIGHT', selector }).catch(() => {});
}

export async function clearHighlightOnPage() {
  if (!state.tabId) return;
  await chrome.tabs.sendMessage(state.tabId, { type: 'CLEAR_HIGHLIGHT' }).catch(() => {});
}
