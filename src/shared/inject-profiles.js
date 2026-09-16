/**
 * EasyWeb Ad Blocker — First-party scriptlet profiles
 *
 * Why this exists: YouTube and Spotify serve their advertising from their own
 * domains, inside the same API responses and media streams as the real content.
 * No amount of host blocking can touch that — the ad request is a first-party
 * request to the site you are already on.
 *
 * The only workable approach is the one uBlock Origin uses: run a small script
 * inside the page's own JavaScript context, before the player code does, and
 * remove the advertising from the data the player is about to read.
 *
 * This module is pure data plus pure helpers so it can be unit tested.
 */

import { normalizeHost } from './domain.js';

/**
 * Fields the YouTube player reads to decide whether to play an advert.
 * Deleting them from the player response means there is no advert to schedule.
 */
export const YOUTUBE_PLAYER_AD_KEYS = [
  'adPlacements',
  'playerAds',
  'adSlots',
  'adBreakHeartbeatParams',
  'adBreakServiceRenderer',
  'playerLegacyDesktopWatchAdsRenderer',
  'adBreakParams',
  'adBreakRenderer',
  'adPlacementRenderer',
  'adBreakService',
  'adSafety',
  'adLayoutLoggingData',
  'instreamAdPlayerOverlayRenderer'
];

/**
 * Feed / search responses carry promoted cards as single-key wrapper objects,
 * e.g. `{ promotedSparklesWebRenderer: { ... } }` inside `contents`.
 */
export const YOUTUBE_FEED_AD_KEYS = [
  'adSlotRenderer',
  'displayAdRenderer',
  'promotedSparklesWebRenderer',
  'promotedSparklesTextSearchRenderer',
  'promotedVideoRenderer',
  'compactPromotedVideoRenderer',
  'searchPyvRenderer',
  'adLayoutLoggingData',
  'adsEngagementPanelContentRenderer',
  'brandVideoShelfRenderer',
  'brandVideoSingletonRenderer',
  'inFeedAdLayoutRenderer',
  'adThumbnailOverlayViewModel',
  'primetimePromoRenderer'
];

/** Globals the page sets before the player reads them. */
export const YOUTUBE_GLOBALS = [
  { name: 'ytInitialPlayerResponse', keys: YOUTUBE_PLAYER_AD_KEYS },
  { name: 'ytInitialData', keys: YOUTUBE_FEED_AD_KEYS }
];

/** Localised now-playing labels Spotify uses while an advert is playing. */
export const SPOTIFY_AD_LABELS = [
  'advertisement',
  'advert',
  'advertising',
  'sponsored',
  'publicidad',
  'anuncio',
  'werbung',
  'anzeige',
  'publicité',
  'annonce',
  'реклама',
  'تبلیغ',
  'إعلان',
  'إشهار',
  '広告',
  '광고'
];

/** Hosts each profile applies to. */
export const INJECT_PROFILES = [
  {
    id: 'youtube',
    hosts: [
      'youtube.com',
      'youtube-nocookie.com',
      'youtubekids.com',
      'youtubeeducation.com'
    ],
    endpoints: [
      { match: '/youtubei/v1/player', keys: YOUTUBE_PLAYER_AD_KEYS },
      { match: '/youtubei/v1/next', keys: YOUTUBE_FEED_AD_KEYS },
      { match: '/youtubei/v1/browse', keys: YOUTUBE_FEED_AD_KEYS },
      { match: '/youtubei/v1/search', keys: YOUTUBE_FEED_AD_KEYS },
      { match: '/youtubei/v1/guide', keys: YOUTUBE_FEED_AD_KEYS },
      { match: '/youtubei/v1/reel/reel_item_watch', keys: YOUTUBE_PLAYER_AD_KEYS }
    ],
    globals: YOUTUBE_GLOBALS,
    handlers: ['youtubeSkipAds'],
    /** Cosmetic selectors specific to this site. */
    selectors: [
      '.ytp-ad-overlay-container',
      '.ytp-ad-overlay-slot',
      '.ytp-ad-text-overlay',
      '.ytp-ad-image-overlay',
      '.ytp-featured-product',
      '.ytp-suggested-action',
      '.ytp-ad-progress-list',
      '.ytp-ad-player-overlay-layout',
      '.ytp-ad-player-overlay',
      '.ytp-ad-preview-container',
      '.ytp-ad-message-container',
      '#player-ads',
      '#masthead-ad',
      'ytd-display-ad-renderer',
      'ytd-promoted-sparkles-web-renderer',
      'ytd-promoted-video-renderer',
      'ytd-in-feed-ad-layout-renderer',
      'ytd-ad-slot-renderer',
      'ytd-banner-promo-renderer',
      'ytd-statement-banner-renderer',
      'ytd-action-companion-ad-renderer',
      'ytd-companion-slot-renderer',
      'ytd-ad-hover-text-button-renderer',
      'ytd-rich-item-renderer:has(ytd-ad-slot-renderer)',
      'ytd-rich-item-renderer:has(ytd-in-feed-ad-layout-renderer)',
      'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]',
      'ytd-enforcement-message-view-model',
      'tp-yt-paper-dialog:has(ytd-enforcement-message-view-model)',
      'ytm-promoted-sparkles-web-renderer',
      'ytmusic-mealbar-promo-renderer',
      'ytmusic-statement-banner-renderer'
    ]
  },
  {
    id: 'spotify',
    hosts: ['spotify.com', 'open.spotify.com'],
    endpoints: [],
    globals: [],
    handlers: ['spotifySilenceAds'],
    selectors: [
      '[data-testid="ad-banner"]',
      '[data-testid="hpto-ad"]',
      '.ad-banner-container'
    ]
  }
];

