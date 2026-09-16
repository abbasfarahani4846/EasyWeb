import { evaluate } from '../src/background/popup-guard.js';
import { DEFAULT_ADBLOCK } from '../src/shared/adblock.js';

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  if (actual === expected) { pass++; return; }
  fail++;
  console.log(`FAIL ${label}\n   expected ${expected}\n   actual   ${actual}`);
}

const guard = { ...DEFAULT_ADBLOCK.popupGuard };
const src = 'stream-site.example';

const linkGesture = { href: 'https://news.example/story', hrefHost: 'news.example', isLink: true, onOverlay: false, onMedia: false, onPlayer: false };
const videoGesture = { href: '', hrefHost: '', isLink: false, onOverlay: false, onMedia: true, onPlayer: true };
const overlayGesture = { href: '', hrefHost: '', isLink: false, onOverlay: true, onMedia: true, onPlayer: true };
// The hostile case from video sites: the player control surface itself is an
// ordinary external <a href>, so a naive "gesture target matches" rule lets it
// through. onPlayer must win.
const playerLinkGesture = { href: 'https://rovno.xyz/?dzid=25484', hrefHost: 'rovno.xyz', isLink: true, onOverlay: false, onMedia: false, onPlayer: true };

/* --- the exact problem the user reported: click a video, a tab opens --- */
check('click video -> popup',
  evaluate({ sourceDomain: src, targetUrl: 'https://random-ads.example/landing', gesture: videoGesture, guard }).allow, false);
check('click video -> popup reason',
  evaluate({ sourceDomain: src, targetUrl: 'https://random-ads.example/landing', gesture: videoGesture, guard }).reason, 'media-popup');
check('player control wrapped in an external anchor is blocked',
  evaluate({ sourceDomain: src, targetUrl: 'https://rovno.xyz/?dzid=25484', gesture: playerLinkGesture, guard }).allow, false);
check('player control external-anchor reason',
  evaluate({ sourceDomain: src, targetUrl: 'https://rovno.xyz/?dzid=25484', gesture: playerLinkGesture, guard }).reason, 'media-popup');
check('unknown player destination is blocked before gesture-target allow',
  evaluate({ sourceDomain: src, targetUrl: 'https://new-unknown-click-host.example/x', gesture: { ...playerLinkGesture, href: 'https://new-unknown-click-host.example/x', hrefHost: 'new-unknown-click-host.example' }, guard }).allow, false);
check('click video -> known ad network',
  evaluate({ sourceDomain: src, targetUrl: 'https://ads.propellerads.com/x', gesture: videoGesture, guard }).allow, false);
check('click overlay -> popup',
  evaluate({ sourceDomain: src, targetUrl: 'https://scam.example/win', gesture: overlayGesture, guard }).allow, false);
check('click overlay reason',
  evaluate({ sourceDomain: src, targetUrl: 'https://scam.example/win', gesture: overlayGesture, guard }).reason, 'overlay-hijack');
check('auto popup with no gesture',
  evaluate({ sourceDomain: src, targetUrl: 'https://popads.net/x', gesture: null, guard }).allow, false);
check('auto popup reason',
  evaluate({ sourceDomain: src, targetUrl: 'https://popads.net/x', gesture: null, guard }).reason, 'no-gesture');

/* --- things that must keep working --- */
check('normal external link click',
  evaluate({ sourceDomain: src, targetUrl: 'https://news.example/story', gesture: linkGesture, guard }).allow, true);
check('normal link reason',
  evaluate({ sourceDomain: src, targetUrl: 'https://news.example/story', gesture: linkGesture, guard }).reason, 'gesture-target');
check('same-site popup',
  evaluate({ sourceDomain: src, targetUrl: 'https://player.stream-site.example/embed', gesture: videoGesture, guard }).allow, true);
check('oauth popup',
  evaluate({ sourceDomain: src, targetUrl: 'https://accounts.google.com/o/oauth2', gesture: videoGesture, guard }).allow, true);
check('oauth reason',
  evaluate({ sourceDomain: src, targetUrl: 'https://accounts.google.com/o/oauth2', gesture: videoGesture, guard }).reason, 'auth-flow');
check('custom allowed host',
  evaluate({ sourceDomain: src, targetUrl: 'https://idp.corp.example/login', gesture: videoGesture, guard: { ...guard, allowedHosts: ['idp.corp.example'] } }).allow, true);
check('about:blank window',
  evaluate({ sourceDomain: src, targetUrl: 'about:blank', gesture: videoGesture, guard }).allow, true);
check('blob url',
  evaluate({ sourceDomain: src, targetUrl: 'blob:https://stream-site.example/abc', gesture: videoGesture, guard }).allow, true);
check('empty host',
  evaluate({ sourceDomain: src, targetUrl: '', gesture: videoGesture, guard }).allow, true);
check('real link to a third party',
  evaluate({ sourceDomain: src, targetUrl: 'https://twitter.com/intent/tweet', gesture: linkGesture, guard }).allow, true);
check('subdomain of clicked host',
  evaluate({ sourceDomain: src, targetUrl: 'https://m.news.example/story', gesture: linkGesture, guard }).allow, true);

/* --- toggles --- */
check('blockWithoutGesture off -> auto popup allowed',
  evaluate({ sourceDomain: src, targetUrl: 'https://random.example/x', gesture: null, guard: { ...guard, blockWithoutGesture: false } }).allow, true);
check('blockThirdPartyPopup off -> link still allowed',
  evaluate({ sourceDomain: src, targetUrl: 'https://twitter.com/intent/tweet', gesture: linkGesture, guard: { ...guard, blockThirdPartyPopup: false } }).allow, true);
check('known ad host blocked regardless of thirdParty flag',
  evaluate({ sourceDomain: src, targetUrl: 'https://ads.exoclick.com/x', gesture: videoGesture, guard: { ...guard, blockThirdPartyPopup: false } }).allow, false);
check('overlay blocked regardless of thirdParty flag',
  evaluate({ sourceDomain: src, targetUrl: 'https://scam.example/win', gesture: overlayGesture, guard: { ...guard, blockThirdPartyPopup: false } }).allow, false);
check('media protection can be explicitly disabled for a site configuration',
  evaluate({ sourceDomain: src, targetUrl: 'https://rovno.xyz/?dzid=25484', gesture: playerLinkGesture, guard: { ...guard, blockFromMedia: false } }).allow, true);
check('normal non-media matching link remains allowed',
  evaluate({ sourceDomain: src, targetUrl: 'https://news.example/story', gesture: linkGesture, guard }).allow, true);
check('known ad host is blocked even when link target matches',
  evaluate({ sourceDomain: src, targetUrl: 'https://ads.exoclick.com/x', gesture: { href: 'https://ads.exoclick.com/x', hrefHost: 'ads.exoclick.com', isLink: true, onOverlay: false, onMedia: false, onPlayer: false }, guard }).reason, 'ad-host');

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
