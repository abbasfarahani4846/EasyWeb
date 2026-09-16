/**
 * Scriptlet engine tests.
 *
 * These cover the part that actually removes first-party advertising: matching a
 * site profile, deciding which API responses to rewrite, and deleting the ad
 * fields from the decoded JSON. The DOM/playback handlers are verified manually
 * in a browser; everything here is the pure logic underneath them.
 */

import {
  profileForHost,
  endpointFor,
  deepPrune,
  looksLikeAdLabel,
  profileSelectors,
  INJECT_PROFILES,
  YOUTUBE_PLAYER_AD_KEYS,
  YOUTUBE_FEED_AD_KEYS
} from '../src/shared/inject-profiles.js';

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; return; }
  fail++;
  console.log(`FAIL ${label}\n   expected ${e}\n   actual   ${a}`);
}

/* ------------------------------------------------------------------ */
/* Profile matching                                                    */
/* ------------------------------------------------------------------ */

check('youtube.com', profileForHost('youtube.com')?.id, 'youtube');
check('www.youtube.com', profileForHost('www.youtube.com')?.id, 'youtube');
check('m.youtube.com', profileForHost('m.youtube.com')?.id, 'youtube');
check('music.youtube.com', profileForHost('music.youtube.com')?.id, 'youtube');
check('youtube-nocookie.com', profileForHost('youtube-nocookie.com')?.id, 'youtube');
check('full url input', profileForHost('https://www.youtube.com/watch?v=abc')?.id, 'youtube');
check('spotify.com', profileForHost('spotify.com')?.id, 'spotify');
check('open.spotify.com', profileForHost('open.spotify.com')?.id, 'spotify');

check('unrelated host', profileForHost('example.com'), null);
check('empty host', profileForHost(''), null);
check('undefined host', profileForHost(undefined), null);
/* A lookalike domain must not be treated as YouTube. */
check('suffix attack rejected', profileForHost('youtube.com.evil.example'), null);
check('prefix attack rejected', profileForHost('notyoutube.com'), null);
check('subdomain of attacker rejected', profileForHost('youtube.com.evil.example'), null);

/* ------------------------------------------------------------------ */
/* Endpoint selection                                                  */
/* ------------------------------------------------------------------ */

const youtube = profileForHost('youtube.com');
const spotify = profileForHost('open.spotify.com');

check('player endpoint',
  endpointFor(youtube, 'https://www.youtube.com/youtubei/v1/player?key=x')?.match, '/youtubei/v1/player');
check('next endpoint',
  endpointFor(youtube, 'https://www.youtube.com/youtubei/v1/next')?.match, '/youtubei/v1/next');
check('browse endpoint',
  endpointFor(youtube, 'https://www.youtube.com/youtubei/v1/browse')?.match, '/youtubei/v1/browse');
check('unrelated endpoint', endpointFor(youtube, 'https://www.youtube.com/watch?v=abc'), null);
check('empty url', endpointFor(youtube, ''), null);
check('spotify has no endpoints', endpointFor(spotify, 'https://api.spotify.com/v1/me'), null);
check('null profile', endpointFor(null, 'https://x/youtubei/v1/player'), null);

/* ------------------------------------------------------------------ */
/* deepPrune                                                           */
/* ------------------------------------------------------------------ */

