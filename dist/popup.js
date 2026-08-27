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

// --- Module: shared/models.js ---
/**
 * Site Model, State Synchronization and Migration Helpers
 */
function mergeSite(value = {}) {
  return {
    enabled: Boolean(value?.enabled),
    direction: { ...DEFAULT_SITE.direction, ...(value?.direction || {}) },
    font: { ...DEFAULT_SITE.font, ...(value?.font || {}) },
    translate: { ...DEFAULT_SITE.translate, ...(value?.translate || {}) },
    targets: Array.isArray(value?.targets) ? value.targets.map((t) => ({
      id: t.id || `t${Math.random().toString(36).slice(2, 8)}`,
      selector: t.selector || '',
      label: t.label || t.selector || 'Element',
      direction: t.direction ? { ...DEFAULT_SITE.direction, ...t.direction } : null,
      font: t.font ? { ...DEFAULT_SITE.font, ...t.font } : null,
      translate: t.translate ? { ...DEFAULT_SITE.translate, ...t.translate } : null
    })) : []
  };
}
function migrateSite(value) {
  const merged = mergeSite(value);

  if (value?.direction?.scope === 'element' && value.direction.selector && !merged.targets.some((t) => t.selector === value.direction.selector)) {
    merged.targets.push({
      id: `t${Math.random().toString(36).slice(2, 8)}`,
      selector: value.direction.selector,
      label: value.direction.label || value.direction.selector,
      direction: { ...DEFAULT_SITE.direction, ...value.direction },
      font: null,
      translate: null
    });
  }

  if (value?.font?.scope === 'element' && value.font.selector) {
    const existing = merged.targets.find((t) => t.selector === value.font.selector);
    if (existing) {
      existing.font = { ...DEFAULT_SITE.font, ...value.font };
    } else {
      merged.targets.push({
        id: `t${Math.random().toString(36).slice(2, 8)}`,
        selector: value.font.selector,
        label: value.font.label || value.font.selector,
        direction: null,
        font: { ...DEFAULT_SITE.font, ...value.font },
        translate: null
      });
    }
  }

  if (value?.translate?.scope === 'element' && value.translate.selector) {
    const existing = merged.targets.find((t) => t.selector === value.translate.selector);
    if (existing) {
      existing.translate = { ...DEFAULT_SITE.translate, ...value.translate };
    } else {
      merged.targets.push({
        id: `t${Math.random().toString(36).slice(2, 8)}`,
        selector: value.translate.selector,
        label: value.translate.label || value.translate.selector,
        direction: null,
        font: null,
        translate: { ...DEFAULT_SITE.translate, ...value.translate }
      });
    }
  }

  merged.direction.scope = value?.direction?.scope || (merged.targets.some((t) => t.direction?.enabled) ? 'element' : 'page');
  merged.font.scope = value?.font?.scope || (merged.targets.some((t) => t.font?.enabled) ? 'element' : 'page');
  merged.translate.scope = value?.translate?.scope || (merged.targets.some((t) => t.translate?.enabled) ? 'element' : 'page');

  if (value && value.enabled === undefined) {
    const dirActive = merged.direction.scope === 'page' ? merged.direction.enabled : merged.targets.some((t) => t.direction?.enabled);
    const fontActive = merged.font.scope === 'page' ? merged.font.enabled : merged.targets.some((t) => t.font?.enabled);
    const transActive = merged.translate.scope === 'page' ? merged.translate.enabled : merged.targets.some((t) => t.translate?.enabled);
    merged.enabled = dirActive || fontActive || transActive;
  }
  return merged;
}
function syncSiteEnabled(site) {
  const dirScope = site.direction.scope || 'page';
  const fontScope = site.font.scope || 'page';
  const transScope = site.translate?.scope || 'page';

  const dirActive = dirScope === 'page' ? site.direction.enabled : site.targets.some((t) => t.direction?.enabled);
  const fontActive = fontScope === 'page' ? site.font.enabled : site.targets.some((t) => t.font?.enabled);
  const transActive = transScope === 'page' ? site.translate?.enabled : site.targets.some((t) => t.translate?.enabled);

  site.enabled = dirActive || fontActive || transActive;
  return site.enabled;
}

