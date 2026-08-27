/**
 * Layout / Direction Card Controller
 */
import { DEFAULT_SITE } from '../../shared/defaults.js';
import { state, $, saveSite, activeTarget, setStatus, ensureContentScript } from '../state.js';

export function bindLayoutCard(renderCallback) {
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

export function renderLayoutCard() {
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
