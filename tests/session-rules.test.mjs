import { buildSessionRules } from '../src/background/adblock.js';
import { DEFAULT_ADBLOCK, NETWORK_RESOURCE_TYPES } from '../src/shared/adblock.js';
import { SESSION_RULE_RANGES } from '../src/rules/strict.js';

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; return; }
  fail++;
  console.log(`FAIL ${label}\n   expected ${e}\n   actual   ${a}`);
}

/** Structural validation against the declarativeNetRequest rule contract. */
function validate(label, rules) {
  const ids = new Set();
  const problems = [];
  for (const rule of rules) {
    if (typeof rule.id !== 'number' || rule.id < 1) problems.push(`bad id ${rule.id}`);
    if (ids.has(rule.id)) problems.push(`duplicate id ${rule.id}`);
    ids.add(rule.id);
    if (!rule.action?.type) problems.push(`rule ${rule.id} has no action type`);
    const c = rule.condition || {};
    if (!Array.isArray(c.resourceTypes) || !c.resourceTypes.length) problems.push(`rule ${rule.id} has no resourceTypes`);
    if (rule.action.type === 'allowAllRequests') {
      const ok = c.resourceTypes.includes('main_frame') || c.resourceTypes.includes('sub_frame');
      if (!ok) problems.push(`allowAllRequests rule ${rule.id} lacks frame resource type`);
      if (!c.urlFilter && !c.regexFilter) problems.push(`allowAllRequests rule ${rule.id} has no pattern`);
    } else if (!c.urlFilter && !c.regexFilter && !c.domainType) {
      problems.push(`rule ${rule.id} has neither a pattern nor domainType`);
    }
    if (c.regexFilter) {
      try { new RegExp(c.regexFilter); } catch (_) { problems.push(`rule ${rule.id} bad regex`); }
    }
  }
  check(`${label} valid`, problems, []);
  return rules;
}

const base = { ...DEFAULT_ADBLOCK };

/* 1. global off -> no rules at all */
check('global off yields no rules', buildSessionRules({ ...base, enabled: false }, {}), []);

/* 2. whitelist becomes allowAllRequests */
const wl = validate('whitelist', buildSessionRules({ ...base, whitelist: ['trusted.com'] }, {}));
check('whitelist rule count', wl.length, 1);
check('whitelist action', wl[0].action.type, 'allowAllRequests');
check('whitelist pattern', wl[0].condition.urlFilter, '||trusted.com^');
check('whitelist priority', wl[0].priority, 1000);

/* 3. blacklist becomes a block rule */
const bl = validate('blacklist', buildSessionRules({ ...base, blacklist: ['ads.evil.com'] }, {}));
check('blacklist rule count', bl.length, 1);
check('blacklist action', bl[0].action.type, 'block');
check('blacklist resource types', bl[0].condition.resourceTypes.length, NETWORK_RESOURCE_TYPES.length);

/* 4. whitelist wins over blacklist for the same domain */
const both = buildSessionRules({ ...base, whitelist: ['dup.com'], blacklist: ['dup.com'] }, {});
check('whitelist beats blacklist', both.length, 1);
check('whitelist beats blacklist action', both[0].action.type, 'allowAllRequests');

/* 5. site with mode off becomes an allow rule */
const siteOff = validate('site-off', buildSessionRules(base, { 'quiet.example': { blocker: { enabled: true, mode: 'off' } } }));
check('site off rule count', siteOff.length, 1);
check('site off action', siteOff[0].action.type, 'allowAllRequests');

/* 6. site with all network toggles off becomes an allow rule */
const siteCustom = buildSessionRules(base, {
  'calm.example': { blocker: { enabled: true, mode: 'custom', toggles: { ads: false, trackers: false, popups: true, cosmetic: true, annoyances: false } } }
});
check('custom no-network -> allow rule', siteCustom.length, 1);
check('custom no-network action', siteCustom[0].action.type, 'allowAllRequests');

/* 7. site still wanting network blocking gets no allow rule */
const siteStillOn = buildSessionRules(base, {
  'busy.example': { blocker: { enabled: true, mode: 'custom', toggles: { ads: true, trackers: false, popups: true, cosmetic: true, annoyances: false } } }
});
check('custom with ads on -> no allow rule', siteStillOn.length, 0);

/* 8. strict mode adds initiator-scoped rules */
const strict = validate('strict', buildSessionRules(base, { 'hard.example': { blocker: { enabled: true, mode: 'strict' } } }));
check('strict produced rules', strict.length > 0, true);
check('strict all scoped to the site', strict.every((r) => r.condition.initiatorDomains?.[0] === 'hard.example'), true);
check('strict does not leak', strict.some((r) => r.condition.initiatorDomains?.includes('other.example')), false);
const thirdPartyRule = strict.find((r) => r.condition.domainType === 'thirdParty');
check('strict has third-party frame rule', Boolean(thirdPartyRule), true);
check('strict third-party targets sub_frame', thirdPartyRule.condition.resourceTypes, ['sub_frame']);

/* 9. strict site that is whitelisted produces nothing */
const strictWhitelisted = buildSessionRules({ ...base, whitelist: ['hard.example'] }, { 'hard.example': { blocker: { enabled: true, mode: 'strict' } } });
check('whitelisted strict -> only allow rule', strictWhitelisted.length, 1);
check('whitelisted strict action', strictWhitelisted[0].action.type, 'allowAllRequests');

/* 10. custom rules */
const custom = validate('custom', buildSessionRules({
  ...base,
  customRules: ['||my-ad.example^', '@@||good.example^', '! comment', 'example.com##.ad', '/track\\d+/']
}, {}));
check('custom rule count (comments+cosmetic dropped)', custom.length, 3);
check('custom block priority', custom[0].priority, 700);
check('custom exception priority', custom[1].priority, 950);
check('custom exception action', custom[1].action.type, 'allow');
check('custom regex used', custom[2].condition.regexFilter, 'track\\d+');

/* 11. combined + id ranges never overlap */
const combined = validate('combined', buildSessionRules({
  ...base,
  whitelist: ['a.example', 'b.example'],
  blacklist: ['c.example'],
  customRules: ['||d.example^']
}, {
  'a.example': { blocker: { enabled: true, mode: 'strict' } },
  'e.example': { blocker: { enabled: true, mode: 'strict' } }
}));
const allowIds = combined.filter((r) => r.action.type === 'allowAllRequests').map((r) => r.id);
const blockIds = combined.filter((r) => r.condition.urlFilter === '||c.example^').map((r) => r.id);
check('allow ids inside range', allowIds.every((id) => id >= SESSION_RULE_RANGES.allow.start && id < SESSION_RULE_RANGES.allow.start + SESSION_RULE_RANGES.allow.size), true);
check('block ids inside range', blockIds.every((id) => id >= SESSION_RULE_RANGES.block.start && id < SESSION_RULE_RANGES.block.start + SESSION_RULE_RANGES.block.size), true);
check('strict only for non-whitelisted', combined.filter((r) => r.condition.initiatorDomains?.[0] === 'a.example').length, 0);
check('strict applied for e.example', combined.filter((r) => r.condition.initiatorDomains?.[0] === 'e.example').length > 0, true);

/* 12. no rules exceed the session budget */
check('total under session budget', combined.length < 5000, true);

/* 13. hostile input does not throw */
try {
  buildSessionRules({ ...base, whitelist: [null, '', '  ', 'https://x.com/a?b=1'], blacklist: [undefined] }, { '': {}, null: {} });
  pass++;
} catch (err) {
  fail++;
  console.log('FAIL hostile input threw:', err.message);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