// --- Module: popup/state.js ---
/**
 * Reactive Popup State Management
 */
const state = {
  domain: '',
  tabId: null,
  site: structuredClone(DEFAULT_SITE),
  fonts: [],
  activeTargetId: null,
  openPanels: []
};
const $ = (id) => document.getElementById(id);
function setStatus(message, error = false) {
  const node = $('status');
  if (!node) return;
  node.textContent = message;
  node.style.color = error ? '#ff8d9c' : '';
}
function activeTarget(feature) {
  return state.site.targets.find((t) => t.id === state.activeTargetId) || null;
}
async function getStorage() {
  return chrome.storage.local.get(DEFAULTS);
}
async function ensureContentScript() {
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
async function pushSettings() {
  if (!state.tabId) return false;
  const ready = await ensureContentScript();
  if (!ready) return false;
  await chrome.tabs.sendMessage(state.tabId, { type: 'APPLY_SETTINGS', settings: state.site }).catch(() => {});
  return true;
}
async function saveSite() {
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
async function highlightOnPage(selector) {
  if (!state.tabId || !selector) return;
  await chrome.tabs.sendMessage(state.tabId, { type: 'HIGHLIGHT', selector }).catch(() => {});
}
async function clearHighlightOnPage() {
  if (!state.tabId) return;
  await chrome.tabs.sendMessage(state.tabId, { type: 'CLEAR_HIGHLIGHT' }).catch(() => {});
}

// --- Module: popup/components/scope-tabs.js ---
/**
 * Scope Tabs Component (Entire Page vs Selected Sections)
 */
function bindScopeTabs(renderCallback) {
  document.querySelectorAll('.scope-tab').forEach((btn) => {
    btn.onclick = async () => {
      const feature = btn.dataset.feature;
      const scope = btn.dataset.scope;
      if (!state.site[feature]) state.site[feature] = {};
      state.site[feature].scope = scope;

      if (scope === 'element') {
        const first = state.site.targets.find((t) => t[feature]?.enabled || t[feature]);
        if (first) state.activeTargetId = first.id;
        $(`${feature}-advanced`)?.classList.add('open');
      } else {
        state.activeTargetId = null;
      }

      renderCallback();
      await saveSite();
    };
  });
}
function renderScopeTabs() {
  const dirScope = state.site.direction.scope || 'page';
  const fontScope = state.site.font.scope || 'page';
  const transScope = state.site.translate?.scope || 'page';

  document.querySelectorAll('.scope-tab[data-feature="direction"]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.scope === dirScope);
  });
  document.querySelectorAll('.scope-tab[data-feature="font"]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.scope === fontScope);
  });
  document.querySelectorAll('.scope-tab[data-feature="translate"]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.scope === transScope);
  });
}

// --- Module: popup/components/targets-list.js ---
/**
 * Interactive Targets List Component
 */
