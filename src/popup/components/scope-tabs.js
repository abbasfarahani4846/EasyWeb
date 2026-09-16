/**
 * Scope Tabs Component (Entire Page vs Selected Sections)
 */
import { syncSiteEnabled } from '../../shared/models.js';
import { state, $, saveSite, applyLive } from '../state.js';

export function bindScopeTabs(renderCallback) {
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

      syncSiteEnabled(state.site);
      applyLive();
      renderCallback();
      await saveSite();
    };
  });
}

export function renderScopeTabs() {
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
