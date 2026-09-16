import { looksLikeAdClass, usableClass } from '../src/content/features/picker.js';

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  if (actual === expected) { pass++; return; }
  fail++;
  console.log(`FAIL ${label}\n   expected ${expected}\n   actual   ${actual}`);
}

/* ---- classes that should be recognised as advertising ---- */

const adClasses = [
  'ad',
  'ads',
  'ad-container',
  'ad_container',
  'advert',
  'advertisement',
  'advertising',
  'ad-banner',
  'adsbygoogle',
  'google_ads',
  'google-ads-slot',
  'dfp-ad',
  'gpt-ad',
  'banner-ad',
  'sponsored',
  'sponsored-content',
  'sponsor-box',
  'promo',
  'promoted-post',
  'native-ad',
  'native_ad_slot',
  'taboola-widget',
  'outbrain-block',
  'mgid-widget',
  'interstitial-overlay'
];

for (const cls of adClasses) {
  check(`ad class: ${cls}`, looksLikeAdClass(cls), true);
}

/* ---- ordinary classes that must NOT be mistaken for ads ---- */

const normalClasses = [
  'container',
  'header',
  'sidebar',
  'content',
  'product-card',
  'read-more',
  'article-body',
  'nav-menu',
  'gradient',
  'broadcast',       // contains "ad" but not as a word
  'header-logo',     // contains "ad" inside "header"
  'download',        // contains "ad" inside "download"
  'upload',
  'thread',
  'shadow',
  'loading',
  'reading-list',
  'adaptive-grid',   // starts with "ad" but is not an ad
  'badge',
  'metadata'
];

for (const cls of normalClasses) {
  check(`normal class: ${cls}`, looksLikeAdClass(cls), false);
}

/* ---- usability filter ---- */

check('too short rejected', usableClass('ad'), false);
check('numeric prefix rejected', usableClass('123-ad'), false);
check('our own prefix rejected', usableClass('easyweb-runtime-style'), false);
check('colon rejected', usableClass('hover:bg-red'), false);
check('dot rejected', usableClass('w-1.5'), false);
check('generic rejected', usableClass('container'), false);
check('generic rejected (case)', usableClass('Container'), false);
check('too long rejected', usableClass('x'.repeat(65)), false);
check('good class accepted', usableClass('ad-slot'), true);
check('good class accepted 2', usableClass('sponsored-post'), true);
check('good class accepted 3', usableClass('my-custom-wrapper'), true);
check('empty rejected', usableClass(''), false);
check('undefined rejected', usableClass(undefined), false);
check('handles null safely', looksLikeAdClass(null), false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