function renderTargets(feature, renderCallback) {
  const listId = feature === 'direction' ? 'direction-targets' : feature === 'translate' ? 'translate-targets' : 'font-targets';
  const list = $(listId);
  if (!list) return;
  list.replaceChildren();

  const targets = state.site.targets.filter((t) => {
    if (feature === 'direction') return t.direction?.enabled;
    if (feature === 'translate') return t.translate?.enabled;
    return t.font?.enabled;
  });
  if (!targets.length) return;

  targets.forEach((target) => {
    const row = document.createElement('div');
    const isActive = state.activeTargetId === target.id;
    row.className = 'target-row' + (isActive ? ' active' : '');

    const info = document.createElement('div');
    info.className = 'target-info';
    info.style.display = 'flex';
    info.style.flexDirection = 'column';
    info.style.cursor = 'pointer';
    info.style.overflow = 'hidden';
    info.style.flex = '1';

    const label = document.createElement('span');
    label.className = 'target-label';
    label.textContent = target.label || target.selector;
    label.title = target.selector;

    const sub = document.createElement('span');
    sub.className = 'target-sub';
    sub.style.fontSize = '8px';
    sub.style.color = isActive ? '#27c8ba' : '#8f93b3';

    if (feature === 'font' && target.font) {
      const rawFont = target.font.family || 'Default';
      const fontName = rawFont.replace(/['"]/g, '').split(',')[0].trim();
      sub.textContent = `${fontName} · ${target.font.size || 16}${target.font.unit || 'px'} · w${target.font.weight || 400}`;
    } else if (feature === 'direction' && target.direction) {
      sub.textContent = target.direction.value === 'rtl' ? 'RTL · راست‌چین' : 'LTR · چپ‌چین';
    } else if (feature === 'translate' && target.translate) {
      sub.textContent = `ترجمه به ${target.translate.targetLang || 'fa'} · ${target.translate.engine || 'google'}`;
    }

    info.append(label, sub);
    info.onclick = () => {
      state.activeTargetId = state.activeTargetId === target.id ? null : target.id;
      renderCallback();
    };
    row.append(info);

    const actions = document.createElement('span');
    actions.className = 'target-actions';

    const show = document.createElement('button');
    show.className = 'target-show';
    show.textContent = '⌖';
    show.title = 'Show on page';
    show.onclick = (e) => {
      e.stopPropagation();
      highlightOnPage(target.selector);
    };

    const remove = document.createElement('button');
    remove.className = 'target-remove';
    remove.textContent = '✕';
    remove.title = 'Remove';
    remove.onclick = async (e) => {
      e.stopPropagation();
      const selector = target.selector;
      state.site.targets = state.site.targets.filter((t) => t.id !== target.id);
      if (state.activeTargetId === target.id) state.activeTargetId = null;

      if (feature === 'translate' || target.translate) {
        if (state.tabId) {
          await chrome.tabs.sendMessage(state.tabId, { type: 'RESTORE_TRANSLATION', selector }).catch(() => {});
        }
      }

      renderCallback();
      await saveSite();
      if (feature === 'translate' || target.translate) {
        setStatus('✓ بخش انتخابی حذف و متن آن به حالت اصلی بازگردانده شد');
      }
    };

    actions.append(show, remove);
    row.append(actions);
    row.addEventListener('mouseenter', () => highlightOnPage(target.selector));
    row.addEventListener('mouseleave', () => clearHighlightOnPage());
    list.append(row);
  });
}

// --- Module: popup/components/layout-card.js ---
/**
 * Layout / Direction Card Controller
 */
function bindLayoutCard(renderCallback) {
  $('direction-target').onclick = () => {
    state.activeTargetId = null;
    renderCallback();
  };

  $('direction-enabled').onchange = async () => {
    const checked = $('direction-enabled').checked;
    const scope = state.site.direction.scope || 'page';

    if (scope === 'page') {
      state.site.direction.enabled = checked;
    } else {
      if (checked) {
        if (!state.site.targets.some((t) => t.direction?.enabled)) {
          const target = activeTarget('direction') || state.site.targets[0];
          if (target) {
            target.direction = target.direction || { ...DEFAULT_SITE.direction, enabled: true, value: $('direction-value').value };
            target.direction.enabled = true;
          }
        }
      } else {
        state.site.targets.forEach((t) => {
          if (t.direction) t.direction.enabled = false;
        });
      }
    }
    renderCallback();
    await saveSite();
  };

  $('direction-value').onchange = async () => {
    const scope = state.site.direction.scope || 'page';
    const target = scope === 'element' ? activeTarget('direction') : null;
    if (target) {
      target.direction = { ...target.direction, enabled: true, value: $('direction-value').value, scope: 'element' };
    } else {
      state.site.direction.enabled = true;
      state.site.direction.value = $('direction-value').value;
    }
    renderCallback();
    await saveSite();
  };

  $('pick-direction').onclick = () => startPicker('direction');

  $('reset-direction').onclick = async () => {
    state.site.direction = structuredClone(DEFAULT_SITE.direction);
    state.site.targets = state.site.targets.map((t) => ({ ...t, direction: null }));
    renderCallback();
    await saveSite();
  };
}
function renderLayoutCard() {
  const dirScope = state.site.direction.scope || 'page';
  $('direction-enabled').checked = dirScope === 'page' ? state.site.direction.enabled : state.site.targets.some((t) => t.direction?.enabled);

  const dirTarget = dirScope === 'element' ? activeTarget('direction') : null;
  const dirCfg = dirTarget?.direction || state.site.direction;

  $('direction-value').value = dirCfg.value || 'rtl';
  if ($('direction-target')) {
    $('direction-target').innerHTML = dirTarget
      ? `<b>Segment:</b> ${dirTarget.label} <span style="font-size:8px;color:#b8b2ff">(Click for Page)</span>`
      : (dirScope === 'element' ? 'Scope: <b>Sections</b> (Click ＋ to Add)' : 'Scope: <b>Page</b>');
  }
}

async function startPicker(feature) {
  if (!state.tabId) return setStatus('Open a web page first', true);
  const ready = await ensureContentScript();
  if (!ready) return setStatus('Picker unavailable', true);
  const result = await chrome.tabs.sendMessage(state.tabId, { type: 'START_PICKER', feature }).catch(() => null);
  if (result?.ok) setStatus('Click an element on the page');
  else setStatus('Picker unavailable', true);
}

// --- Module: popup/components/type-card.js ---
/**
 * Type / Typography Card Controller
 */
function bindTypeCard(renderCallback) {
  $('font-target').onclick = () => {
    state.activeTargetId = null;
    renderCallback();
  };

  $('font-enabled').onchange = async () => {
    const checked = $('font-enabled').checked;
    const scope = state.site.font.scope || 'page';

    if (scope === 'page') {
      state.site.font.enabled = checked;
    } else {
      if (checked) {
        if (!state.site.targets.some((t) => t.font?.enabled)) {
          const target = activeTarget('font') || state.site.targets[0];
          if (target) {
            target.font = target.font || { ...DEFAULT_SITE.font, enabled: true };
            target.font.enabled = true;
          }
        }
      } else {
        state.site.targets.forEach((t) => {
          if (t.font) t.font.enabled = false;
        });
      }
    }
    renderCallback();
    await saveSite();
  };

  $('font-family').onchange = async () => {
    const scope = state.site.font.scope || 'page';
    const target = scope === 'element' ? activeTarget('font') : null;
    if (target) {
      target.font = { ...target.font, enabled: true, scope: 'element', family: $('font-family').value };
    } else {
      state.site.font.enabled = true;
      state.site.font.family = $('font-family').value;
    }
    renderCallback();
    await saveSite();
  };

  const fields = [
    ['font-size', 'size'],
    ['font-unit', 'unit'],
    ['line-height', 'lineHeight'],
    ['font-weight', 'weight'],
    ['text-align', 'align']
  ];

  fields.forEach(([id, key]) => {
    $(id).onchange = async () => {
      const scope = state.site.font.scope || 'page';
      const target = scope === 'element' ? activeTarget('font') : null;
      const rawVal = $(id).value;
      let val = rawVal;
      if (key === 'size') val = Math.max(8, Math.min(96, Number(rawVal) || 16));
      if (key === 'weight') val = Math.max(100, Math.min(1000, Number(rawVal) || 400));

      if (target) {
        target.font = { ...target.font, enabled: true, scope: 'element', [key]: val };
      } else {
        state.site.font.enabled = true;
        state.site.font[key] = val;
      }
      renderCallback();
      await saveSite();
    };
  });

  $('pick-font').onclick = () => startPicker('font');

  $('reset-font').onclick = async () => {
    state.site.font = structuredClone(DEFAULT_SITE.font);
    state.site.targets = state.site.targets.map((t) => ({ ...t, font: null }));
    renderCallback();
    await saveSite();
  };

  $('font-upload').onchange = async (event) => {
    await uploadFont(event, renderCallback);
  };
}
function renderTypeCard(renderCallback) {
  const fontScope = state.site.font.scope || 'page';
  $('font-enabled').checked = fontScope === 'page' ? state.site.font.enabled : state.site.targets.some((t) => t.font?.enabled);

  const fontTarget = fontScope === 'element' ? activeTarget('font') : null;
  const fontCfg = fontTarget?.font || state.site.font;

  if ($('font-target')) {
    $('font-target').innerHTML = fontTarget
      ? `<b>Segment:</b> ${fontTarget.label} <span style="font-size:8px;color:#b8b2ff">(Click for Page)</span>`
      : (fontScope === 'element' ? 'Scope: <b>Sections</b> (Click ＋ to Add)' : 'Scope: <b>Page</b>');
  }

  $('font-size').value = fontCfg.size || 16;
  $('font-unit').value = fontCfg.unit || 'px';
  $('line-height').value = fontCfg.lineHeight || '1.6';
  $('font-weight').value = fontCfg.weight || 400;
  $('text-align').value = fontCfg.align || 'start';

  renderFontOptions();
  renderCustomFonts(renderCallback);
}

function renderFontOptions() {
  const select = $('font-family');
  if (!select) return;
  const fontTarget = activeTarget('font');
  const current = fontTarget?.font?.family || state.site.font.family;
  select.innerHTML = '';

  const allFonts = [
    ...DEFAULT_FONTS,
    ...state.fonts.map((f) => ({ name: f.name, family: `'${f.name.replaceAll("'", "\\'")}'` }))
  ];

  allFonts.forEach((f) => {
    const opt = document.createElement('option');
    opt.value = f.family;
    opt.textContent = f.name;
    select.append(opt);
  });

  select.value = current;
  if (select.value !== current) {
    select.value = DEFAULT_FONTS[0].family;
  }
}

function renderCustomFonts(renderCallback) {
  const list = $('custom-fonts-list');
  if (!list) return;
  list.replaceChildren();

  if (!state.fonts || !state.fonts.length) return;

  state.fonts.forEach((f) => {
    const row = document.createElement('div');
    row.className = 'custom-font-item';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'custom-font-name';
    nameSpan.textContent = `🗛 ${f.name} (${f.format || 'font'})`;
    nameSpan.title = f.name;

    const delBtn = document.createElement('button');
    delBtn.className = 'custom-font-del';
    delBtn.textContent = '✕';
    delBtn.title = 'حذف فونت ذخیره شده';
    delBtn.onclick = async (e) => {
      e.stopPropagation();
      state.fonts = state.fonts.filter((item) => item.name !== f.name);
      try {
        await chrome.storage.local.set({ fonts: state.fonts });
        if (state.site.font.family.includes(f.name)) {
          state.site.font.family = DEFAULT_FONTS[0].family;
        }
        if (renderCallback) renderCallback();
        await saveSite();
        setStatus('✓ فونت حذف شد');
      } catch (err) {
        console.error('[EasyWeb Font Delete Error]:', err);
        setStatus('خطا در حذف فونت', true);
      }
    };

    row.append(nameSpan, delBtn);
    list.append(row);
  });
}

async function uploadFont(event, renderCallback) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!/\.(ttf|otf|woff2?|font)$/i.test(file.name) || file.size > 8 * 1024 * 1024) {
    return setStatus('Font file must be under 8 MB', true);
  }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const name = file.name.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[^a-z0-9 _-]/gi, '').trim() || 'Custom Font';
      const extension = file.name.split('.').pop()?.toLowerCase();
      const format = extension === 'woff2' ? 'woff2' : extension === 'woff' ? 'woff' : 'truetype';

      const store = await chrome.storage.local.get({ fonts: [] });
      const currentFonts = store.fonts || [];
      const updatedFonts = [
        ...currentFonts.filter((f) => f.name !== name),
        { name, data: reader.result, type: file.type, format, size: file.size, updatedAt: Date.now() }
      ];

      await chrome.storage.local.set({ fonts: updatedFonts });
      state.fonts = updatedFonts;
      state.site.font.family = `'${name.replaceAll("'", "\\'")}'`;
      state.site.font.enabled = true;
      if (renderCallback) renderCallback();
      await saveSite();
      setStatus('✓ فونت با موفقیت ذخیره و اعمال شد');
    } catch (err) {
      console.error('[EasyWeb Font Save Error]:', err);
      setStatus('خطا در ذخیره فونت: ' + (err.message || ''), true);
    }
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

