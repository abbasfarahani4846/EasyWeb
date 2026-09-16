import {
  buildCosmeticCss,
  normalizePickedRule,
  normalizePickedRules,
  activePickedSelector,
  pickToggleValues,
  resolveToggles,
  DEFAULT_ADBLOCK,
  DEFAULT_BLOCKER,
  TOGGLE_KEYS,
  PICKED_MODES
} from '../src/shared/adblock.js';
import { mergeBlocker, mergeSite } from '../src/shared/models.js';

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; return; }
  fail++;
  console.log(`FAIL ${label}\n   expected ${e}\n   actual   ${a}`);
}

/* ---- the regression: `>` is a valid child combinator, not injection ---- */

const precise = 'div.ad-slot > ins.adsbygoogle';
const css = buildCosmeticCss({ picked: [{ selector: precise, mode: 'hide', enabled: true }] });
check('child combinator survives sanitising', css.includes(precise), true);
check('nth-of-type selector survives', buildCosmeticCss({
  picked: [{ selector: 'section:nth-of-type(3) > div.banner', mode: 'hide', enabled: true }]
}).includes('section:nth-of-type(3) > div.banner'), true);
check('attribute selector survives', buildCosmeticCss({
  picked: [{ selector: 'div[data-ad-slot="7"]', mode: 'hide', enabled: true }]
}).includes('div[data-ad-slot="7"]'), true);

/* ---- injection is still rejected ---- */

check('braces rejected', buildCosmeticCss({ customSelectors: ['.a{}body{display:block}'] }).includes('body{display:block}'), false);
check('semicolon rejected', buildCosmeticCss({ customSelectors: ['.a;color:red'] }).includes('color:red'), false);
check('less-than rejected', buildCosmeticCss({ customSelectors: ['.a<style>'] }).includes('.a<style>'), false);
check('comment opener rejected', buildCosmeticCss({ customSelectors: ['.a/*x*/'] }).includes('.a/*x*/'), false);

/* ---- picked rules reach the stylesheet ---- */

check('hide rule in css', buildCosmeticCss({ picked: [{ selector: '.sponsored-box', mode: 'hide', enabled: true }] }).includes('.sponsored-box'), true);
check('remove rule also gets css', buildCosmeticCss({ picked: [{ selector: '.ad-wrap', mode: 'remove', enabled: true }] }).includes('.ad-wrap'), true);
check('disabled rule omitted', buildCosmeticCss({ picked: [{ selector: '.gone', mode: 'hide', enabled: false }] }).includes('.gone'), false);
check('empty picked list is safe', buildCosmeticCss({ picked: [] }).includes('display: none'), true);
check('null picked is safe', buildCosmeticCss({ picked: undefined }).includes('display: none'), true);

/* ---- broad vs precise ---- */

const withBroad = normalizePickedRule({ selector: '#ad-1', broad: '.ad-container', label: 'ins#ad-1', mode: 'hide' });
check('prefers precise by default', activePickedSelector(withBroad), '#ad-1');
check('switches to broad when asked', activePickedSelector({ ...withBroad, useBroad: true }), '.ad-container');
check('broad used in css', buildCosmeticCss({ picked: [{ ...withBroad, useBroad: true }] }).includes('.ad-container'), true);
check('precise used in css by default', buildCosmeticCss({ picked: [withBroad] }).includes('#ad-1'), true);
check('useBroad ignored without a broad selector', activePickedSelector({ selector: '#x', broad: '', useBroad: true }), '#x');

/* ---- normalisation ---- */

check('defaults to hide mode', normalizePickedRule({ selector: '.x' }).mode, 'hide');
check('remove mode kept', normalizePickedRule({ selector: '.x', mode: 'remove' }).mode, 'remove');
check('unknown mode falls back to hide', normalizePickedRule({ selector: '.x', mode: 'explode' }).mode, 'hide');
check('enabled defaults true', normalizePickedRule({ selector: '.x' }).enabled, true);
check('enabled false kept', normalizePickedRule({ selector: '.x', enabled: false }).enabled, false);
check('id is generated', typeof normalizePickedRule({ selector: '.x' }).id, 'string');
check('id is preserved', normalizePickedRule({ selector: '.x', id: 'p42' }).id, 'p42');
check('missing selector rejected', normalizePickedRule({}), null);
check('blank selector rejected', normalizePickedRule({ selector: '   ' }), null);
check('non-object rejected', normalizePickedRule('nope'), null);
check('label falls back to selector', normalizePickedRule({ selector: '.x' }).label, '.x');
check('label is truncated', normalizePickedRule({ selector: '.x', label: 'y'.repeat(200) }).label.length, 80);
check('useBroad requires a broad selector', normalizePickedRule({ selector: '.x', broad: '', useBroad: true }).useBroad, false);

