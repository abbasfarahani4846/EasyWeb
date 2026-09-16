/**
 * Type / Typography Card Controller
 */
import { DEFAULT_FONTS, DEFAULT_SITE } from '../../shared/defaults.js';
import { syncSiteEnabled } from '../../shared/models.js';
import { state, $, saveSite, scheduleSaveSite, applyLive, activeTarget, setStatus, ensureContentScript } from '../state.js';

export function bindTypeCard(renderCallback) {
  $('type-card')?.querySelector('.eyebrow')?.addEventListener('click', () => {
    $('type-card')?.classList.toggle('collapsed');
  });

  $('font-target').onclick = () => {
    state.activeTargetId = null;
    renderCallback();
  };

  $('font-enabled').onchange = async () => {
    const checked = $('font-enabled').checked;
    const scope = state.site.font.scope || 'page';

    if (checked) {
      if (scope === 'element') {
        const targets = state.site.targets || [];
        const fontTargets = targets.filter((t) => t.font);
        if (fontTargets.length > 0) {
          const target = activeTarget('font') || fontTargets[0];
          target.font = target.font || { ...DEFAULT_SITE.font, enabled: true };
          target.font.enabled = true;
        } else if (targets.length > 0) {
          targets[0].font = { ...DEFAULT_SITE.font, enabled: true };
          state.activeTargetId = targets[0].id;
        } else {
          startPicker('font');
          return;
        }
      } else {
        state.site.font.scope = 'page';
        state.site.font.enabled = true;
      }
    } else {
      if (scope === 'element') {
        if (Array.isArray(state.site.targets)) {
          state.site.targets.forEach((t) => {
            if (t.font) t.font.enabled = false;
          });
        }
      } else {
        state.site.font.enabled = false;
      }
    }
    syncSiteEnabled(state.site);
    applyLive();
    renderCallback();
    await saveSite();
  };

  const onFamilyChange = () => {
    const scope = state.site.font.scope || 'page';
    const val = $('font-family').value;
    if (scope === 'element') {
      const target = activeTarget('font');
      if (target) {
        target.font = { ...target.font, enabled: true, scope: 'element', family: val };
      } else if (Array.isArray(state.site.targets) && state.site.targets.length) {
        state.site.targets.forEach((t) => {
          if (t.font) {
            t.font.family = val;
            t.font.enabled = true;
          }
        });
      }
    } else {
      state.site.font.enabled = true;
      state.site.font.family = val;
      state.site.font.scope = 'page';
    }
    syncSiteEnabled(state.site);
    $('font-enabled').checked = true;
    $('type-card')?.classList.remove('collapsed');
    applyLive();
    scheduleSaveSite(100);
  };

  $('font-family').onchange = onFamilyChange;
  $('font-family').oninput = onFamilyChange;

  const fields = [
    ['font-size', 'size'],
    ['font-unit', 'unit'],
    ['line-height', 'lineHeight'],
    ['font-weight', 'weight'],
    ['text-align', 'align']
  ];

  fields.forEach(([id, key]) => {
    const handler = () => {
      const scope = state.site.font.scope || 'page';
      const rawVal = $(id).value;
      let val = rawVal;
      if (key === 'size') val = Math.max(8, Math.min(96, Number(rawVal) || 16));
      if (key === 'weight') val = Math.max(100, Math.min(1000, Number(rawVal) || 400));

      if (scope === 'element') {
        const target = activeTarget('font');
        if (target) {
          target.font = { ...target.font, enabled: true, scope: 'element', [key]: val };
        } else if (Array.isArray(state.site.targets) && state.site.targets.length) {
          state.site.targets.forEach((t) => {
            if (t.font) {
              t.font[key] = val;
              t.font.enabled = true;
            }
          });
        }
      } else {
        state.site.font.enabled = true;
        state.site.font[key] = val;
        state.site.font.scope = 'page';
      }
      syncSiteEnabled(state.site);
      $('font-enabled').checked = true;
      $('type-card')?.classList.remove('collapsed');
      applyLive();
      scheduleSaveSite(150);
    };

    $(id).oninput = handler;
    $(id).onchange = handler;
  });

  $('pick-font').onclick = () => startPicker('font');

  $('reset-font').onclick = async () => {
    state.site.font = structuredClone(DEFAULT_SITE.font);
    state.site.targets = state.site.targets.map((t) => ({ ...t, font: null }));
    syncSiteEnabled(state.site);
    applyLive();
    renderCallback();
    await saveSite();
  };

  $('font-upload').onchange = async (event) => {
    await uploadFont(event, renderCallback);
  };
}

export function renderTypeCard(renderCallback) {
  const fontScope = state.site.font.scope || 'page';
  const hasFontTargets = Array.isArray(state.site.targets) && state.site.targets.some((t) => t.font?.enabled);
  const fontOn = fontScope === 'page' ? Boolean(state.site.font?.enabled) : hasFontTargets;
  $('font-enabled').checked = fontOn;
  const shouldCollapse = !fontOn && fontScope === 'page';
  $('type-card')?.classList.toggle('collapsed', shouldCollapse);

  const fontTarget = fontScope === 'element' ? activeTarget('font') : null;
  const fontCfg = fontTarget?.font || state.site.font;

  if ($('font-target')) {
    $('font-target').innerHTML = fontTarget
      ? `<b>Segment:</b> ${fontTarget.label} <span style="font-size:8px;color:#b8b2ff">(Click for Page)</span>`
      : (fontScope === 'element' ? 'Scope: <b>Sections</b> (Click ＋ to Add)' : 'Scope: <b>Page</b>');
  }

  const active = document.activeElement;
  const isEditing = (id) => active && active.id === id;

  if (!isEditing('font-size')) $('font-size').value = fontCfg.size || 16;
  if (!isEditing('font-unit')) $('font-unit').value = fontCfg.unit || 'px';
  if (!isEditing('line-height')) $('line-height').value = fontCfg.lineHeight || '1.6';
  if (!isEditing('font-weight')) $('font-weight').value = fontCfg.weight || 400;
  if (!isEditing('text-align')) $('text-align').value = fontCfg.align || 'start';

  renderFontOptions();
  renderCustomFonts(renderCallback);
}

function renderFontOptions() {
  const select = $('font-family');
  if (!select) return;
  const fontTarget = activeTarget('font');
  const current = fontTarget?.font?.family || state.site.font.family;

  const allFonts = [
    ...DEFAULT_FONTS,
    ...state.fonts.map((f) => ({ name: f.name, family: `'${f.name.replaceAll("'", "\\'")}'` }))
  ];

  if (select.children.length !== allFonts.length) {
    select.innerHTML = '';
    allFonts.forEach((f) => {
      const opt = document.createElement('option');
      opt.value = f.family;
      opt.textContent = f.name;
      select.append(opt);
    });
  }

  if (select.value !== current) {
    select.value = current;
    if (select.value !== current) {
      const match = Array.from(select.options).find((opt) =>
        opt.value.includes(current) || current.includes(opt.value) ||
        opt.textContent.trim().toLowerCase() === current.trim().toLowerCase()
      );
      if (match) select.value = match.value;
      else select.value = DEFAULT_FONTS[0].family;
    }
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
  // ponytail: close popup so user sees page and can click element
  if (result?.ok) {
    window.close();
  } else {
    setStatus('Picker unavailable', true);
  }
}