async function startPicker(feature) {
  if (!state.tabId) return setStatus('Open a web page first', true);
  const ready = await ensureContentScript();
  if (!ready) return setStatus('Picker unavailable', true);
  const result = await chrome.tabs.sendMessage(state.tabId, { type: 'START_PICKER', feature }).catch(() => null);
  if (result?.ok) setStatus('Click an element on the page');
  else setStatus('Picker unavailable', true);
}

// --- Module: popup/components/translate-card.js ---
/**
 * Translate Card Controller with Google and AI Engine Support,
 * Tone / Prompt Customization and Manual On-Demand Execution
 */
function bindTranslateCard(renderCallback) {
  $('translate-target').onclick = () => {
    state.activeTargetId = null;
    renderCallback();
  };

  $('translate-enabled').onchange = async () => {
    const checked = $('translate-enabled').checked;
    const scope = state.site.translate?.scope || 'page';

    if (scope === 'page') {
      state.site.translate.enabled = checked;
    } else {
      if (checked) {
        if (!state.site.targets.some((t) => t.translate?.enabled)) {
          const target = activeTarget('translate') || state.site.targets[0];
          if (target) {
            target.translate = target.translate || { ...DEFAULT_SITE.translate, enabled: true };
            target.translate.enabled = true;
          }
        }
      } else {
        state.site.targets.forEach((t) => {
          if (t.translate) t.translate.enabled = false;
        });
      }
    }
    if (!checked) {
      if (state.tabId) {
        await chrome.tabs.sendMessage(state.tabId, { type: 'RESTORE_TRANSLATION' }).catch(() => {});
      }
      setStatus('✓ ترجمه غیرفعال شد و متن اصلی بازگردانده شد');
    }

    renderCallback();
    await saveSite();
  };

  $('translate-target-lang').onchange = async () => {
    const scope = state.site.translate?.scope || 'page';
    const target = scope === 'element' ? activeTarget('translate') : null;
    const lang = $('translate-target-lang').value;
    if (target) {
      target.translate = { ...target.translate, enabled: true, scope: 'element', targetLang: lang };
    } else {
      state.site.translate.enabled = true;
      state.site.translate.targetLang = lang;
    }
    renderCallback();
    await saveSite();
  };

  $('translate-engine').onchange = async () => {
    const scope = state.site.translate?.scope || 'page';
    const target = scope === 'element' ? activeTarget('translate') : null;
    const engine = $('translate-engine').value;
    if (target) {
      target.translate = { ...target.translate, scope: 'element', engine };
    } else {
      state.site.translate.engine = engine;
    }
    renderCallback();
    await saveSite();
  };

  if ($('translate-tone')) {
    $('translate-tone').onchange = async () => {
      const scope = state.site.translate?.scope || 'page';
      const target = scope === 'element' ? activeTarget('translate') : null;
      const tone = $('translate-tone').value;
      if (target) {
        target.translate = { ...target.translate, scope: 'element', tone };
      } else {
        state.site.translate.tone = tone;
      }
      renderCallback();
      await saveSite();
    };
  }

  if ($('translate-prompt')) {
    $('translate-prompt').oninput = async () => {
      const scope = state.site.translate?.scope || 'page';
      const target = scope === 'element' ? activeTarget('translate') : null;
      const customPrompt = $('translate-prompt').value;
      if (target) {
        target.translate = { ...target.translate, scope: 'element', customPrompt };
      } else {
        state.site.translate.customPrompt = customPrompt;
      }
      await saveSite();
    };
  }

  // Manual Trigger: Translate Action Button
  if ($('translate-action-btn')) {
    $('translate-action-btn').onclick = async () => {
      if (!state.tabId) return setStatus('یک صفحه وب را باز کنید', true);
      const ready = await ensureContentScript();
      if (!ready) return setStatus('اسکریپت صفحه در دسترس نیست', true);

      const scope = state.site.translate?.scope || 'page';
      const target = scope === 'element' ? activeTarget('translate') : null;
      const transCfg = target?.translate || state.site.translate || DEFAULT_SITE.translate;

      const btn = $('translate-action-btn');
      const originalText = btn.textContent;
      btn.textContent = '⏳ در حال ترجمه...';
      btn.classList.add('loading');
      setStatus('در حال ارسال و ترجمه متن صفحه...');

      try {
        if (scope === 'page') {
          state.site.translate.enabled = true;
        } else if (target) {
          target.translate = target.translate || { ...DEFAULT_SITE.translate };
          target.translate.enabled = true;
        }
        await saveSite();

        const response = await chrome.tabs.sendMessage(state.tabId, {
          type: 'EXECUTE_TRANSLATION',
          targetLang: transCfg.targetLang || $('translate-target-lang')?.value || 'fa',
          engine: transCfg.engine || $('translate-engine')?.value || 'google',
          tone: transCfg.tone || $('translate-tone')?.value || 'standard',
          customPrompt: transCfg.customPrompt || $('translate-prompt')?.value || '',
          scope,
          targetId: target?.id || null
        });

        if (response?.ok) {
          setStatus('✓ ترجمه با موفقیت انجام شد');
        } else {
          setStatus('خطا در ترجمه: ' + (response?.error || 'ناشناخته'), true);
        }
      } catch (err) {
        console.error('[EasyWeb Translate Execute Error]:', err);
        setStatus('خطا در ارتباط با صفحه', true);
      } finally {
        btn.textContent = originalText;
        btn.classList.remove('loading');
        renderCallback();
      }
    };
  }

  $('pick-translate').onclick = () => startPicker('translate');

  $('reset-translate').onclick = async () => {
    if (state.tabId) {
      await chrome.tabs.sendMessage(state.tabId, { type: 'RESTORE_TRANSLATION' }).catch(() => {});
    }
    state.site.translate = structuredClone(DEFAULT_SITE.translate);
    state.site.targets = state.site.targets.map((t) => ({ ...t, translate: null }));
    renderCallback();
    await saveSite();
    setStatus('✓ متن به حالت اصلی بازگردانده شد');
  };
}
function renderTranslateCard() {
  const transScope = state.site.translate?.scope || 'page';
  $('translate-enabled').checked = transScope === 'page'
    ? Boolean(state.site.translate?.enabled)
    : state.site.targets.some((t) => t.translate?.enabled);

  const transTarget = transScope === 'element' ? activeTarget('translate') : null;
  const transCfg = transTarget?.translate || state.site.translate || DEFAULT_SITE.translate;

  if ($('translate-target')) {
    $('translate-target').innerHTML = transTarget
      ? `<b>Segment:</b> ${transTarget.label} <span style="font-size:8px;color:#b8b2ff">(Click for Page)</span>`
      : (transScope === 'element' ? 'Scope: <b>Sections</b> (Click ＋ to Add)' : 'Scope: <b>Page</b>');
  }

  renderLanguageOptions();
  renderToneOptions();

  $('translate-target-lang').value = transCfg.targetLang || 'fa';
  $('translate-engine').value = transCfg.engine || 'google';

  if ($('translate-tone')) {
    $('translate-tone').value = transCfg.tone || 'standard';
  }
  if ($('translate-prompt')) {
    $('translate-prompt').value = transCfg.customPrompt || '';
  }
}

