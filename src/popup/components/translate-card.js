/**
 * Translate Card Controller with Google and AI Engine Support,
 * Tone / Prompt Customization and Manual On-Demand Execution
 */
import { DEFAULT_SITE, SUPPORTED_LANGUAGES, TRANSLATION_TONES } from '../../shared/defaults.js';
import { state, $, saveSite, activeTarget, setStatus, ensureContentScript } from '../state.js';

export function bindTranslateCard(renderCallback) {
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

export function renderTranslateCard() {
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