/* A realistic player response. */
const playerResponse = {
  playabilityStatus: { status: 'OK' },
  streamingData: { adaptiveFormats: [{ itag: 137 }, { itag: 251 }] },
  adPlacements: [{ adPlacementRenderer: { renderer: {} } }],
  playerAds: [{ playerLegacyDesktopWatchAdsRenderer: {} }],
  adSlots: [{ adSlotRenderer: {} }],
  adBreakHeartbeatParams: 'abc123',
  videoDetails: { videoId: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up' }
};

const removed = deepPrune(playerResponse, YOUTUBE_PLAYER_AD_KEYS);
check('removed four ad fields', removed, 4);
check('adPlacements gone', 'adPlacements' in playerResponse, false);
check('playerAds gone', 'playerAds' in playerResponse, false);
check('adSlots gone', 'adSlots' in playerResponse, false);
check('adBreakHeartbeatParams gone', 'adBreakHeartbeatParams' in playerResponse, false);
check('playabilityStatus kept', playerResponse.playabilityStatus.status, 'OK');
check('videoDetails kept', playerResponse.videoDetails.videoId, 'dQw4w9WgXcQ');
check('streamingData kept', playerResponse.streamingData.adaptiveFormats.length, 2);

/* A feed response: ad entries are single-key wrappers inside arrays. */
const feed = {
  contents: [
    { videoRenderer: { videoId: 'a' } },
    { promotedSparklesWebRenderer: { title: 'Buy this' } },
    { videoRenderer: { videoId: 'b' } },
    { adSlotRenderer: { slot: 1 } }
  ]
};
const feedRemoved = deepPrune(feed, YOUTUBE_FEED_AD_KEYS);
check('removed two feed ad entries', feedRemoved, 2);
check('feed keeps real videos', feed.contents.length, 2);
check('feed keeps first video', feed.contents[0].videoRenderer.videoId, 'a');
check('feed keeps second video', feed.contents[1].videoRenderer.videoId, 'b');

/* Nested deeper inside the tree. */
const nested = {
  a: { b: { contents: [{ displayAdRenderer: { x: 1 } }, { otherRenderer: { y: 2 } }] } }
};
check('removes a nested ad entry', deepPrune(nested, YOUTUBE_FEED_AD_KEYS), 1);
check('nested real content survives', nested.a.b.contents.length, 1);
check('nested real content intact', nested.a.b.contents[0].otherRenderer.y, 2);

/* An object that merely *contains* an ad key among others is not itself an ad. */
const mixed = { contents: [{ wrapper: { adSlotRenderer: {}, keep: true } }] };
check('multi-key wrapper is not deleted as a whole', deepPrune(mixed, YOUTUBE_FEED_AD_KEYS), 1);
check('wrapper survives', mixed.contents.length, 1);
check('its ad key is deleted', 'adSlotRenderer' in mixed.contents[0].wrapper, false);
check('its other key survives', mixed.contents[0].wrapper.keep, true);

/* Nothing to do. */
check('clean object returns 0', deepPrune({ a: 1 }, YOUTUBE_PLAYER_AD_KEYS), 0);
check('no keys returns 0', deepPrune({ a: 1 }, []), 0);
check('null returns 0', deepPrune(null, YOUTUBE_PLAYER_AD_KEYS), 0);
check('primitive returns 0', deepPrune('text', YOUTUBE_PLAYER_AD_KEYS), 0);
check('number returns 0', deepPrune(42, YOUTUBE_PLAYER_AD_KEYS), 0);
check('array root works', deepPrune([{ adPlacements: [] }], YOUTUBE_PLAYER_AD_KEYS), 1);

/* Accepts a Set as well as an array. */
const setTarget = { adPlacements: [] };
check('accepts a Set', deepPrune(setTarget, new Set(['adPlacements'])), 1);

/* Guards against pathological payloads. The ad key sits only at the bottom, so
   the depth cap is what decides whether it is ever reached. */
const deep = {};
let cursor = deep;
for (let i = 0; i < 9; i += 1) {
  cursor.next = {};
  cursor = cursor.next;
}
cursor.adPlacements = [];

check('depth cap stops before the bottom', deepPrune(deep, YOUTUBE_PLAYER_AD_KEYS, { maxDepth: 3 }), 0);
check('within the cap it is found', deepPrune(deep, YOUTUBE_PLAYER_AD_KEYS), 1);
check('the deep key really was removed', 'adPlacements' in cursor, false);

const wide = { items: [] };
for (let i = 0; i < 5000; i += 1) wide.items.push({ videoRenderer: { i } });
const before = Date.now();
deepPrune(wide, YOUTUBE_FEED_AD_KEYS, { maxNodes: 100 });
check('node budget keeps the work bounded', Date.now() - before < 500, true);
check('bounded run leaves the data valid', Array.isArray(wide.items), true);

/* ------------------------------------------------------------------ */
/* Spotify label detection                                             */
/* ------------------------------------------------------------------ */

check('English label', looksLikeAdLabel('Advertisement'), true);
check('lowercase', looksLikeAdLabel('advertisement'), true);
check('short form', looksLikeAdLabel('Advert'), true);
check('advertising', looksLikeAdLabel('Advertising'), true);
check('sponsored', looksLikeAdLabel('Sponsored'), true);
check('German', looksLikeAdLabel('Werbung'), true);
check('Spanish', looksLikeAdLabel('Publicidad'), true);
check('French', looksLikeAdLabel('Publicité'), true);
check('Persian', looksLikeAdLabel('تبلیغ'), true);
check('Arabic', looksLikeAdLabel('إعلان'), true);
check('with a suffix', looksLikeAdLabel('Advertisement · 30s'), true);

check('real song title', looksLikeAdLabel('Bohemian Rhapsody'), false);
check('artist name', looksLikeAdLabel('Queen'), false);
check('empty', looksLikeAdLabel(''), false);
check('undefined', looksLikeAdLabel(undefined), false);
check('long paragraph rejected', looksLikeAdLabel('a'.repeat(80)), false);
/* Must not fire on words that merely contain "ad". */
check('"Adaptive" is not an ad', looksLikeAdLabel('Adaptive'), false);
check('"Bad Guy" is not an ad', looksLikeAdLabel('Bad Guy'), false);
check('"Radio Ga Ga" is not an ad', looksLikeAdLabel('Radio Ga Ga'), false);

/* ------------------------------------------------------------------ */
/* Profile metadata                                                    */
/* ------------------------------------------------------------------ */

check('profiles have ids', INJECT_PROFILES.every((p) => Boolean(p.id)), true);
check('profiles have hosts', INJECT_PROFILES.every((p) => p.hosts.length > 0), true);
check('profiles have handlers', INJECT_PROFILES.every((p) => p.handlers.length > 0), true);
check('youtube profile has selectors', profileForHost('youtube.com').selectors.length > 0, true);
check('selectors are unique', new Set(profileSelectors()).size, profileSelectors().length);
check('youtube overlay selector present', profileSelectors().includes('.ytp-ad-overlay-container'), true);
check('youtube masthead selector present', profileSelectors().includes('#masthead-ad'), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
