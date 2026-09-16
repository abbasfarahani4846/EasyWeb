/**
 * Sidebar AI Assistant & Settings Modal Controller
 */
import { AI_PROVIDERS_CONFIG } from '../shared/ai-providers.js';
import { TOGGLE_META, TOGGLE_KEYS, MODE_PRESETS, formatCount } from '../shared/adblock.js';
import { DEFAULTS } from '../shared/defaults.js';
import { escapeHtml, assistantBody } from '../shared/markdown.js';

let activeTab = null;
let domain = '';
let pageText = '';
let providers = [];
let activeProviderId = '';
let translationAi = { providerId: '', model: '' };
let tools = [];
let historyKey = '';
let history = [];
let adblockConfig = null;
let adblockStats = null;
let adblockDiag = null;

const $ = (id) => document.getElementById(id);
const send = (message) => chrome.runtime.sendMessage(message);

function setStatus(text, error = false) {
  const nodes = [$('sidebar-status'), $('modal-status')].filter(Boolean);
  nodes.forEach((node) => {
    node.textContent = text;
    node.style.color = error ? '#ff8d9c' : '#27c8ba';
  });
  setTimeout(() => {
    nodes.forEach((node) => {
      if (node.textContent === text) node.textContent = '';
    });
  }, 4000);
}

/* Chat rendering */
function renderHistory() {
  const chat = $('chat');
  chat.replaceChildren();
  if (!history.length) {
    const welcome = document.createElement('div');
    welcome.className = 'welcome';
    welcome.innerHTML = '<span class="welcome-icon">✦</span><strong>درباره این صفحه هر سوالی دارید بپرسید</strong><p>خلاصه‌سازی، ترجمه متون، یا اجرای پرسش‌های هوشمند از محتوای صفحه.</p>';
    chat.append(welcome);
    return;
  }
  history.forEach((item) => {
    const node = document.createElement('div');
    node.className = `message ${item.role}`;
    const label = document.createElement('span');
    label.className = 'message-label';
    label.textContent = item.role === 'user' ? 'شما' : 'EasyWeb AI';
    if (item.role === 'assistant') {
      node.innerHTML = '';
      node.append(label);
      node.insertAdjacentHTML('beforeend', assistantBody(item.text));
    } else {
      node.append(label, document.createTextNode(item.text));
    }
    chat.append(node);
  });
  chat.scrollTop = chat.scrollHeight;
}

async function saveHistory() {
  if (!historyKey) return;
  try {
    const store = await chrome.storage.local.get({ chatHistory: {} });
    const chatHistory = store.chatHistory || {};
    chatHistory[historyKey] = history.slice(-40);
    await chrome.storage.local.set({ chatHistory });
  } catch (err) {
    console.error('[EasyWeb Chat History Save Error]:', err);
  }
}

async function clearChat() {
  history = [];
  renderHistory();
  if (historyKey) {
    try {
      const store = await chrome.storage.local.get({ chatHistory: {} });
      const chatHistory = store.chatHistory || {};
      delete chatHistory[historyKey];
      await chrome.storage.local.set({ chatHistory });
      setStatus('✓ تاریخچه گفتگو پاک شد');
    } catch (err) {
      console.error('[EasyWeb Clear Chat Error]:', err);
    }
  }
}

function renderActiveProviderLine() {
  const provider = providers.find((p) => p.id === activeProviderId) || providers[0];
  const line = $('active-provider');
  if (provider) {
    const model = provider.selectedModel || provider.defaultModel || 'پیش‌فرض';
    line.innerHTML = `مدل فعال: <b>${escapeHtml(provider.label)}</b> · <span style="color:#27c8ba">${escapeHtml(model)}</span>`;
  } else {
    line.textContent = 'حالت تست · ارائه‌دهنده را انتخاب کنید';
  }
}

async function persistProviders() {
  await chrome.storage.local.set({ providers, activeProviderId, translationAi });
  renderActiveProviderLine();
  renderTranslationTab();
}

