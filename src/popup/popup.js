/**
 * Main Popup Controller & Lifecycle
 *
 * Two invariants matter here:
 *   1. The popup must never be left half-painted. Every async step is wrapped so
 *      that a failed message round-trip (the service worker may still be waking
 *      up) cannot stop `render()` from running.
 *   2. The panel is live. It subscribes to `chrome.storage.onChanged`, so a rule
 *      added or deleted from anywhere — including the in-page picker — shows up
 *      without closing and reopening the popup.
 */
import { DEFAULT_SITE, DEFAULTS } from '../shared/defaults.js';
import { migrateSite, syncSiteEnabled } from '../shared/models.js';
import { state, $, setStatus, getStorage, saveSite, pushSettings, reloadSite, messageTab } from './state.js';
import { bindScopeTabs, renderScopeTabs } from './components/scope-tabs.js';
import { renderTargets } from './components/targets-list.js';
import { bindLayoutCard, renderLayoutCard } from './components/layout-card.js';
import { bindTypeCard, renderTypeCard } from './components/type-card.js';
import { bindTranslateCard, renderTranslateCard } from './components/translate-card.js';
import { bindPersianHint, checkPersianHint } from './components/persian-hint.js';
import { bindAdblockCard, renderAdblockCard, refreshAdblock } from './components/adblock-card.js';

/** Storage keys that change what the popup displays. */
const WATCHED_KEYS = ['settings', 'adblock', 'adblockStats', 'fonts', 'bundledFonts'];

function render() {
  renderScopeTabs();
  renderLayoutCard();
  renderTypeCard(render);
  renderTranslateCard();
  renderAdblockCard();
  renderTargets('direction', render);
  renderTargets('font', render);
  renderTargets('translate', render);
}

/** `chrome.runtime.sendMessage` that resolves instead of rejecting. */
async function sendSafe(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (err) {
    return { ok: false, error: err?.message || 'extension-unreachable' };
  }
}

/**
 * Ask the background for the active tab, retrying briefly. The very first
 * message after the popup opens is what wakes a sleeping service worker, so a
 * single rejection here is expected and must not kill the whole panel.
 */
async function getContextWithRetry(attempts = 3) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const context = await sendSafe({ type: 'GET_ACTIVE_CONTEXT' });
    if (context?.ok) return context;
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 80 * (attempt + 1)));
    } else {
      return context;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Live sync                                                           */
/* ------------------------------------------------------------------ */

let syncTimer = null;

/** Re-read everything the UI depends on and repaint. */
async function syncFromStorage() {
  try {
    const store = await getStorage();
    state.fonts = store.fonts || [];
    state.site = migrateSite((store.settings || {})[state.domain]);
  } catch (_) {}
  await refreshAdblock();

  // Never yank the value out from under someone who is mid-edit.
  const active = document.activeElement;
  const editing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');
  if (!editing) render();
}

function scheduleSync() {
  if (syncTimer) return;
  syncTimer = setTimeout(() => {
    syncTimer = null;
    syncFromStorage();
  }, 60);
}

function watchStorage() {
  if (!chrome.storage?.onChanged) return;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (WATCHED_KEYS.some((key) => key in changes)) scheduleSync();
  });
}

/* ------------------------------------------------------------------ */
/* Binding                                                             */
/* ------------------------------------------------------------------ */

