/**
 * Ad Blocker Card Controller
 *
 * Drives the per-site blocker controls in the popup:
 * master switch, mode preset, per-site toggles, list membership and counters.
 */

import {
  TOGGLE_META,
  TOGGLE_KEYS,
  SITE_MODES,
  PICKED_MODES,
  MODE_PRESETS,
  DEFAULT_ADBLOCK,
  resolveToggles,
  describeSiteState,
  activePickedSelector,
  formatCount
} from '../../shared/adblock.js';
import { state, $, setStatus, reloadSite, ensureContentScript, messageTab } from '../state.js';

/** Pull the live blocker state for the active tab from the background worker. */
export async function refreshAdblock() {
  try {
    const [status, prefs] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'ADBLOCK_STATUS', tabId: state.tabId || undefined }),
      chrome.storage.local.get({ adPickMode: 'hide' })
    ]);
    if (status?.ok) state.adblock = status;
    state.adPickMode = prefs.adPickMode === 'remove' ? 'remove' : 'hide';
    return status;
  } catch (_) {
    return null;
  }
}

function effectiveToggles() {
  if (state.adblock?.toggles) return { ...state.adblock.toggles };
  return resolveToggles(
    state.adblock?.global || DEFAULT_ADBLOCK,
    state.site,
    state.domain
  );
}

async function setSiteBlocker(patch, renderCallback) {
  if (!state.domain) {
    setStatus('یک صفحه وب را باز کنید', true);
    return;
  }
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'ADBLOCK_SET_SITE',
      domain: state.domain,
      blocker: patch
    });
    if (!response?.ok) setStatus('خطا در ذخیره تنظیمات ادبلاکر', true);
  } catch (err) {
    console.error('[EasyWeb Adblock Save Error]:', err);
    setStatus('ارتباط با افزونه برقرار نشد؛ دوباره تلاش کنید', true);
  } finally {
    // Always re-read from storage. The write may have landed even when the reply
    // never made it back (the service worker can be restarting), and skipping
    // this was what left the list showing stale rules.
    await reloadSite();
    await refreshAdblock();
    // Push the change to the page explicitly, re-injecting the content script if
    // the extension has been reloaded since the page was opened.
    await messageTab({ type: 'RESYNC' });
    renderCallback();
  }
}

async function setListMembership(list, present, renderCallback) {
  if (!state.domain) return;
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'ADBLOCK_SET_LIST',
      list,
      domain: state.domain,
      present
    });
    if (response?.ok) {
      setStatus(present
        ? (list === 'whitelist' ? '✓ به لیست سفید اضافه شد' : '✓ به لیست سیاه اضافه شد')
        : '✓ از لیست حذف شد');
    } else {
      setStatus('خطا در ذخیره لیست', true);
    }
  } catch (err) {
    console.error('[EasyWeb Adblock List Error]:', err);
    setStatus('ارتباط با افزونه برقرار نشد؛ دوباره تلاش کنید', true);
  } finally {
    await reloadSite();
    await refreshAdblock();
    await messageTab({ type: 'RESYNC' });
    renderCallback();
  }
}

/* ---------------- Hand-picked advertising sections ---------------- */

function pickedRules() {
  return Array.isArray(state.site?.blocker?.picked) ? state.site.blocker.picked : [];
}

/** Replace the whole picked list (the background merges it into the site). */
async function writePicked(nextList, renderCallback, message) {
  await setSiteBlocker({ picked: nextList }, renderCallback);
  if (message) setStatus(message);
}

async function updatePickedRule(id, patch, renderCallback) {
  const next = pickedRules().map((rule) => (rule.id === id ? { ...rule, ...patch } : rule));
  await writePicked(next, renderCallback, '✓ ذخیره شد');
}

async function removePickedRule(id, renderCallback) {
  const next = pickedRules().filter((rule) => rule.id !== id);
  await writePicked(next, renderCallback, '✓ قانون حذف شد');
}

/**
 * Close the popup and hand control to the in-page picker. The user then clicks
 * the offending section; the content script persists the rule and applies it.
 */
async function startAdPick() {
  if (!state.tabId) return setStatus('یک صفحه وب را باز کنید', true);

  const ready = await ensureContentScript();
  if (!ready) return setStatus('اسکریپت صفحه در دسترس نیست', true);

  const mode = $('adblock-pick-mode')?.value === 'remove' ? 'remove' : 'hide';
  try {
    await chrome.storage.local.set({ adPickMode: mode });
  } catch (_) {}
  state.adPickMode = mode;

  const result = await chrome.tabs
    .sendMessage(state.tabId, { type: 'START_PICKER', feature: 'adblock', mode })
    .catch(() => null);

  if (result?.ok) window.close();
  else setStatus('انتخاب‌گر در دسترس نیست', true);
}

