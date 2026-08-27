/**
 * Main Popup Controller & Lifecycle
 */
import { DEFAULT_SITE } from '../shared/defaults.js';
import { migrateSite, syncSiteEnabled } from '../shared/models.js';
import { state, $, setStatus, getStorage, saveSite, pushSettings } from './state.js';
import { bindScopeTabs, renderScopeTabs } from './components/scope-tabs.js';
import { renderTargets } from './components/targets-list.js';
import { bindLayoutCard, renderLayoutCard } from './components/layout-card.js';
import { bindTypeCard, renderTypeCard } from './components/type-card.js';
import { bindTranslateCard, renderTranslateCard } from './components/translate-card.js';
import { bindPersianHint, checkPersianHint } from './components/persian-hint.js';

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