function renderLanguageOptions() {
  const select = $('translate-target-lang');
  if (!select || select.children.length) return;
  select.innerHTML = '';
  SUPPORTED_LANGUAGES.forEach((lang) => {
    const opt = document.createElement('option');
    opt.value = lang.code;
    opt.textContent = lang.name;
    select.append(opt);
  });
}

function renderToneOptions() {
  const select = $('translate-tone');
  if (!select || select.children.length) return;
  select.innerHTML = '';
  TRANSLATION_TONES.forEach((tone) => {
    const opt = document.createElement('option');
    opt.value = tone.id;
    opt.textContent = tone.name;
    select.append(opt);
  });
}

async function startPicker(feature) {
  if (!state.tabId) return setStatus('Open a web page first', true);
  const ready = await ensureContentScript();
  if (!ready) return setStatus('Picker unavailable', true);
  const result = await chrome.tabs.sendMessage(state.tabId, { type: 'START_PICKER', feature }).catch(() => null);
  if (result?.ok) setStatus('Click an element on the page');
  else setStatus('Picker unavailable', true);
}

// --- Module: popup/components/persian-hint.js ---
/**
 * Persian Detection and Notification Banner
 */
function bindPersianHint(renderCallback) {
  $('persian-apply').onclick = async () => {
    state.site.font.enabled = true;
    state.site.font.scope = 'page';
    state.site.font.family = "'Vazirmatn', 'Tahoma', sans-serif";
    renderCallback();
    await saveSite();
  };

  $('persian-dismiss').onclick = () => {
    $('persian-hint')?.classList.add('hidden');
  };
}
async function checkPersianHint() {
  if (!state.tabId) return;
  const ready = await ensureContentScript();
  if (!ready) return;
  const res = await chrome.tabs.sendMessage(state.tabId, { type: 'GET_PAGE_INFO' }).catch(() => null);
  const info = res?.info;
  if (!info) return;

  if (info.persian) {
    const badge = $('persian-badge');
    if (badge) {
      badge.textContent = info.needsFont ? 'فارسی · no font' : 'فارسی';
      badge.classList.remove('hidden');
      badge.classList.toggle('warn', info.needsFont);
    }
  }

  if (info.persian && info.needsFont && !state.site.enabled) {
    const hintText = $('persian-hint-text');
    if (hintText) hintText.textContent = 'Persian text without a proper Persian font.';
    $('persian-hint')?.classList.remove('hidden');
  }
}

