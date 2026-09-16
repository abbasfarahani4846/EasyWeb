import { compileList, compileAll } from '../src/rules/compile.js';
import { FILTER_LISTS } from '../src/rules/lists.js';
import { STRICT_SITE_FILTERS } from '../src/rules/strict.js';
import { NETWORK_RESOURCE_TYPES, NAVIGATION_RESOURCE_TYPES } from '../src/shared/adblock.js';

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; return; }
  fail++;
  console.log(`FAIL ${label}\n   expected ${e}\n   actual   ${a}`);
}

/* ---- compileList unit behaviour ---- */

const sample = compileList({
  resourceTypes: ['script'],
  filters: [
    '||a.example^',
    '||a.example^',              // exact duplicate -> dropped
    '@@||b.example^',            // exception -> allow
    '/banner\\d+/',              // slash-wrapped regex
    { r: '^https?://x/ads\\.js$', t: ['script'], redirect: 'noop' },
    { r: '^https?://x/ads2\\.js$', t: ['script'], redirect: 'noop' }, // must NOT be deduped away
    { f: '||c.example^', t: ['image'], p: 5 },
    '',                          // ignored
    null,                        // ignored
    { t: ['script'] }            // no pattern -> ignored
  ]
});

check('dedupe + skip count', sample.length, 6);
check('ids are sequential from 1', sample.map((r) => r.id), [1, 2, 3, 4, 5, 6]);
check('duplicate dropped', sample.filter((r) => r.condition.urlFilter === '||a.example^').length, 1);
check('exception is allow', sample.find((r) => r.condition.urlFilter === '||b.example^').action.type, 'allow');
check('slash regex compiled', sample.find((r) => r.id === 3).condition.regexFilter, 'banner\\d+');
check('regex-only entry 1 kept', sample.find((r) => r.id === 4).condition.regexFilter, '^https?://x/ads\\.js$');
check('regex-only entry 2 kept (regression)', sample.find((r) => r.id === 5).condition.regexFilter, '^https?://x/ads2\\.js$');
check('redirect action shape', sample.find((r) => r.id === 4).action, { type: 'redirect', redirect: { extensionPath: '/rules/noop.js' } });
check('per-entry resource types', sample.find((r) => r.id === 6).condition.resourceTypes, ['image']);
check('per-entry priority', sample.find((r) => r.id === 6).priority, 5);
check('list default resource types', sample.find((r) => r.id === 1).condition.resourceTypes, ['script']);
check('list default priority', sample.find((r) => r.id === 1).priority, 1);

/* ---- every shipped list compiles cleanly ---- */

const { files, summary } = compileAll(FILTER_LISTS);
check('summary reports every list', summary.split(', ').length, Object.keys(FILTER_LISTS).length);

let totalRules = 0;
const problems = [];

for (const [name, list] of Object.entries(FILTER_LISTS)) {
  const rules = files[list.file];
  totalRules += rules.length;

  if (rules.length < list.filters.length * 0.9) {
    problems.push(`${name}: only ${rules.length} rules from ${list.filters.length} filters (entries dropped)`);
  }

  const ids = new Set();
  for (const rule of rules) {
    if (ids.has(rule.id)) problems.push(`${name}: duplicate id ${rule.id}`);
    ids.add(rule.id);
    if (!rule.action?.type) problems.push(`${name}: rule ${rule.id} missing action`);
    if (!rule.condition?.resourceTypes?.length) problems.push(`${name}: rule ${rule.id} missing resourceTypes`);
    if (!rule.condition.urlFilter && !rule.condition.regexFilter) {
      problems.push(`${name}: rule ${rule.id} has no pattern`);
    }
    if (rule.condition.regexFilter) {
      try { new RegExp(rule.condition.regexFilter); } catch (_) { problems.push(`${name}: rule ${rule.id} invalid regex`); }
    }
    if (rule.action.type === 'redirect') {
      if (!rule.action.redirect?.extensionPath?.startsWith('/rules/')) {
        problems.push(`${name}: rule ${rule.id} bad redirect path`);
      }
      if (!rule.condition.resourceTypes.every((t) => ['script', 'image', 'sub_frame', 'xmlhttprequest', 'ping', 'media', 'other', 'stylesheet', 'font', 'object', 'websocket'].includes(t))) {
        problems.push(`${name}: rule ${rule.id} redirects a non-payload type`);
      }
    }
  }
}

check('shipped lists compile without dropping entries', problems, []);
check('total rule count is substantial', totalRules > 400, true);
check('total stays inside the static ruleset budget', totalRules < 30000, true);

/* ---- per-list expectations ---- */

check('ads list excludes main_frame',
  files['ads.json'].every((r) => !r.condition.resourceTypes.includes('main_frame')), true);
check('trackers list excludes main_frame',
  files['trackers.json'].every((r) => !r.condition.resourceTypes.includes('main_frame')), true);
check('popups list blocks the top document',
  files['popups.json'].some((r) => r.condition.resourceTypes.includes('main_frame')), true);
check('popups list only uses navigation types',
  files['popups.json'].every((r) => r.condition.resourceTypes.every((t) => NAVIGATION_RESOURCE_TYPES.includes(t))), true);
check('annoyances has bait-script redirects',
  files['annoyances.json'].filter((r) => r.action.type === 'redirect').length, 5);
check('redirect regexes are distinct',
  new Set(files['annoyances.json'].filter((r) => r.action.type === 'redirect').map((r) => r.condition.regexFilter)).size, 5);
check('ads rules use payload types',
  files['ads.json'].every((r) => r.condition.resourceTypes.every((t) => NETWORK_RESOURCE_TYPES.includes(t))), true);

/* ---- strict filters are valid and scoped ---- */

check('strict filters all have a target', STRICT_SITE_FILTERS.every((e) => e.t?.length), true);
check('strict filters have a pattern or domainType',
  STRICT_SITE_FILTERS.every((e) => e.f || e.r || e.d), true);
check('strict regexes compile',
  STRICT_SITE_FILTERS.filter((e) => e.r).every((e) => { try { new RegExp(e.r); return true; } catch (_) { return false; } }), true);
check('strict blocks third-party frames', STRICT_SITE_FILTERS.some((e) => e.d === 'thirdParty' && e.t.includes('sub_frame')), true);

/* ---- no duplicate filter entries within a shipped list ---- */

for (const [name, list] of Object.entries(FILTER_LISTS)) {
  const strings = list.filters.filter((f) => typeof f === 'string');
  const dupes = strings.filter((f, i) => strings.indexOf(f) !== i);
  check(`${name} has no literal duplicates`, dupes, []);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
