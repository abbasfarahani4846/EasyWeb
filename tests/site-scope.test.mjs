import { mergeSite, migrateSite, syncSiteEnabled } from '../src/shared/models.js';

let pass = 0;
let fail = 0;

function check(label, condition) {
  if (condition) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${label}`);
  }
}

// 1. mergeSite preserves element scope even when targets are not yet created
const merged1 = mergeSite({
  enabled: false,
  direction: { scope: 'element', enabled: true },
  font: { scope: 'element', enabled: true },
  translate: { scope: 'element', enabled: false },
  targets: []
});
check('mergeSite: direction.scope preserves element', merged1.direction.scope === 'element');
check('mergeSite: font.scope preserves element', merged1.font.scope === 'element');
check('mergeSite: translate.scope preserves element', merged1.translate.scope === 'element');
check('mergeSite: site.enabled stays false when targets are empty in element scope', merged1.enabled === false);

// 2. migrateSite preserves element scope without destructive overwrite
const site1 = migrateSite({
  enabled: false,
  direction: { scope: 'element', enabled: false },
  font: { scope: 'element', enabled: false },
  translate: { scope: 'element', enabled: false },
  targets: []
});
check('migrateSite: direction.scope preserves element', site1.direction.scope === 'element');
check('migrateSite: font.scope preserves element', site1.font.scope === 'element');
check('migrateSite: translate.scope preserves element', site1.translate.scope === 'element');

// 3. Element scope with valid targets preserves element scope and activates
const site2 = migrateSite({
  enabled: true,
  direction: { scope: 'element', enabled: true },
  font: { scope: 'element', enabled: true },
  targets: [
    { selector: '.chat', direction: { enabled: true }, font: { enabled: true } }
  ]
});
check('direction.scope preserved when direction target exists', site2.direction.scope === 'element');
check('font.scope preserved when font target exists', site2.font.scope === 'element');
check('site.enabled active with element target', site2.enabled === true);

// 4. syncSiteEnabled respects page scope enabled state
site1.direction.scope = 'page';
site1.direction.enabled = true;
syncSiteEnabled(site1);
check('site.enabled is true when page direction enabled', site1.enabled === true);

console.log(`site-scope tests: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