// --- Module: popup/popup.js ---
/**
 * Main Popup Controller & Lifecycle
 */









function render() {
  renderScopeTabs();
  renderLayoutCard();
  renderTypeCard(render);
  renderTranslateCard();
  renderTargets('direction', render);
  renderTargets('font', render);
  renderTargets('translate', render);
}

function bind() {
  bindScopeTabs(render);
  bindLayoutCard(render);
  bindTypeCard(render);
  bindTranslateCard(render);
  bindPersianHint(render);

  document.querySelectorAll('[data-advanced]').forEach((button) => {
    button.onclick = async () => {
      const panel = $(button.dataset.advanced + '-advanced');
      panel.classList.toggle('open');
      const openIds = [...document.querySelectorAll('.advanced.open')].map((p) => p.id);
      await chrome.storage.local.set({ openPanels: openIds });
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
    const result = await chrome.runtime.sendMessage({ type: 'OPEN_SIDEBAR' });
    if (!result?.ok) setStatus(result?.error || 'Sidebar unavailable', true);
    else window.close();
  };

  window.addEventListener('blur', () => {
    const node = $('status');
    if (node) node.textContent = '';
  });
}

async function init() {
  bind();

  const context = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_CONTEXT' });
  if (!context?.ok) return setStatus(context?.error || 'Open a web page', true);

  state.tabId = context.tab.id;
  state.domain = context.domain || '';
  $('domain').textContent = state.domain;

  const store = await getStorage();
  state.fonts = store.fonts || [];
  state.site = migrateSite(store.settings[state.domain]);

  const openPanels = store.openPanels || [];
  openPanels.forEach((id) => $(id)?.classList.add('open'));

  const picked = await chrome.runtime.sendMessage({ type: 'GET_PICKER_RESULT' });
  if (picked?.result) {
    const feature = picked.result.feature;
    if (!state.site[feature]) state.site[feature] = {};
    state.site[feature].scope = 'element';

    const existing = state.site.targets.find((t) => t.selector === picked.result.selector);
    if (existing) {
      state.activeTargetId = existing.id;
    } else {
      const target = {
        id: `t${Math.random().toString(36).slice(2, 8)}`,
        selector: picked.result.selector,
        label: picked.result.label || picked.result.selector,
        direction: null,
        font: null,
        translate: null
      };
      state.site.targets.push(target);
      state.activeTargetId = target.id;
    }

    const target = state.site.targets.find((t) => t.id === state.activeTargetId);
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
    render();
    await saveSite();
    setStatus('✓ Section added');
  }

  render();
  await checkPersianHint();

  if (state.site.enabled) {
    const applied = await pushSettings();
    if (applied) setStatus('Applied to this page');
  }
}

init();
})();
