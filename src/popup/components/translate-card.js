/**
 * Translate Card Controller with Google and AI Engine Support,
 * Tone / Prompt Customization and Manual On-Demand Execution
 */
import { DEFAULT_SITE, SUPPORTED_LANGUAGES, TRANSLATION_TONES } from '../../shared/defaults.js';
import { syncSiteEnabled } from '../../shared/models.js';
import { state, $, saveSite, scheduleSaveSite, applyLive, activeTarget, setStatus, ensureContentScript } from '../state.js';

export function bindTranslateCard(renderCallback) {
  $('translate-card')?.querySelector('.eyebrow')?.addEventListener('click', () => {
    $('translate-card')?.classList.toggle('collapsed');
  });

  $('translate-target').onclick = () => {
    state.activeTargetId = null;
    renderCallback();
  };

  $('translate-enabled').onchange = async () => {
    const checked = $('translate-enabled').checked;
    const scope = state.site.translate?.scope || 'page';

    if (checked) {
      if (scope === 'element') {
        const target = activeTarget('translate') || state.site.targets.find((t) => t.translate) || state.site.targets[0];
        if (target) {
          target.translate = target.translate || { ...DEFAULT_SITE.translate, enabled: true };
          target.translate.enabled = true;
        } else {
          // No targets exist for element scope — switch to page scope and enable
          if (!state.site.translate) state.site.translate = {};
          state.site.translate.scope = 'page';
          state.site.translate.enabled = true;
        }
      } else {
        if (!state.site.translate) state.site.translate = {};
        state.site.translate.scope = 'page';
        state.site.translate.enabled = true;
      }
    } else {
      if (state.site.translate) state.site.translate.enabled = false;
      if (Array.isArray(state.site.targets)) {
        state.site.targets.forEach((t) => {
          if (t.translate) t.translate.enabled = false;
        });
      }
    }
    syncSiteEnabled(state.site);
    applyLive();
    if (!checked) {
      if (state.tabId) {
        await chrome.tabs.sendMessage(state.tabId, { type: 'RESTORE_TRANSLATION' }).catch(() => {});
      }
      setStatus('✓ ترجمه غیرفعال شد و متن اصلی بازگردانده شد');
    }

    renderCallback();
    await saveSite();
  };

  const onLangChange = () => {
    const scope = state.site.translate?.scope || 'page';
    const target = scope === 'element' ? activeTarget('translate') : null;
    const lang = $('translate-target-lang').value;
    if (target) {
      target.translate = { ...target.translate, enabled: true, scope: 'element', targetLang: lang };
    } else {
      state.site.translate.enabled = true;
      state.site.translate.targetLang = lang;
    }
    syncSiteEnabled(state.site);
    applyLive();
    scheduleSaveSite(100);
  };

  $('translate-target-lang').onchange = onLangChange;
  $('translate-target-lang').oninput = onLangChange;

  const onEngineChange = () => {
    const scope = state.site.translate?.scope || 'page';
    const target = scope === 'element' ? activeTarget('translate') : null;
    const engine = $('translate-engine').value;
    if (target) {
      target.translate = { ...target.translate, scope: 'element', engine };
    } else {
      state.site.translate.engine = engine;
    }
    scheduleSaveSite(100);
  };

  $('translate-engine').onchange = onEngineChange;
  $('translate-engine').oninput = onEngineChange;

  if ($('translate-tone')) {
    const onToneChange = () => {
      const scope = state.site.translate?.scope || 'page';
      const target = scope === 'element' ? activeTarget('translate') : null;
      const tone = $('translate-tone').value;
      if (target) {
        target.translate = { ...target.translate, scope: 'element', tone };
      } else {
        state.site.translate.tone = tone;
      }
      scheduleSaveSite(100);
    };
    $('translate-tone').onchange = onToneChange;
    $('translate-tone').oninput = onToneChange;
  }

  if ($('translate-prompt')) {
    $('translate-prompt').oninput = () => {
      const scope = state.site.translate?.scope || 'page';
      const target = scope === 'element' ? activeTarget('translate') : null;
      const customPrompt = $('translate-prompt').value;
      if (target) {
        target.translate = { ...target.translate, scope: 'element', customPrompt };
      } else {
        state.site.translate.customPrompt = customPrompt;
      }
      scheduleSaveSite(200);
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
  const hasTransTargets = Array.isArray(state.site.targets) && state.site.targets.some((t) => t.translate);
  const transOn = transScope === 'page'
    ? Boolean(state.site.translate?.enabled)
    : state.site.targets.some((t) => t.translate?.enabled);
  $('translate-enabled').checked = transOn;
  // Switched off -> show only the title and the switch (keep open if user is configuring element scope)
  const shouldCollapse = !transOn && (transScope !== 'element' || hasTransTargets);
  $('translate-card')?.classList.toggle('collapsed', shouldCollapse);

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
