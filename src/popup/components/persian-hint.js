/**
 * Persian Detection and Notification Banner
 */
import { state, $, saveSite, ensureContentScript } from '../state.js';

export function bindPersianHint(renderCallback) {
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

export async function checkPersianHint() {
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