export function bindAdblockCard(renderCallback) {
  $('adblock-enabled').onchange = async () => {
    const checked = $('adblock-enabled').checked;
    try {
      await chrome.runtime.sendMessage({
        type: 'ADBLOCK_UPDATE_GLOBAL',
        patch: { enabled: checked }
      });
      setStatus(checked ? '✓ ادبلاکر برای همه سایت‌ها فعال شد' : '✓ ادبلاکر در همه سایت‌ها غیرفعال شد');
    } catch (_) {
      setStatus('خطا در تغییر وضعیت سراسری ادبلاکر', true);
    } finally {
      await reloadSite();
      await refreshAdblock();
      await messageTab({ type: 'RESYNC' });
      renderCallback();
    }
  };

  const siteToggle = $('adblock-site-toggle');
  if (siteToggle) {
    siteToggle.onchange = async () => {
      const checked = siteToggle.checked;
      const patch = checked
        ? { enabled: true, mode: 'strict' }
        : { enabled: false, mode: 'off' };
      await setSiteBlocker(patch, renderCallback);
      setStatus(checked ? '✓ ادبلاکر در این سایت فعال شد' : '✓ ادبلاکر در این سایت غیرفعال شد');
    };
  }

  if ($('adblock-mode')) {
    $('adblock-mode').onchange = async () => {
      const mode = $('adblock-mode').value;
      await setSiteBlocker({ mode }, renderCallback);
      setStatus('✓ حالت مسدودسازی ذخیره شد');
    };
  }

  $('adblock-whitelist').onclick = async () => {
    const present = !state.adblock?.whitelisted;
    await setListMembership('whitelist', present, renderCallback);
  };

  $('adblock-blacklist').onclick = async () => {
    const present = !state.adblock?.blacklisted;
    await setListMembership('blacklist', present, renderCallback);
  };

  $('adblock-reset-stats').onclick = async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'ADBLOCK_RESET_STATS' });
      await refreshAdblock();
      setStatus('✓ آمار صفر شد');
    } catch (_) {
      setStatus('خطا در صفر کردن آمار', true);
    }
    renderCallback();
  };

  $('adblock-open-settings').onclick = () => openBlockerSettings();

  $('adblock-pick').onclick = () => startAdPick();

  $('adblock-pick-mode').onchange = async () => {
    const mode = $('adblock-pick-mode').value === 'remove' ? 'remove' : 'hide';
    state.adPickMode = mode;
    try {
      await chrome.storage.local.set({ adPickMode: mode });
    } catch (_) {}
    const meta = PICKED_MODES.find((m) => m.id === mode);
    setStatus(meta ? `✓ حالت «${meta.name}» انتخاب شد` : '✓ ذخیره شد');
  };
}

/** Build the five per-site toggle rows once. */
function ensureToggleRows() {
  const container = $('adblock-toggles');
  if (!container || container.children.length) return;

  TOGGLE_KEYS.forEach((key) => {
    const meta = TOGGLE_META[key];
    const row = document.createElement('label');
    row.className = 'ab-toggle-row';
    row.title = meta.hint;

    const text = document.createElement('span');
    text.className = 'ab-toggle-text';
    text.innerHTML = `<b>${meta.name}</b><i>${meta.hint}</i>`;

    const sw = document.createElement('span');
    sw.className = 'switch ab-switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `ab-toggle-${key}`;
    sw.append(input, document.createElement('span'));

    input.onchange = async () => {
      const toggles = { ...effectiveToggles(), [key]: input.checked };
      await setSiteBlocker({ mode: 'custom', toggles, enabled: true }, () => renderAdblockCard());
      setStatus(input.checked ? '✓ فعال شد' : '✓ غیرفعال شد');
    };

    row.append(text, sw);
    container.append(row);
  });
}

function renderModeOptions() {
  const select = $('adblock-mode');
  if (!select) return;
  if (!select.children.length) {
    const opt = document.createElement('option');
    opt.value = 'strict';
    opt.textContent = 'کامل (مسدودسازی تمام تبلیغات)';
    select.append(opt);
  }
  select.value = 'strict';
}