/* Render saved providers in settings modal */
function renderProvidersList() {
  const list = $('saved-providers-list');
  list.replaceChildren();

  if (!providers.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'هیچ سرویس‌دهنده‌ای ذخیره نشده است. با فرم بالا اولین کلید را اضافه کنید.';
    list.append(empty);
    return;
  }

  providers.forEach((provider) => {
    const card = document.createElement('div');
    const isActive = provider.id === activeProviderId;
    card.className = `provider-card ${isActive ? 'active' : ''}`;

    // Header
    const head = document.createElement('div');
    head.className = 'provider-header';

    const radioLabel = document.createElement('label');
    radioLabel.className = 'provider-radio-label';
    radioLabel.title = 'انتخاب به عنوان سرویس‌دهنده فعال';

    const pRadio = document.createElement('input');
    pRadio.type = 'radio';
    pRadio.name = 'active-provider-radio';
    pRadio.className = 'provider-radio';
    pRadio.checked = isActive;
    pRadio.onchange = async () => {
      activeProviderId = provider.id;
      await persistProviders();
      renderProvidersList();
      setStatus(`✓ سرویس‌دهنده ${provider.label} فعال شد`);
    };

    const titleSpan = document.createElement('span');
    titleSpan.className = 'provider-name';
    titleSpan.innerHTML = `<span>${escapeHtml(provider.label)}</span> <span style="font-size:9px;color:#8f93b3">(${escapeHtml(provider.type)})</span>`;

    radioLabel.append(pRadio, titleSpan);

    const actions = document.createElement('div');
    actions.className = 'provider-actions';

    const useBtn = document.createElement('button');
    useBtn.className = `btn-use ${isActive ? 'active' : ''}`;
    useBtn.textContent = isActive ? '✓ فعال (پیش‌فرض)' : 'انتخاب پیش‌فرض';
    useBtn.onclick = async (e) => {
      e.stopPropagation();
      activeProviderId = provider.id;
      await persistProviders();
      renderProvidersList();
      setStatus(`✓ سرویس‌دهنده ${provider.label} به عنوان فعال انتخاب شد`);
    };

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-del';
    delBtn.textContent = '✕ حذف';
    delBtn.onclick = async (e) => {
      e.stopPropagation();
      providers = providers.filter((p) => p.id !== provider.id);
      if (activeProviderId === provider.id) activeProviderId = providers[0]?.id || '';
      await persistProviders();
      renderProvidersList();
      setStatus('✓ سرویس‌دهنده حذف شد');
    };

    actions.append(useBtn, delBtn);
    head.append(radioLabel, actions);
    card.append(head);

    // Model browser
    const filterBar = document.createElement('div');
    filterBar.className = 'model-filter-bar';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = '🔍 جستجوی مدل...';

    const freeFilterLabel = document.createElement('label');
    freeFilterLabel.className = 'free-filter-label';
    const freeCheck = document.createElement('input');
    freeCheck.type = 'checkbox';
    freeFilterLabel.append(freeCheck, document.createTextNode(' فقط رایگان (Free)'));

    filterBar.append(searchInput, freeFilterLabel);
    card.append(filterBar);

    // Models container
    const modelsBox = document.createElement('div');
    modelsBox.className = 'models-sublist';

    function renderModelsSublist() {
      modelsBox.replaceChildren();
      const query = searchInput.value.toLowerCase().trim();
      const onlyFree = freeCheck.checked;
      const allModels = provider.models || [];

      const filtered = allModels.filter((m) => {
        if (onlyFree && !m.isFree) return false;
        if (query && !m.name?.toLowerCase().includes(query) && !m.id?.toLowerCase().includes(query)) return false;
        return true;
      });

      if (!filtered.length) {
        const noM = document.createElement('span');
        noM.style.fontSize = '9px';
        noM.style.color = '#8f93b3';
        noM.textContent = 'مدلی یافت نشد.';
        modelsBox.append(noM);
        return;
      }

      filtered.forEach((m) => {
        const item = document.createElement('div');
        const isSelected = (provider.selectedModel || provider.defaultModel) === m.id;
        item.className = `model-item ${isSelected ? 'selected' : ''}`;
        item.title = `کلیک برای انتخاب مدل ${m.name || m.id}`;

        const leftDiv = document.createElement('div');
        leftDiv.style.display = 'flex';
        leftDiv.style.alignItems = 'center';
        leftDiv.style.gap = '6px';
        leftDiv.style.flex = '1';
        leftDiv.style.overflow = 'hidden';

        const mRadio = document.createElement('input');
        mRadio.type = 'radio';
        mRadio.name = `model-radio-${provider.id}`;
        mRadio.className = 'model-radio';
        mRadio.checked = isSelected;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'model-name';
        nameSpan.textContent = m.name || m.id;

        leftDiv.append(mRadio, nameSpan);

        const rightSpan = document.createElement('span');
        rightSpan.style.display = 'flex';
        rightSpan.style.gap = '4px';
        rightSpan.style.alignItems = 'center';

        if (m.isFree) {
          const freeBadge = document.createElement('span');
          freeBadge.className = 'badge-free';
          freeBadge.textContent = 'FREE';
          rightSpan.append(freeBadge);
        }

        if (isSelected && isActive) {
          const activeBadge = document.createElement('span');
          activeBadge.className = 'badge-active-model';
          activeBadge.textContent = '✓ فعال';
          rightSpan.append(activeBadge);
        }

        item.append(leftDiv, rightSpan);

        const selectModel = async (e) => {
          if (e) e.stopPropagation();
          provider.selectedModel = m.id;
          activeProviderId = provider.id;
          await persistProviders();
          renderProvidersList();
          setStatus(`✓ مدل ${m.name || m.id} انتخاب و فعال شد`);
        };

        item.onclick = selectModel;
        mRadio.onchange = selectModel;
        modelsBox.append(item);
      });
    }

    searchInput.oninput = renderModelsSublist;
    freeCheck.onchange = renderModelsSublist;
    renderModelsSublist();

    card.append(modelsBox);
    list.append(card);
  });
}

