/**
 * Shared Application Constants
 */
export const VERSION = '16';
export const STORAGE_KEY = 'settings';
export const TEXT_CLASS = 'easyweb-text-node';
export const ROOT_ATTR = 'data-easyweb-font-root';
export const DIRECTION_ATTR = 'data-easyweb-direction';
export const RUNTIME_STYLE_ID = 'easyweb-runtime-style';

/** Ad-blocker runtime hooks (content side). */
export const ADBLOCK_STYLE_ID = 'easyweb-adblock-style';
export const ADBLOCK_FLAG_ATTR = 'data-easyweb-adblock';
/** Stores an element's original `style` attribute so hiding can be undone. */
export const ADBLOCK_PREV_STYLE_ATTR = 'data-easyweb-adblock-style';
export const OVERLAY_ATTR = 'data-easyweb-overlay-neutralized';
export const GUARD_FLAG = '__easywebGuardInstalled';

/** Milliseconds within which a real user gesture legitimises a new tab. */
export const GESTURE_WINDOW_MS = 1500;

/** Set on `window` while the element picker is running, so the popup guard
 *  steps aside and lets the picker receive the click. */
export const PICKER_FLAG = '__easywebPickerActive';

/**
 * Master switch for the whole ad-blocker subsystem (network rules, popup guard,
 * cosmetic filtering and the MAIN-world scriptlet engine).
 *
 * Currently OFF by request: the feature is parked, not removed. Every runtime
 * entry point checks this flag, and `src/manifest.json` no longer declares the
 * blocker's permissions, content scripts or rule-sets.
 *
 * To bring it back:
 *   1. set this to `true`;
 *   2. in `src/manifest.json` restore `declarativeNetRequest` + `webNavigation`
 *      to `permissions`, the `declarative_net_request.rule_resources` block,
 *      the `guard.js` and `inject.js` content scripts, and the
 *      `rules/noop.js` web-accessible resource (see git history);
 *   3. `npm run verify` — the build compiles the rule-sets again automatically
 *      once the manifest declares them.
 */
export const ADBLOCK_ENABLED = true;
