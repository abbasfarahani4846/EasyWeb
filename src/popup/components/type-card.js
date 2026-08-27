/**
 * Type / Typography Card Controller
 */
import { DEFAULT_FONTS, DEFAULT_SITE } from '../../shared/defaults.js';
import { state, $, saveSite, activeTarget, setStatus, ensureContentScript } from '../state.js';

export function bindTypeCard(renderCallback) {
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

export function renderTypeCard(renderCallback) {
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