function renderPickedList() {
  const list = $('adblock-picked-list');
  if (!list) return;
  list.replaceChildren();

  const rules = pickedRules();
  // Keep the collapsed card compact when there is nothing to show.
  list.classList.toggle('hidden', rules.length === 0);
  if (!rules.length) return;

  rules.forEach((rule) => {
    const row = document.createElement('div');
    row.className = 'ab-picked-row' + (rule.enabled === false ? ' disabled' : '');

    const top = document.createElement('div');
    top.className = 'ab-picked-top';

    const name = document.createElement('span');
    name.className = 'ab-picked-name';
    name.textContent = rule.label || rule.selector;
    name.title = rule.selector;

    const matchBadge = document.createElement('span');
    matchBadge.className = 'ab-match';
    matchBadge.dataset.ruleId = rule.id;
    matchBadge.hidden = true;

    const powerBtn = document.createElement('button');
    powerBtn.className = 'ab-mini' + (rule.enabled !== false ? ' on' : '');
    powerBtn.textContent = rule.enabled !== false ? 'روشن' : 'خاموش';
    powerBtn.title = rule.enabled !== false ? 'کلیک برای غیرفعال کردن' : 'کلیک برای فعال کردن';
    powerBtn.onclick = () => updatePickedRule(
      rule.id, { enabled: rule.enabled === false }, () => renderAdblockCard()
    );

    top.append(name, matchBadge, powerBtn);

    const active = activePickedSelector(rule);
    const code = document.createElement('code');
    code.className = 'ab-picked-sel';
    code.textContent = active;
    code.title = active;

    const actions = document.createElement('div');
    actions.className = 'ab-picked-actions';

    const modeBtn = document.createElement('button');
    modeBtn.className = 'ab-mini' + (rule.mode === 'remove' ? ' on' : '');
    modeBtn.textContent = rule.mode === 'remove' ? 'حذف کامل' : 'مخفی';
    modeBtn.title = 'تغییر حالت: مخفی کردن یا حذف کامل';
    modeBtn.onclick = () => updatePickedRule(
      rule.id, { mode: rule.mode === 'remove' ? 'hide' : 'remove' }, () => renderAdblockCard()
    );
    actions.append(modeBtn);

    // Only offered when a broader class-based selector was found.
    if (rule.broad) {
      const broadBtn = document.createElement('button');
      broadBtn.className = 'ab-mini' + (rule.useBroad ? ' on' : '');
      broadBtn.textContent = 'گسترده';
      broadBtn.title = `سلکتور گسترده: ${rule.broad}\nمناسب وقتی بخش در هر بارگذاری از نو ساخته می‌شود`;
      broadBtn.onclick = () => updatePickedRule(
        rule.id, { useBroad: !rule.useBroad }, () => renderAdblockCard()
      );
      actions.append(broadBtn);
    }

    const del = document.createElement('button');
    del.className = 'ab-mini danger';
    del.textContent = '✕';
    del.title = 'حذف این قانون';
    del.onclick = () => removePickedRule(rule.id, () => renderAdblockCard());
    actions.append(del);

    row.append(top, code, actions);
    list.append(row);
  });

  markRuleEffectiveness(rules);
}

/**
 * Ask the page whether each rule still matches anything and label it.
 * A rule whose selector no longer matches is the silent failure mode this
 * feature is most prone to, so it is surfaced rather than hidden.
 */
async function markRuleEffectiveness(rules) {
  if (!state.tabId || !rules.length) return;

  const selectors = rules.map((rule) => activePickedSelector(rule)).filter(Boolean);
  if (!selectors.length) return;

  let response = null;
  try {
    response = await chrome.tabs.sendMessage(state.tabId, {
      type: 'ADBLOCK_TEST_SELECTORS',
      selectors
    });
  } catch (_) {
    return;
  }
  if (!response?.ok) return;

  rules.forEach((rule) => {
    const badge = document.querySelector(`.ab-match[data-rule-id="${rule.id}"]`);
    if (!badge) return;

    const count = response.results?.[activePickedSelector(rule)];
    if (count === undefined) return;

    if (count < 0) {
      badge.textContent = 'سلکتور نامعتبر';
      badge.className = 'ab-match bad';
    } else if (count === 0) {
      badge.textContent = 'پیدا نشد';
      badge.className = 'ab-match warn';
      badge.title = 'این سلکتور همین حالا چیزی در صفحه پیدا نمیکند. اگر بخش بعد از رفرش برنگشت، دکمه «گسترده» را امتحان کنید.';
    } else {
      badge.textContent = `${formatCount(count)} مورد`;
      badge.className = 'ab-match ok';
      badge.title = 'این سلکتور همین حالا در صفحه اعمال میشود.';
    }
    badge.hidden = false;
  });
}

