/**
 * Layout / Direction Card Controller
 */
import { DEFAULT_SITE } from '../../shared/defaults.js';
import { syncSiteEnabled } from '../../shared/models.js';
import { state, $, saveSite, scheduleSaveSite, applyLive, activeTarget, setStatus, ensureContentScript } from '../state.js';

export function bindLayoutCard(renderCallback) {
  $('layout-card')?.querySelector('.eyebrow')?.addEventListener('click', () => {
    $('layout-card')?.classList.toggle('collapsed');
  });

  $('direction-target').onclick = () => {
    state.activeTargetId = null;
    renderCallback();
  };

  $('direction-enabled').onchange = async () => {
    const checked = $('direction-enabled').checked;
    const scope = state.site.direction.scope || 'page';

    if (checked) {
      if (scope === 'element') {
        const targets = state.site.targets || [];
        const dirTargets = targets.filter((t) => t.direction);
        if (dirTargets.length > 0) {
          const target = activeTarget('direction') || dirTargets[0];
          target.direction = target.direction || { ...DEFAULT_SITE.direction, enabled: true, value: $('direction-value').value };
          target.direction.enabled = true;
        } else if (targets.length > 0) {
          targets[0].direction = { ...DEFAULT_SITE.direction, enabled: true, value: $('direction-value').value };
          state.activeTargetId = targets[0].id;
        } else {
          startPicker('direction');
          return;
        }
      } else {
        state.site.direction.scope = 'page';
        state.site.direction.enabled = true;
      }
    } else {
      if (scope === 'element') {
        if (Array.isArray(state.site.targets)) {
          state.site.targets.forEach((t) => {
            if (t.direction) t.direction.enabled = false;
          });
        }
      } else {
        state.site.direction.enabled = false;
      }
    }
    syncSiteEnabled(state.site);
    applyLive();
    renderCallback();
    await saveSite();
  };

  const onDirChange = () => {
    const scope = state.site.direction.scope || 'page';
    const val = $('direction-value').value;
    if (scope === 'element') {
      const target = activeTarget('direction');
      if (target) {
        target.direction = { ...target.direction, enabled: true, value: val, scope: 'element' };
      } else if (Array.isArray(state.site.targets) && state.site.targets.length) {
        state.site.targets.forEach((t) => {
          if (t.direction) {
            t.direction.value = val;
            t.direction.enabled = true;
          }
        });
      }
    } else {
      state.site.direction.enabled = true;
      state.site.direction.value = val;
      state.site.direction.scope = 'page';
    }
    syncSiteEnabled(state.site);
    $('direction-enabled').checked = true;
    $('layout-card')?.classList.remove('collapsed');
    applyLive();
    scheduleSaveSite(100);
  };

  $('direction-value').onchange = onDirChange;
  $('direction-value').oninput = onDirChange;

  $('pick-direction').onclick = () => startPicker('direction');

  $('reset-direction').onclick = async () => {
    state.site.direction = structuredClone(DEFAULT_SITE.direction);
    state.site.targets = state.site.targets.map((t) => ({ ...t, direction: null }));
    syncSiteEnabled(state.site);
    applyLive();
    renderCallback();
    await saveSite();
  };
}

export function renderLayoutCard() {
  const dirScope = state.site.direction.scope || 'page';
  const hasDirTargets = Array.isArray(state.site.targets) && state.site.targets.some((t) => t.direction?.enabled);
  const dirOn = dirScope === 'page' ? Boolean(state.site.direction?.enabled) : hasDirTargets;
  $('direction-enabled').checked = dirOn;
  const shouldCollapse = !dirOn && dirScope === 'page';
  $('layout-card')?.classList.toggle('collapsed', shouldCollapse);

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
  // ponytail: close popup so user sees page and can click element
  if (result?.ok) {
    window.close();
  } else {
    setStatus('Picker unavailable', true);
  }
}
