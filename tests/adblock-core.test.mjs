import {
  resolveToggles,
  hostMatchesEntry,
  hostInList,
  isKnownAdHost,
  isAuthHost,
  parseCustomRule,
  extractCosmeticRules,
  buildCosmeticCss,
  normalizeHost,
  formatCount,
  mergeStats,
  DEFAULT_ADBLOCK,
  MODE_PRESETS
} from '../src/shared/adblock.js';
import { mergeSite, mergeBlocker } from '../src/shared/models.js';
import { DEFAULT_SITE } from '../src/shared/defaults.js';

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; return; }
  fail++;
  console.log(`FAIL ${label}\n   expected ${e}\n   actual   ${a}`);
}

/* ---- domain matching ---- */
check('exact', hostMatchesEntry('example.com', 'example.com'), true);
check('subdomain', hostMatchesEntry('sub.example.com', 'example.com'), true);
check('deep subdomain', hostMatchesEntry('a.b.example.com', 'example.com'), true);
check('suffix attack', hostMatchesEntry('example.com.evil.com', 'example.com'), false);
check('www normalised', hostMatchesEntry('www.example.com', 'example.com'), true);
check('wildcard', hostMatchesEntry('cdn.example.com', '*.example.com'), true);
check('wildcard apex', hostMatchesEntry('example.com', '*.example.com'), true);
check('wildcard other', hostMatchesEntry('notexample.com', '*.example.com'), false);
check('url input', hostMatchesEntry('https://ads.example.com/x?y=1', 'example.com'), true);
check('normalize url', normalizeHost('https://WWW.Example.com:8080/a/b'), 'example.com');
check('in list', hostInList('track.example.com', ['example.com', 'other.net']), true);

/* ---- ad host detection ---- */
check('ad host', isKnownAdHost('pagead2.googlesyndication.com'), true);
check('ad host suffix', isKnownAdHost('sub.doubleclick.net'), true);
check('ad host false positive', isKnownAdHost('example.com'), false);
check('ad host lookalike', isKnownAdHost('notdoubleclick.net'), false);
check('auth host', isAuthHost('accounts.google.com'), true);
check('auth host custom', isAuthHost('my-idp.corp.com', ['my-idp.corp.com']), true);

/* ---- toggle resolution ---- */
const base = { ...DEFAULT_ADBLOCK };
check('global default', resolveToggles(base, null, 'x.com').ads, true);
check('global default complete blocking', resolveToggles(base, null, 'x.com').annoyances, true);
check('global off', resolveToggles({ ...base, enabled: false }, null, 'x.com').ads, false);
check('whitelisted', resolveToggles({ ...base, whitelist: ['trusted.com'] }, null, 'trusted.com').reason, 'whitelisted');
check('whitelist match subdomain',
  resolveToggles({ ...base, whitelist: ['trusted.com'] }, null, 'www.trusted.com').reason, 'whitelisted');
check('site off', resolveToggles(base, { blocker: { enabled: false, mode: 'inherit' } }, 'x.com').reason, 'site-off');
check('site mode off', resolveToggles(base, { blocker: { enabled: true, mode: 'off' } }, 'x.com').reason, 'site-off');
check('site strict', resolveToggles(base, { blocker: { enabled: true, mode: 'strict' } }, 'x.com').annoyances, true);
check('site custom', resolveToggles(base, { blocker: { enabled: true, mode: 'custom', toggles: { ads: false, popups: true } } }, 'x.com').ads, false);
check('site custom popups kept',
  resolveToggles(base, { blocker: { enabled: true, mode: 'custom', toggles: { ads: false, popups: true } } }, 'x.com').popups, true);
check('global custom', resolveToggles({ ...base, mode: 'custom', toggles: { trackers: true } }, null, 'x.com').ads, false);
check('global custom trackers', resolveToggles({ ...base, mode: 'custom', toggles: { trackers: true } }, null, 'x.com').trackers, true);
check('mode presets off', MODE_PRESETS.off.ads, false);

/* ---- custom rule parsing ---- */
check('domain anchor', parseCustomRule('||ads.example.com^').condition.urlFilter, '||ads.example.com^');
check('domain anchor action', parseCustomRule('||ads.example.com^').action.type, 'block');
check('exception', parseCustomRule('@@||trusted.com^').action.type, 'allow');
check('comment', parseCustomRule('! a comment'), null);
check('hash comment', parseCustomRule('# another'), null);
check('cosmetic skipped', parseCustomRule('example.com##.ad-banner'), null);
check('plain filter', parseCustomRule('banner/track.gif').condition.urlFilter, 'banner/track.gif');
check('regex filter', parseCustomRule('/banner\\d+/').condition.regexFilter, 'banner\\d+');
check('regex verbatim anchor', parseCustomRule('/^https:\\/\\/ads\\./').condition.regexFilter, '^https:\\/\\/ads\\.');
check('bad regex', parseCustomRule('/[unclosed/'), null);
check('modifiers stripped', parseCustomRule('||ads.com^$script,third-party').condition.urlFilter, '||ads.com^');
check('resource types present', parseCustomRule('||ads.com^').condition.resourceTypes.length > 0, true);

/* ---- cosmetic helpers ---- */
check('cosmetic extraction', extractCosmeticRules(['example.com##.ad', '||x^', '! c']), ['.ad']);
check('css builds', buildCosmeticCss({}).includes('display: none !important'), true);
check('css sanitises braces', buildCosmeticCss({ customSelectors: ['.a{}body{display:block}'] }).includes('body{display:block}'), false);
check('css includes custom', buildCosmeticCss({ customSelectors: ['.my-ad'] }).includes('.my-ad'), true);
check('annoyances excluded by default', buildCosmeticCss({}).includes('.antiadblock'), false);
check('annoyances included', buildCosmeticCss({ includeAnnoyances: true }).includes('.antiadblock'), true);

/* ---- stats ---- */
check('format small', formatCount(42), '42');
check('format k', formatCount(1500), '1.5k');
check('format m', formatCount(2500000), '2.5M');
check('merge stats', mergeStats({ a: 1, b: 2 }, { b: 3, c: 4 }), { a: 1, b: 5, c: 4 });

/* ---- site model ---- */
const merged = mergeSite({ blocker: { enabled: false, mode: 'strict' } });
check('mergeSite keeps blocker', merged.blocker.mode, 'strict');
check('mergeSite blocker enabled', merged.blocker.enabled, false);
check('mergeSite blocker toggles null', merged.blocker.toggles, null);
check('mergeBlocker default', mergeBlocker(undefined).mode, 'inherit');
check('mergeBlocker toggles', mergeBlocker({ mode: 'custom', toggles: { ads: 1, popups: 0 } }).toggles, { ads: true, popups: false });
check('default site has blocker', Boolean(DEFAULT_SITE.blocker), true);
check('mergeSite tolerates junk', mergeSite(null).blocker.mode, 'inherit');
check('mergeSite no blocker key', mergeSite({ direction: {} }).blocker.enabled, true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