export function renderAdblockCard() {
  const card = $('adblock-card');
  if (!card) return;

  ensureToggleRows();
  renderModeOptions();
  renderPickedList();

  const pickMode = $('adblock-pick-mode');
  if (pickMode) pickMode.value = state.adPickMode || 'hide';

  const global = state.adblock?.global || DEFAULT_ADBLOCK;
  const globalOn = global.enabled !== false;
  const toggles = effectiveToggles();
  const reason = state.adblock?.toggles?.reason || '';
  const siteOn = Boolean(state.site?.blocker?.enabled !== false) && reason !== 'site-off' && !state.adblock?.whitelisted;
  const anyActive = TOGGLE_KEYS.some((key) => toggles[key]);
  const active = globalOn && siteOn && anyActive;

  // Master global switch
  $('adblock-enabled').checked = globalOn;

  // Per-site toggle
  const siteToggle = $('adblock-site-toggle');
  if (siteToggle) {
    siteToggle.checked = siteOn;
    siteToggle.disabled = !globalOn;
  }

  // Switched off globally or for this site -> show only the title and the switch.
  card.classList.toggle('collapsed', !active);

  const status = $('adblock-status');
  if (status) {
    if (!globalOn) {
      status.innerHTML = '<span class="ab-warn">ادبلاکر سراسری خاموش است</span>';
    } else if (state.adblock?.whitelisted) {
      status.innerHTML = '<span class="ab-warn">این سایت در لیست سفید است</span>';
    } else if (!siteOn) {
      status.innerHTML = '<span class="ab-muted">در این سایت غیرفعال</span>';
    } else {
      const parts = [];
      if (state.adblock?.tabCount) parts.push(`<b>${formatCount(state.adblock.tabCount)}</b> مورد در این صفحه`);
      if (state.adblock?.stats?.total) parts.push(`${formatCount(state.adblock.stats.total)} مورد در کل`);
      status.innerHTML = parts.length
        ? `🛡️ ${parts.join(' · ')}`
        : `<span class="ab-muted">${describeSiteState(global, state.site, state.domain)}</span>`;
    }
  }

  TOGGLE_KEYS.forEach((key) => {
    const input = $(`ab-toggle-${key}`);
    if (input) input.checked = Boolean(toggles[key]);
  });

  const badge = $('adblock-badge');
  if (badge) {
    const popupBlocked = state.adblock?.stats?.popups || 0;
    if (!active) {
      const why = !globalOn ? 'سراسری خاموش' : (state.adblock?.whitelisted ? 'لیست سفید' : 'غیرفعال');
      if (why) {
        badge.textContent = why;
        badge.classList.remove('hidden');
        badge.classList.add('warn');
      } else {
        badge.classList.add('hidden');
        badge.classList.remove('warn');
      }
    } else if (popupBlocked > 0) {
      badge.textContent = `${formatCount(popupBlocked)} پاپ‌آپ`;
      badge.classList.remove('hidden');
      badge.classList.add('warn');
    } else {
      badge.classList.add('hidden');
      badge.classList.remove('warn');
    }
  }

  const wl = $('adblock-whitelist');
  const bl = $('adblock-blacklist');
  if (wl) {
    wl.textContent = state.adblock?.whitelisted ? '✓ در لیست سفید' : '＋ لیست سفید';
    wl.classList.toggle('active', Boolean(state.adblock?.whitelisted));
  }
  if (bl) {
    bl.textContent = state.adblock?.blacklisted ? '✓ در لیست سیاه' : '＋ لیست سیاه';
    bl.classList.toggle('active', Boolean(state.adblock?.blacklisted));
  }

  const stats = $('adblock-stats');
  if (stats) {
    const s = state.adblock?.stats || {};
    stats.innerHTML = `
      <span>تبلیغات شبکه: <b>${formatCount(s.total || 0)}</b></span>
      <span>پاپ‌آپ بسته‌شده: <b>${formatCount(s.popups || 0)}</b></span>
      <span>عنصر پنهان‌شده: <b>${formatCount(s.cosmetic || 0)}</b></span>
    `;
  }
}

/** Open the sidebar directly on the blocker tab. */
export async function openBlockerSettings() {
  try {
    await chrome.storage.local.set({ sidebarTab: 'adblock' });
  } catch (_) {}
  const button = $('open-sidebar');
  if (button) button.click();
}

export { MODE_PRESETS };