function bind() {
  bindScopeTabs(render);
  bindLayoutCard(render);
  bindTypeCard(render);
  bindTranslateCard(render);
  bindPersianHint(render);
  bindAdblockCard(render);

  document.querySelectorAll('[data-advanced]').forEach((button) => {
    button.onclick = async () => {
      const panel = $(button.dataset.advanced + '-advanced');
      if (!panel) return;
      panel.classList.toggle('open');
      const openIds = [...document.querySelectorAll('.advanced.open')].map((p) => p.id);
      try {
        await chrome.storage.local.set({ openPanels: openIds });
      } catch (_) {}
    };
  });

  $('open-sidebar').onclick = async () => {
    if (state.tabId && chrome.sidePanel?.open) {
      try {
        await chrome.sidePanel.open({ tabId: state.tabId });
        window.close();
        return;
      } catch (_) {}
    }
    const result = await sendSafe({ type: 'OPEN_SIDEBAR' });
    if (!result?.ok) setStatus(result?.error || 'Sidebar unavailable', true);
    else window.close();
  };

  $('clear-all-data-popup')?.addEventListener('click', async () => {
    const ok = confirm('هشدار: آیا مطمئن هستید؟ تمامی داده‌ها و تنظیمات ذخیره‌شده توسط مرورگر (تنظیمات سایت‌ها، فونت‌ها و آمار) به طور کامل پاک خواهند شد.');
    if (!ok) return;
    try {
      await chrome.storage.local.clear();
      await chrome.storage.local.set(DEFAULTS);
      state.site = structuredClone(DEFAULT_SITE);
      state.fonts = [];
      await reloadSite();
      await refreshAdblock();
      await messageTab({ type: 'RESYNC' });
      render();
      setStatus('✓ تمام داده‌های مرورگر پاک شدند');
    } catch (err) {
      console.error('[EasyWeb Clear Error]:', err);
      setStatus('خطا در پاک‌سازی داده‌ها', true);
    }
  });

  window.addEventListener('blur', () => {
    const node = $('status');
    if (node) node.textContent = '';
  });
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

/** Apply a picker result that belongs to the layout / typography features. */
function applyTargetPick(result) {
  const feature = result.feature;
  if (!state.site[feature]) state.site[feature] = {};
  state.site[feature].scope = 'element';

  const existing = state.site.targets.find((t) => t.selector === result.selector);
  if (existing) {
    state.activeTargetId = existing.id;
  } else {
    const target = {
      id: `t${Math.random().toString(36).slice(2, 8)}`,
      selector: result.selector,
      label: result.label || result.selector,
      direction: null,
      font: null,
      translate: null
    };
    state.site.targets.push(target);
    state.activeTargetId = target.id;
  }

  const target = state.site.targets.find((t) => t.id === state.activeTargetId);
  if (!target) return;

  if (feature === 'direction') {
    target.direction = {
      ...DEFAULT_SITE.direction,
      enabled: true,
      value: $('direction-value').value,
      scope: 'element',
      selector: target.selector,
      label: target.label
    };
    $('direction-advanced')?.classList.add('open');
  } else if (feature === 'translate') {
    target.translate = {
      ...DEFAULT_SITE.translate,
      enabled: true,
      scope: 'element',
      selector: target.selector,
      label: target.label,
      targetLang: $('translate-target-lang')?.value || 'fa',
      engine: $('translate-engine')?.value || 'google'
    };
    $('translate-advanced')?.classList.add('open');
  } else {
    target.font = {
      ...DEFAULT_SITE.font,
      enabled: true,
      scope: 'element',
      selector: target.selector,
      label: target.label,
      family: $('font-family').value,
      size: Number($('font-size').value) || 16,
      unit: $('font-unit').value,
      lineHeight: $('line-height').value,
      weight: Number($('font-weight').value) || 400,
      align: $('text-align').value
    };
    $('font-advanced')?.classList.add('open');
  }

  syncSiteEnabled(state.site);
}

async function handlePickerResult() {
  const picked = await sendSafe({ type: 'GET_PICKER_RESULT' });
  const result = picked?.result;
  if (!result) return;

  if (result.feature === 'adblock') {
    // The content script already applied and persisted the rule, so we only need
    // to re-sync our copy and confirm.
    await reloadSite();
    await refreshAdblock();
    render();
    const label = result.label || result.selector;
    const how = result.mode === 'remove' ? 'حذف شد' : 'مخفی شد';
    setStatus(`✓ بخش «${label}» ${how} — از این پس در این سایت بلاک می‌شود`);
    return;
  }

  applyTargetPick(result);
  render();
  await saveSite();
  setStatus('✓ Section added');
}

async function init() {
  // Bind first, then paint the shell immediately: the panel must never be left
  // showing placeholders just because a later step failed.
  try {
    bind();
  } catch (err) {
    console.error('[EasyWeb Popup] bind failed:', err);
  }
  watchStorage();
  render();

  const context = await getContextWithRetry();
  if (!context?.ok) {
    setStatus(context?.error || 'صفحه‌ی وب فعالی پیدا نشد', true);
    return;
  }

  state.tabId = context.tab.id;
  state.domain = context.domain || '';
  $('domain').textContent = state.domain;

  try {
    const store = await getStorage();
    state.fonts = store.fonts || [];
    state.site = migrateSite((store.settings || {})[state.domain]);
    const openPanels = store.openPanels || [];
    openPanels.forEach((id) => $(id)?.classList.add('open'));
  } catch (err) {
    console.error('[EasyWeb Popup] initial state load failed:', err);
  }
  render();

  try {
    await handlePickerResult();
  } catch (err) {
    console.error('[EasyWeb Popup] picker result failed:', err);
  }

  // allSettled: one failing step must not skip the final repaint.
  await Promise.allSettled([checkPersianHint(), refreshAdblock()]);
  render();

  // Bring the page in line with current settings on every open. `pushSettings`
  // re-injects the content script when it is missing, so a page left with an
  // orphaned script (extension reloaded) recovers without a manual refresh.
  const applied = await pushSettings();
  if (applied && state.site.enabled) setStatus('Applied to this page');
}

init();