function renderTranslationTab() {
  const pSelect = $('ai-trans-provider');
  const mSelect = $('ai-trans-model');
  if (!pSelect || !mSelect) return;

  pSelect.innerHTML = '';
  providers.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.label} (${p.type})`;
    pSelect.append(opt);
  });

  pSelect.value = translationAi.providerId || activeProviderId || (providers[0]?.id || '');

  function updateModels() {
    mSelect.innerHTML = '';
    const currentP = providers.find((p) => p.id === pSelect.value);
    const models = currentP?.models || [];
    models.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `${m.name || m.id}${m.isFree ? ' · [FREE]' : ''}`;
      mSelect.append(opt);
    });
    mSelect.value = translationAi.model || currentP?.selectedModel || (models[0]?.id || '');
  }

  pSelect.onchange = updateModels;
  updateModels();

  if ($('ai-trans-tone')) {
    $('ai-trans-tone').value = translationAi.tone || 'standard';
  }
  if ($('ai-trans-prompt')) {
    $('ai-trans-prompt').value = translationAi.customPrompt || '';
  }
}

function renderTools() {
  const list = $('custom-tools-list');
  if (!list) return;
  list.replaceChildren();
  tools.forEach((tool, index) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';
    row.style.background = 'var(--surface-2)';
    row.style.padding = '6px 10px';
    row.style.borderRadius = '6px';
    row.style.marginBottom = '4px';

    const info = document.createElement('div');
    info.innerHTML = `<strong>${escapeHtml(tool.name)}</strong><p style="margin:2px 0 0;font-size:9px;color:var(--muted)">${escapeHtml(tool.prompt)}</p>`;

    const del = document.createElement('button');
    del.className = 'btn-del';
    del.textContent = '✕';
    del.onclick = async () => {
      tools.splice(index, 1);
      await chrome.storage.local.set({ customTools: tools });
      renderTools();
    };

    row.append(info, del);
    list.append(row);
  });
}

/* ---------------- Ad blocker settings ---------------- */

function parseLines(text = '') {
  return [...new Set(
    String(text || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  )];
}

async function loadAdblock() {
  const [status, diag] = await Promise.all([
    send({ type: 'ADBLOCK_STATUS' }),
    send({ type: 'ADBLOCK_DIAGNOSTICS' })
  ]);
  if (status?.ok) {
    adblockConfig = status.global;
    adblockStats = status.stats;
  }
  if (diag?.ok) adblockDiag = diag;
  return status;
}

async function patchAdblock(patch, message) {
  const res = await send({ type: 'ADBLOCK_UPDATE_GLOBAL', patch });
  if (res?.ok) {
    adblockConfig = res.config;
    if (message) setStatus(message);
  } else {
    setStatus('خطا در ذخیره تنظیمات ادبلاکر', true);
  }
  renderAdblockTab();
}

function renderGlobalToggles() {
  const grid = $('ab-global-toggles');
  if (!grid || !adblockConfig) return;
  grid.replaceChildren();

  TOGGLE_KEYS.forEach((key) => {
    const meta = TOGGLE_META[key];
    const card = document.createElement('div');
    card.className = 'ab-toggle-card';

    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(adblockConfig.toggles?.[key]);
    input.onchange = () => {
      const toggles = { ...(adblockConfig.toggles || {}), [key]: input.checked };
      patchAdblock({ mode: 'custom', toggles }, '✓ تنظیمات ادبلاکر ذخیره شد');
    };

    const span = document.createElement('span');
    span.textContent = meta.name;
    label.append(input, span);

    const small = document.createElement('small');
    small.textContent = meta.hint;

    card.append(label, small);
    grid.append(card);
  });
}

function renderDomainList(containerId, list, listName) {
  const container = $(containerId);
  if (!container) return;
  container.replaceChildren();

  const entries = (list || []).slice().sort();
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'ab-empty';
    empty.textContent = listName === 'whitelist'
      ? 'هنوز سایتی به لیست سفید اضافه نشده است.'
      : 'هنوز دامنه‌ای به لیست سیاه اضافه نشده است.';
    container.append(empty);
    return;
  }

  entries.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'ab-domain-row';

    const name = document.createElement('span');
    name.className = 'ab-domain-name';
    name.textContent = entry;

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.alignItems = 'center';
    right.style.gap = '8px';

    const hits = adblockStats?.perDomain?.[entry];
    if (hits) {
      const count = document.createElement('span');
      count.className = 'ab-domain-count';
      count.textContent = `${formatCount(hits)} مورد`;
      right.append(count);
    }

    const del = document.createElement('button');
    del.className = 'btn-del';
    del.textContent = '✕';
    del.title = 'حذف از لیست';
    del.onclick = async () => {
      const res = await send({ type: 'ADBLOCK_SET_LIST', list: listName, domain: entry, present: false });
      if (res?.ok) {
        adblockConfig = res.config;
        renderAdblockTab();
        setStatus('✓ از لیست حذف شد');
      }
    };

    right.append(del);
    row.append(name, right);
    container.append(row);
  });
}

function renderAdblockStats() {
  const box = $('ab-stats');
  if (!box) return;
  const s = adblockStats || {};

  const cells = [
    ['تبلیغات و درخواست‌های شبکه‌ای', formatCount(s.total || 0), false],
    ['پاپ‌آپ و تب بسته‌شده', formatCount(s.popups || 0), false],
    ['عنصر تبلیغاتی پنهان‌شده', formatCount(s.cosmetic || 0), false],
    ['دامنه‌های دارای فعالیت', String(Object.keys(s.perDomain || {}).length), false]
  ];

  box.replaceChildren();
  cells.forEach(([label, value, wide]) => {
    const cell = document.createElement('div');
    cell.className = wide ? 'ab-stat wide' : 'ab-stat';
    const span = document.createElement('span');
    span.textContent = label;
    const strong = document.createElement('b');
    strong.textContent = value;
    cell.append(span, strong);
    box.append(cell);
  });

  if (adblockDiag) {
    const diag = document.createElement('div');
    diag.className = 'ab-stat wide ab-diag';
    const since = s.since ? new Date(s.since).toLocaleString('fa-IR') : '—';
    diag.textContent = `session-rules: ${adblockDiag.sessionRuleCount ?? '—'} · tracked-gestures: ${adblockDiag.guard?.trackedGestures ?? 0} · pending-targets: ${adblockDiag.guard?.pendingSuspects ?? 0} · since: ${since}`;
    box.append(diag);
  }
}

function renderAdblockTab() {
  if (!adblockConfig) return;

  const enabled = $('ab-global-enabled');
  if (enabled) enabled.checked = Boolean(adblockConfig.enabled);

  const mode = $('ab-global-mode');
  if (mode) mode.value = adblockConfig.mode || 'default';

  const badge = $('ab-show-badge');
  if (badge) badge.checked = adblockConfig.showBadge !== false;

  const guard = adblockConfig.popupGuard || {};
  if ($('ab-guard-enabled')) $('ab-guard-enabled').checked = guard.enabled !== false;
  if ($('ab-guard-nogesture')) $('ab-guard-nogesture').checked = guard.blockWithoutGesture !== false;
  if ($('ab-guard-thirdparty')) $('ab-guard-thirdparty').checked = guard.blockThirdPartyPopup !== false;
  if ($('ab-guard-media')) $('ab-guard-media').checked = guard.blockFromMedia !== false;
  if ($('ab-guard-allowed') && document.activeElement !== $('ab-guard-allowed')) {
    $('ab-guard-allowed').value = (guard.allowedHosts || []).join('\n');
  }

  const cosmetic = adblockConfig.cosmetic || {};
  if ($('ab-cos-frames')) $('ab-cos-frames').checked = cosmetic.hideAdFrames !== false;
  if ($('ab-cos-collapse')) $('ab-cos-collapse').checked = cosmetic.collapseEmptySlots !== false;
  if ($('ab-cos-antiadblock')) $('ab-cos-antiadblock').checked = cosmetic.neutralizeAntiAdblock !== false;

  if ($('ab-scriptlets')) $('ab-scriptlets').checked = adblockConfig.scriptlets !== false;

  if ($('ab-selectors') && document.activeElement !== $('ab-selectors')) {
    $('ab-selectors').value = (adblockConfig.customSelectors || []).join('\n');
  }
  if ($('ab-custom-rules') && document.activeElement !== $('ab-custom-rules')) {
    $('ab-custom-rules').value = (adblockConfig.customRules || []).join('\n');
  }

  renderGlobalToggles();
  renderDomainList('ab-whitelist-list', adblockConfig.whitelist, 'whitelist');
  renderDomainList('ab-blacklist-list', adblockConfig.blacklist, 'blacklist');
  renderAdblockStats();
}

async function addDomainToList(listName, input) {
  const value = input?.value?.trim();
  if (!value) return setStatus('دامنه را وارد کنید', true);
  const res = await send({ type: 'ADBLOCK_SET_LIST', list: listName, domain: value, present: true });
  if (res?.ok) {
    adblockConfig = res.config;
    input.value = '';
    renderAdblockTab();
    setStatus(listName === 'whitelist' ? '✓ به لیست سفید اضافه شد' : '✓ به لیست سیاه اضافه شد');
  } else {
    setStatus('دامنه نامعتبر است', true);
  }
}

function bindAdblockTab() {
  if (!$('ab-global-enabled')) return;

  $('ab-global-enabled').onchange = () => {
    patchAdblock({ enabled: $('ab-global-enabled').checked }, '✓ ذخیره شد');
  };

  $('ab-global-mode').onchange = () => {
    const mode = $('ab-global-mode').value;
    const patch = { mode };
    if (mode !== 'custom') patch.toggles = { ...(MODE_PRESETS[mode] || MODE_PRESETS.default) };
    patchAdblock(patch, '✓ حالت مسدودسازی ذخیره شد');
  };

  $('ab-show-badge').onchange = () => {
    patchAdblock({ showBadge: $('ab-show-badge').checked });
  };

  $('ab-scriptlets').onchange = () => {
    patchAdblock({ scriptlets: $('ab-scriptlets').checked }, '✓ ذخیره شد');
  };

  $('ab-save-guard').onclick = () => {
    patchAdblock({
      popupGuard: {
        ...(adblockConfig.popupGuard || {}),
        enabled: $('ab-guard-enabled').checked,
        blockWithoutGesture: $('ab-guard-nogesture').checked,
        blockThirdPartyPopup: $('ab-guard-thirdparty').checked,
        blockFromMedia: $('ab-guard-media').checked,
        allowedHosts: parseLines($('ab-guard-allowed').value)
      }
    }, '✓ تنظیمات محافظ پاپ‌آپ ذخیره شد');
  };

  $('ab-save-cosmetic').onclick = () => {
    patchAdblock({
      cosmetic: {
        ...(adblockConfig.cosmetic || {}),
        hideAdFrames: $('ab-cos-frames').checked,
        collapseEmptySlots: $('ab-cos-collapse').checked,
        neutralizeAntiAdblock: $('ab-cos-antiadblock').checked
      },
      customSelectors: parseLines($('ab-selectors').value)
    }, '✓ تنظیمات پاک‌سازی بصری ذخیره شد');
  };

  $('ab-save-rules').onclick = () => {
    patchAdblock({ customRules: parseLines($('ab-custom-rules').value) }, '✓ فیلترهای سفارشی ذخیره شد');
  };

  $('ab-whitelist-add').onclick = () => addDomainToList('whitelist', $('ab-whitelist-input'));
  $('ab-blacklist-add').onclick = () => addDomainToList('blacklist', $('ab-blacklist-input'));
  $('ab-whitelist-input').onkeydown = (e) => { if (e.key === 'Enter') $('ab-whitelist-add').click(); };
  $('ab-blacklist-input').onkeydown = (e) => { if (e.key === 'Enter') $('ab-blacklist-add').click(); };

  $('ab-refresh-stats').onclick = async () => {
    await loadAdblock();
    renderAdblockTab();
    setStatus('✓ آمار بروزرسانی شد');
  };

  $('ab-reset-stats').onclick = async () => {
    const res = await send({ type: 'ADBLOCK_RESET_STATS' });
    if (res?.ok) {
      adblockStats = res.stats;
      renderAdblockTab();
      setStatus('✓ آمار صفر شد');
    }
  };
}

/* Chat Prompt Submission */
async function submit(prompt) {
  const clean = prompt?.trim();
  if (!clean) return;
  if (!pageText) await refreshContext();

  history.push({ role: 'user', text: clean });
  renderHistory();
  $('prompt').value = '';

  // Live "thinking / typing" bubble while the model responds
  const chat = $('chat');
  const pending = document.createElement('div');
  pending.className = 'message assistant';
  const pendingBody = document.createElement('div');
  pendingBody.className = 'typing';
  pendingBody.innerHTML =
    '<span class="typing-dots"><i></i><i></i><i></i></span>' +
    '<span class="typing-text">در حال فکر کردن...</span>';
  pending.append(pendingBody);
  chat.append(pending);
  chat.scrollTop = chat.scrollHeight;

  // cycle the status label so it feels alive
  const steps = ['در حال فکر کردن...', 'در حال خواندن صفحه...', 'در حال نوشتن پاسخ...'];
  let step = 0;
  const statusTimer = setInterval(() => {
    const t = pendingBody.querySelector('.typing-text');
    if (t) t.textContent = steps[step % steps.length];
    step++;
  }, 2200);

  const provider = providers.find((p) => p.id === activeProviderId) || providers[0];
  const result = await send({
    type: 'AI_REQUEST',
    providerId: provider?.id,
    model: provider?.selectedModel,
    prompt: clean,
    pageText
  });

  clearInterval(statusTimer);
  pending.remove();

  history.push({
    role: 'assistant',
    text: result?.text || result?.error || 'خطا در ارتباط با مدل هوش مصنوعی.'
  });
  renderHistory();
  await saveHistory();
  if (!result?.ok) setStatus(result?.error || 'خطا', true);
  else setStatus('✓ پاسخ دریافت شد');
}

async function refreshContext() {
  $('context-status').textContent = 'در حال خواندن محتوای صفحه...';
  const context = await send({ type: 'GET_ACTIVE_CONTEXT' });
  if (context?.ok) {
    activeTab = context.tab;
    domain = context.domain || '';
    $('page-name').textContent = domain || 'صفحه فعال';
    historyKey = domain ? `domain:${domain}` : (activeTab ? `tab:${activeTab.id}` : '');

    const page = await send({ type: 'PAGE_ACTION' });
    pageText = page?.text || '';

    const store = await chrome.storage.local.get({
      providers: [],
      activeProviderId: '',
      translationAi: {},
      customTools: [],
      chatHistory: {}
    });

    providers = store.providers || [];
    activeProviderId = store.activeProviderId || (providers[0]?.id || '');
    translationAi = store.translationAi || {};
    tools = store.customTools || [];
    history = (historyKey && store.chatHistory) ? (store.chatHistory[historyKey] || []) : [];

    $('context-status').textContent = `${pageText.length.toLocaleString('fa-IR')} کاراکتر از صفحه بارگذاری شد`;
    renderActiveProviderLine();
    renderHistory();
    await loadAdblock();
    renderAdblockTab();
  } else {
    $('context-status').textContent = 'یک تب وب استاندارد را باز کنید';
  }
}

let openSettingsModal = null;

function bindModal() {
  const modal = $('settings-modal');

  function activateTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabId));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.toggle('active', c.id === `tab-${tabId}`));
  }

  openSettingsModal = async (tabId) => {
    modal.classList.remove('hidden');
    renderProvidersList();
    renderTranslationTab();
    renderTools();
    await loadAdblock();
    renderAdblockTab();
    if (tabId) activateTab(tabId);
  };

  $('open-settings').onclick = () => openSettingsModal();
  $('open-settings-inline').onclick = () => openSettingsModal();
  $('close-settings').onclick = () => modal.classList.add('hidden');

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.onclick = () => activateTab(btn.dataset.tab);
  });

  // Provider Type change -> toggle base URL input
  $('provider-type').onchange = () => {
    const isCustom = $('provider-type').value === 'custom';
    $('base-url-container').classList.toggle('hidden', !isCustom);
  };

  // Test & Save Provider
  $('test-save-provider').onclick = async () => {
    const type = $('provider-type').value;
    const label = $('provider-label').value.trim() || AI_PROVIDERS_CONFIG[type]?.name || type;
    const secret = $('provider-secret').value.trim();
    const baseUrl = $('provider-base-url')?.value.trim() || '';

    if (!secret && type !== 'custom') {
      return setStatus('لطفاً کلید API را وارد کنید.', true);
    }

    setStatus('در حال تست اتصال و دریافت مدل‌ها...');
    const result = await send({ type: 'FETCH_MODELS', providerType: type, apiKey: secret, baseUrl });

    const models = result?.ok && result.models?.length ? result.models : AI_PROVIDERS_CONFIG[type]?.defaultModels || [];
    const newProvider = {
      id: crypto.randomUUID(),
      type,
      label,
      secret,
      baseUrl,
      models,
      selectedModel: models[0]?.id || '',
      createdAt: Date.now()
    };

    providers.push(newProvider);
    if (!activeProviderId) activeProviderId = newProvider.id;

    await persistProviders();
    $('provider-secret').value = '';
    $('provider-label').value = '';
    renderProvidersList();
    setStatus(`✓ اتصال به ${label} برقرار شد و ${models.length} مدل لود شدند.`);
  };

  // Save Translation Config
  $('save-trans-config').onclick = async () => {
    translationAi = {
      providerId: $('ai-trans-provider').value,
      model: $('ai-trans-model').value,
      tone: $('ai-trans-tone')?.value || 'standard',
      customPrompt: $('ai-trans-prompt')?.value || ''
    };
    await persistProviders();
    setStatus('✓ تنظیمات ترجمه هوش مصنوعی ذخیره شد.');
  };

  // Add Tool
  $('add-tool-btn').onclick = async () => {
    const name = window.prompt('نام ابزار:');
    if (!name?.trim()) return;
    const prompt = window.prompt('پرامپتی که می‌خواهید با کانتکست صفحه اجرا شود:');
    if (!prompt?.trim()) return;
    tools.push({ id: crypto.randomUUID(), name: name.trim(), prompt: prompt.trim() });
    await chrome.storage.local.set({ customTools: tools });
    renderTools();
  };

  // Export Backup
  $('export-backup-btn').onclick = async () => {
    try {
      const data = await chrome.storage.local.get(null);
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `easyweb-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('✓ فایل پشتیبان دانلود شد');
    } catch (err) {
      console.error('[EasyWeb Export Error]:', err);
      setStatus('خطا در خروجی: ' + (err.message || ''), true);
    }
  };

  // Import Backup
  $('import-backup-file').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (typeof data !== 'object' || data === null) {
        throw new Error('فرمت فایل پشتیبان نامعتبر است.');
      }
      await chrome.storage.local.set(data);
      setStatus('✓ تمامی اطلاعات و تنظیمات با موفقیت بازیابی شدند.');
      await refreshContext();
      renderProvidersList();
      renderTranslationTab();
      renderTools();
    } catch (err) {
      console.error('[EasyWeb Import Error]:', err);
      setStatus('خطا در بازیابی فایل: ' + (err.message || ''), true);
    }
    e.target.value = '';
  };

  // Clear All Stored Data
  const clearBtn = $('clear-all-data-btn');
  if (clearBtn) {
    clearBtn.onclick = async () => {
      const ok = confirm('هشدار: آیا مطمئن هستید؟ تمامی داده‌های ذخیره‌شده توسط مرورگر (تنظیمات سایت‌ها، فونت‌های آپلودشده، اتصالات هوش مصنوعی، تاریخچه گفتگوها و آمار) به طور کامل پاک خواهند شد.');
      if (!ok) return;
      try {
        await chrome.storage.local.clear();
        await chrome.storage.local.set(DEFAULTS);
        setStatus('✓ تمام داده‌های مرورگر پاک شدند و افزونه به حالت پیش‌فرض بازگشت.');
        await refreshContext();
        renderProvidersList();
        renderTranslationTab();
        renderTools();
        await renderAdblockTab();
      } catch (err) {
        console.error('[EasyWeb Clear Error]:', err);
        setStatus('خطا در پاک‌سازی داده‌ها: ' + (err.message || ''), true);
      }
    };
  }
}