/** Find the profile that applies to a hostname (subdomains included). */
export function profileForHost(host, profiles = INJECT_PROFILES) {
  const target = normalizeHost(host);
  if (!target) return null;
  for (const profile of profiles) {
    for (const candidate of profile.hosts) {
      const base = normalizeHost(candidate);
      if (!base) continue;
      if (target === base || target.endsWith(`.${base}`)) return profile;
    }
  }
  return null;
}

/** Find the endpoint rule for a request URL, if the profile cares about it. */
export function endpointFor(profile, url) {
  if (!profile?.endpoints?.length) return null;
  const value = String(url || '');
  if (!value) return null;
  for (const endpoint of profile.endpoints) {
    if (value.includes(endpoint.match)) return endpoint;
  }
  return null;
}

/**
 * Recursively delete advertising keys from a decoded JSON response.
 *
 * Handles both shapes:
 *   • a named field, e.g. `adPlacements` on the player response;
 *   • a single-key wrapper inside an array, e.g.
 *     `[{ promotedSparklesWebRenderer: {…} }]` in a feed response, where the
 *     whole entry has to go rather than just the key.
 *
 * @returns {number} how many entries were removed
 */
export function deepPrune(value, keys, { maxDepth = 14, maxNodes = 40000 } = {}) {
  const keySet = keys instanceof Set ? keys : new Set(keys || []);
  if (!keySet.size || !value || typeof value !== 'object') return 0;

  let removed = 0;
  let visited = 0;
  const stack = [{ node: value, depth: 0 }];

  while (stack.length) {
    const { node, depth } = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (depth > maxDepth) continue;
    if (visited >= maxNodes) break;
    visited += 1;

    if (Array.isArray(node)) {
      for (let index = node.length - 1; index >= 0; index -= 1) {
        const child = node[index];
        if (child && typeof child === 'object' && !Array.isArray(child)) {
          const childKeys = Object.keys(child);
          // A one-key wrapper whose only key is an ad renderer is itself the ad.
          if (childKeys.length === 1 && keySet.has(childKeys[0])) {
            node.splice(index, 1);
            removed += 1;
            continue;
          }
        }
        stack.push({ node: child, depth: depth + 1 });
      }
      continue;
    }

    for (const key of Object.keys(node)) {
      if (keySet.has(key)) {
        delete node[key];
        removed += 1;
        continue;
      }
      stack.push({ node: node[key], depth: depth + 1 });
    }
  }

  return removed;
}

/** Does this now-playing label look like an advert? */
export function looksLikeAdLabel(text, labels = SPOTIFY_AD_LABELS) {
  const value = String(text || '').trim().toLowerCase();
  if (!value || value.length > 40) return false;
  return labels.some((label) => value === label || value.startsWith(`${label} `) || value.startsWith(`${label}-`));
}

/** Collect every cosmetic selector contributed by the profiles. */
export function profileSelectors(profiles = INJECT_PROFILES) {
  const out = new Set();
  for (const profile of profiles) {
    for (const selector of profile.selectors || []) out.add(selector);
  }
  return [...out];
}
