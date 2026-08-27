/**
 * Sidebar AI Assistant & Settings Modal Controller
 */
import { AI_PROVIDERS_CONFIG } from '../shared/ai-providers.js';

let activeTab = null;
let domain = '';
let pageText = '';
let providers = [];
let activeProviderId = '';
let translationAi = { providerId: '', model: '' };
let tools = [];
let historyKey = '';
let history = [];

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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
    node.append(label, document.createTextNode(item.text));
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

/* Chat Prompt Submission */
async function submit(prompt) {
  const clean = prompt?.trim();
  if (!clean) return;
  if (!pageText) await refreshContext();

  history.push({ role: 'user', text: clean });
  renderHistory();
  $('prompt').value = '';
  setStatus('در حال پردازش با هوش مصنوعی...');

  const provider = providers.find((p) => p.id === activeProviderId) || providers[0];
  const result = await send({
    type: 'AI_REQUEST',
    providerId: provider?.id,
    model: provider?.selectedModel,
    prompt: clean,
    pageText
  });

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
  } else {
    $('context-status').textContent = 'یک تب وب استاندارد را باز کنید';
  }
}

function bindModal() {
  const modal = $('settings-modal');
  $('open-settings').onclick = () => {
    modal.classList.remove('hidden');
    renderProvidersList();
    renderTranslationTab();
    renderTools();
  };
  $('open-settings-inline').onclick = () => {
    modal.classList.remove('hidden');
    renderProvidersList();
    renderTranslationTab();
    renderTools();
  };
  $('close-settings').onclick = () => modal.classList.add('hidden');

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      const tabId = `tab-${btn.dataset.tab}`;
      $(tabId)?.classList.add('active');
    };
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
}

function bind() {
  bindModal();

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