check('list drops invalid entries', normalizePickedRules([{ selector: '.a' }, {}, null, 'x']).length, 1);
check('list dedupes by selector', normalizePickedRules([{ selector: '.a' }, { selector: '.a', mode: 'remove' }]).length, 1);
check('list caps at 300', normalizePickedRules(
  Array.from({ length: 400 }, (_, i) => ({ selector: `.ad-${i}` }))
).length, 300);
check('list tolerates a non-array', normalizePickedRules(undefined), []);

/* ---- storage round-trip ---- */

check('default blocker has picked', DEFAULT_BLOCKER.picked, []);
check('mergeBlocker keeps picked', mergeBlocker({ picked: [{ selector: '.a', mode: 'remove' }] }).picked.length, 1);
check('mergeBlocker normalises picked', mergeBlocker({ picked: [{ selector: '.a', mode: 'remove' }] }).picked[0].mode, 'remove');
check('mergeBlocker drops junk picked', mergeBlocker({ picked: [null, {}] }).picked, []);
check('mergeBlocker with no picked', mergeBlocker({ mode: 'strict' }).picked, []);

const site = mergeSite({ blocker: { picked: [{ selector: '.ad', broad: '.ad-wrap', mode: 'remove' }] } });
check('mergeSite keeps picked', site.blocker.picked.length, 1);
check('mergeSite keeps mode', site.blocker.picked[0].mode, 'remove');
check('mergeSite keeps broad', site.blocker.picked[0].broad, '.ad-wrap');

/* ---- toggle values must not leak bookkeeping fields ---- */

const resolved = resolveToggles(DEFAULT_ADBLOCK, null, 'example.com');
check('resolveToggles carries a reason', typeof resolved.reason, 'string');
check('pickToggleValues strips reason', Object.keys(pickToggleValues(resolved)).sort(), [...TOGGLE_KEYS].sort());
check('pickToggleValues is boolean-only', pickToggleValues(resolved).ads, true);
check('pickToggleValues on undefined', pickToggleValues(undefined), {
  ads: false, trackers: false, popups: false, cosmetic: false, annoyances: false
});

// A site customised by the picker must resolve from the stored values alone.
const customSite = {
  blocker: { enabled: true, mode: 'custom', toggles: pickToggleValues(resolved), picked: [] }
};
const customResolved = resolveToggles(DEFAULT_ADBLOCK, customSite, 'example.com');
check('stored toggles round-trip', customResolved.cosmetic, true);
check('stored toggles reason', customResolved.reason, 'site-custom');
check('stored toggles contain no reason key',
  Object.prototype.hasOwnProperty.call(customSite.blocker.toggles, 'reason'), false);

/* ---- picking implies cosmetic filtering is on ---- */

const offToggles = pickToggleValues(resolveToggles(
  { ...DEFAULT_ADBLOCK, mode: 'custom', toggles: { ads: true, trackers: true, popups: true, cosmetic: false, annoyances: false } },
  null,
  'example.com'
));
check('cosmetic starts off', offToggles.cosmetic, false);
const afterPick = { ...offToggles, cosmetic: true };
const pickSite = { blocker: { enabled: true, mode: 'custom', toggles: afterPick, picked: [{ selector: '.ad' }] } };
check('picking turns cosmetic on', resolveToggles(DEFAULT_ADBLOCK, pickSite, 'example.com').cosmetic, true);
check('picking does not disturb other toggles', resolveToggles(DEFAULT_ADBLOCK, pickSite, 'example.com').popups, true);

/* ---- modes metadata ---- */

check('two picked modes', PICKED_MODES.map((m) => m.id), ['hide', 'remove']);
check('modes have names', PICKED_MODES.every((m) => Boolean(m.name)), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
