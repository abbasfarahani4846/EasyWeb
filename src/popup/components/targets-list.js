/**
 * Interactive Targets List Component
 */
import { state, $, saveSite, highlightOnPage, clearHighlightOnPage } from '../state.js';

export function renderTargets(feature, renderCallback) {
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