function bind() {
  bindModal();
  bindAdblockTab();

  $('composer').onsubmit = (e) => {
    e.preventDefault();
    submit($('prompt').value);
  };

  document.querySelectorAll('[data-action]').forEach((btn) => {
    btn.onclick = () => {
      const prompts = {
        summarize: 'این صفحه را به صورت خلاصه، شفاف و با ساختار بولت‌پوینت‌های کاربردی به فارسی توضیح بده.',
        translate: 'محتوای اصلی و متن‌های مهم این صفحه را با ترجمه‌ای روان، دقیق و خوانا به فارسی بازنویسی کن.',
        extract: 'نکات کلیدی، داده‌ها، اسامی، تاریخ‌ها و حقایق مهم این صفحه را استخراج کن.'
      };
      submit(prompts[btn.dataset.action]);
    };
  });

  $('refresh-context').onclick = refreshContext;
  $('clear-chat-btn').onclick = clearChat;
}

bind();
refreshContext();

/**
 * The popup's "advanced settings" link deep-links straight to the blocker tab.
 * Handled both on load (panel was closed) and through a storage change (panel
 * was already open, so the script would not run again).
 */
async function openRequestedTab(tabId) {
  if (!tabId || !openSettingsModal) return;
  try {
    await chrome.storage.local.remove('sidebarTab');
  } catch (_) {}
  await openSettingsModal(tabId);
}

(async () => {
  try {
    const store = await chrome.storage.local.get({ sidebarTab: '' });
    await openRequestedTab(store.sidebarTab);
  } catch (_) {}
})();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.sidebarTab?.newValue) openRequestedTab(changes.sidebarTab.newValue);
});
