/**
 * EasyWeb Ad Blocker — Guard Bootstrap
 *
 * Installs the document_start interaction guard and keeps its settings fresh.
 * Shared by two callers:
 *   • guard.js  — the manifest content script, which runs at document_start
 *   • content.js — which calls it again on (re-)injection, so the guard comes
 *     back to life on pages that were already open when the extension reloaded
 *
 * `claimInstance` makes this safe to call repeatedly: a live guard of the same
 * version is never duplicated.
 */

import { ADBLOCK_STORAGE_KEY, DEFAULT_ADBLOCK, resolveToggles, TOGGLE_KEYS } from '../../shared/adblock.js';
import { STORAGE_KEY, GUARD_FLAG } from '../../shared/constants.js';
import { cleanHostname } from '../../shared/domain.js';
import { isContextValid, claimInstance } from '../core/context.js';
import { injectCosmeticCss } from './cosmetic.js';
import { installInteractionGuard, setGuardActive, updateGuardConfig } from './popup-guard.js';

/**
 * Tell the MAIN-world scriptlet engine whether it should act on this page.
 * `window.postMessage` is the only channel that crosses between the isolated
 * content-script world and the page's own context.
 */
function publishScriptletConfig(config, toggles) {
  try {
    window.postMessage({
      source: 'easyweb-isolated',
      type: 'inject-config',
      enabled: config.scriptlets !== false && TOGGLE_KEYS.some((key) => toggles[key])
    }, '*');
  } catch (_) {}
}

/**
 * @returns {boolean} true when this call installed the guard, false when a live
 *   instance already owned the slot.
 */
export function bootGuard() {
  if (!isContextValid()) return false;
  if (!claimInstance(GUARD_FLAG)) return false;

  const domain = cleanHostname(location.hostname);

  const apply = (config, site) => {
    const toggles = resolveToggles(config, site, domain);
    injectCosmeticCss({ toggles, config, customRules: config.customRules });
    updateGuardConfig(config.popupGuard || DEFAULT_ADBLOCK.popupGuard);
    setGuardActive(Boolean(toggles.popups));
    publishScriptletConfig(config, toggles);
  };

  // Install with defaults immediately; the stored settings arrive a tick later.
  installInteractionGuard({ guard: DEFAULT_ADBLOCK.popupGuard, isActive: false });

  const load = async () => {
    try {
      const store = await chrome.storage.local.get({
        [ADBLOCK_STORAGE_KEY]: DEFAULT_ADBLOCK,
        [STORAGE_KEY]: {}
      });
      if (!isContextValid()) return;
      const config = { ...DEFAULT_ADBLOCK, ...(store[ADBLOCK_STORAGE_KEY] || {}) };
      apply(config, (store[STORAGE_KEY] || {})[domain] || null);
    } catch (_) {}
  };

  load();

  if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (!changes[ADBLOCK_STORAGE_KEY] && !changes[STORAGE_KEY]) return;
      load();
    });
  }

  return true;
}
