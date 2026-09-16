(() => {
// --- Module: shared/domain.js ---
/**
 * Domain & URL Parsing Utilities
 */

/**
 * Extract clean hostname from URL or hostname string (e.g., "gemini.google.com", "chatgpt.com").
 * Strips leading/trailing dots and "www." prefix while preserving specific subdomains.
 */
function cleanHostname(input = '') {
  try {
    const raw = String(input || '').includes('://') ? new URL(input).hostname : input;
    return String(raw || '').replace(/^\.+|\.+$/g, '').toLowerCase().replace(/^www\./, '');
  } catch (_) {
    return String(input || '').replace(/^\.+|\.+$/g, '').toLowerCase().replace(/^www\./, '');
  }
}

/**
 * Extract hostname from any URL string cleanly
 */
function hostnameFromUrl(url = '') {
  return cleanHostname(url);
}

/**
 * Normalise any host / URL input down to a bare comparable hostname:
 * strips the scheme, path, query, port, leading "www." and surrounding dots.
 *
 * Lives here rather than in adblock.js so that dependency-free consumers — the
 * MAIN-world scriptlet bundle in particular — can use it without pulling the
 * entire filter catalogue into the page.
 */
function normalizeHost(input = '') {
  try {
    let raw = String(input || '').trim();
    if (raw.includes('://')) raw = new URL(raw).hostname;
    else raw = raw.split('/')[0].split('?')[0].split('#')[0];
    raw = raw.replace(/:\d+$/, '');
    return raw.replace(/^\.+|\.+$/g, '').toLowerCase().replace(/^www\./, '');
  } catch (_) {
    return String(input || '').trim().toLowerCase().replace(/^www\./, '');
  }
}

// --- Module: shared/inject-profiles.js ---
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

/**
 * Fields the YouTube player reads to decide whether to play an advert.
 * Deleting them from the player response means there is no advert to schedule.
 */
const YOUTUBE_PLAYER_AD_KEYS = [
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
const YOUTUBE_FEED_AD_KEYS = [
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
const YOUTUBE_GLOBALS = [
  { name: 'ytInitialPlayerResponse', keys: YOUTUBE_PLAYER_AD_KEYS },
  { name: 'ytInitialData', keys: YOUTUBE_FEED_AD_KEYS }
];

/** Localised now-playing labels Spotify uses while an advert is playing. */
const SPOTIFY_AD_LABELS = [
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
const INJECT_PROFILES = [
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
function profileForHost(host, profiles = INJECT_PROFILES) {
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
function endpointFor(profile, url) {
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
function deepPrune(value, keys, { maxDepth = 14, maxNodes = 40000 } = {}) {
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
function looksLikeAdLabel(text, labels = SPOTIFY_AD_LABELS) {
  const value = String(text || '').trim().toLowerCase();
  if (!value || value.length > 40) return false;
  return labels.some((label) => value === label || value.startsWith(`${label} `) || value.startsWith(`${label}-`));
}

/** Collect every cosmetic selector contributed by the profiles. */
function profileSelectors(profiles = INJECT_PROFILES) {
  const out = new Set();
  for (const profile of profiles) {
    for (const selector of profile.selectors || []) out.add(selector);
  }
  return [...out];
}

// --- Module: inject/index.js ---
/**
 * EasyWeb Ad Blocker — MAIN-world scriptlet engine
 *
 * This bundle runs inside the page's own JavaScript context at document_start,
 * which is the only place where it can remove advertising from the data a player
 * is about to read. The isolated content-script world cannot do this: it can
 * touch the DOM but it cannot patch `window.fetch` in a way the page's own code
 * would ever see.
 *
 * No `chrome.*` API is available here, so configuration arrives over
 * `window.postMessage` from the isolated guard, and everything else is decided
 * locally from `location.hostname`.
 *
 * What it does:
 *   1. fetch / XMLHttpRequest response interception — decode the JSON the player
 *      is about to consume and delete the advertising fields from it.
 *   2. Property traps — the same treatment for globals the page assigns to
 *      itself from an inline script (e.g. `ytInitialPlayerResponse`).
 *   3. Per-site handlers — playback-level fallbacks for adverts that are already
 *      stitched into the media stream (skip and silence).
 */

const CONFIG_SOURCE = 'easyweb-isolated';
const CONFIG_TYPE = 'inject-config';

const host = typeof location !== 'undefined' ? location.hostname : '';
const profile = profileForHost(host);

if (profile) {
  const state = { enabled: true };

  installFetchGuard(state, profile);
  installXhrGuard(state, profile);
  installGlobalTraps(state, profile);

  for (const handler of profile.handlers || []) {
    if (handler === 'youtubeSkipAds') youtubeSkipAds(state);
    else if (handler === 'spotifySilenceAds') spotifySilenceAds(state);
  }

  listenForConfig(state);
}

/* ------------------------------------------------------------------ */
/* 1. fetch                                                            */
/* ------------------------------------------------------------------ */

function installFetchGuard(state, profile) {
  const nativeFetch = window.fetch;
  if (typeof nativeFetch !== 'function' || nativeFetch.__easywebPatched) return;

  const patched = async function (input, init) {
    const response = await nativeFetch.call(this, input, init);
    if (!state.enabled) return response;

    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const endpoint = endpointFor(profile, url);
    if (!endpoint) return response;

    try {
      const data = await response.clone().json();
      if (deepPrune(data, endpoint.keys) === 0) return response;

      // Rebuild with a minimal header set. Copying the original headers would
      // carry `content-encoding` over to a body that is no longer compressed,
      // which makes the browser fail to decode it.
      const headers = new Headers();
      const contentType = response.headers.get('content-type');
      if (contentType) headers.set('content-type', contentType);

      return new Response(JSON.stringify(data), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (_) {
      return response;
    }
  };

  patched.__easywebPatched = true;
  patched.__easywebNativeFetch = nativeFetch;
  try {
    window.fetch = patched;
  } catch (_) {}
}

/* ------------------------------------------------------------------ */
/* 2. XMLHttpRequest                                                   */
/* ------------------------------------------------------------------ */

function installXhrGuard(state, profile) {
  const proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
  if (!proto || proto.open.__easywebPatched) return;

  const nativeOpen = proto.open;
  const nativeSend = proto.send;

  const patchedOpen = function (method, url, ...rest) {
    try {
      this.__easywebUrl = String(url || '');
    } catch (_) {}
    return nativeOpen.call(this, method, url, ...rest);
  };
  patchedOpen.__easywebPatched = true;

  proto.open = patchedOpen;

  proto.send = function (...args) {
    try {
      const endpoint = state.enabled ? endpointFor(profile, this.__easywebUrl) : null;
      if (endpoint) {
        this.addEventListener('readystatechange', function () {
          if (this.readyState !== 4) return;
          try {
            const type = this.responseType;
            if (type && type !== 'json' && type !== 'text') return;
            const raw = type === 'json' ? this.response : this.responseText;
            const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (!data || typeof data !== 'object') return;
            if (deepPrune(data, endpoint.keys) === 0) return;

            const text = JSON.stringify(data);
            // Shadow the prototype getters with the rewritten payload.
            Object.defineProperty(this, 'responseText', { value: text, configurable: true });
            Object.defineProperty(this, 'response', {
              value: type === 'json' ? data : text,
              configurable: true
            });
          } catch (_) {}
        });
      }
    } catch (_) {}
    return nativeSend.apply(this, args);
  };
}

/* ------------------------------------------------------------------ */
/* 3. Globals assigned by inline page scripts                          */
/* ------------------------------------------------------------------ */

function installGlobalTraps(state, profile) {
  for (const entry of profile.globals || []) {
    try {
      let stored = window[entry.name];
      if (state.enabled && stored && typeof stored === 'object') {
        try {
          deepPrune(stored, entry.keys);
        } catch (_) {}
      }
      Object.defineProperty(window, entry.name, {
        configurable: true,
        enumerable: true,
        get() {
          return stored;
        },
        set(value) {
          try {
            if (state.enabled && value && typeof value === 'object') {
              deepPrune(value, entry.keys);
            }
          } catch (_) {}
          stored = value;
        }
      });
    } catch (_) {}
  }
}

/* ------------------------------------------------------------------ */
/* 4. Configuration from the isolated world                            */
/* ------------------------------------------------------------------ */

function listenForConfig(state) {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== CONFIG_SOURCE || data.type !== CONFIG_TYPE) return;
    if (typeof data.enabled === 'boolean') state.enabled = data.enabled;
  });
}

/* ------------------------------------------------------------------ */
/* 5. YouTube — adverts already stitched into the stream               */
/* ------------------------------------------------------------------ */

/**
 * Stripping `adPlacements` removes most YouTube advertising, but server-side ad
 * insertion still puts ad segments in the media stream itself. Those are handled
 * at playback level: seek past the segment, speed it up, and press the skip
 * button when the player offers one.
 */
function youtubeSkipAds(state) {
  const AD_CLASSES = ['ad-showing', 'ad-interrupting'];
  const SKIP_SELECTOR = '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-skip-button, button.ytp-ad-skip-button-modern, .ytp-ad-skip-button-slot button, .ytp-ad-skip-button-container button, .ytp-ad-overlay-close-button, button[id^="skip-button"]';

  let timer = null;
  let observed = null;
  let rateBefore = 1;
  let wasMuted = false;
  let isMutedByUs = false;
  let isSpedUpByUs = false;

  const player = () => document.querySelector('.html5-video-player');

  const isAdShowing = () => {
    const element = player();
    if (element && AD_CLASSES.some((name) => element.classList.contains(name))) return true;
    if (document.querySelector('.ytp-ad-player-overlay, .ytp-ad-player-overlay-layout, .ytp-ad-preview-container, .ytp-ad-text')) return true;
    const module = document.querySelector('.video-ads.ytp-ad-module');
    if (module && module.childElementCount > 0) return true;
    if (document.querySelector(SKIP_SELECTOR)) return true;
    return false;
  };

  const finish = () => {
    const element = player();
    const video = (element && element.querySelector('video')) || document.querySelector('video');
    if (video) {
      try {
        if (!isMutedByUs) {
          wasMuted = Boolean(video.muted);
          video.muted = true;
          isMutedByUs = true;
        }
        if (Number.isFinite(video.duration) && video.duration > 0.1) {
          video.currentTime = video.duration;
        } else {
          video.currentTime = 99999;
        }
        video.playbackRate = 16;
        isSpedUpByUs = true;
      } catch (_) {}
    }
    const skip = document.querySelector(SKIP_SELECTOR);
    if (skip) {
      try {
        skip.click();
      } catch (_) {}
    }

    // Neutralize YouTube anti-adblock enforcement modal if displayed
    const enforcement = document.querySelector('ytd-enforcement-message-view-model, tp-yt-paper-dialog:has(ytd-enforcement-message-view-model)');
    if (enforcement) {
      try {
        const dismiss = enforcement.querySelector('#dismiss-button, button');
        if (dismiss) dismiss.click();
        enforcement.remove();
        const backdrop = document.querySelector('tp-yt-iron-overlay-backdrop');
        if (backdrop) backdrop.remove();
        if (video && video.paused) video.play();
      } catch (_) {}
    }
  };

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    // ponytail: never touch playbackRate or mute unless we changed it during an ad
    if (!isMutedByUs && !isSpedUpByUs) return;

    const element = player();
    const video = (element && element.querySelector('video')) || document.querySelector('video');
    if (video) {
      try {
        if (isMutedByUs) {
          video.muted = wasMuted;
        }
        if (isSpedUpByUs) {
          video.playbackRate = (rateBefore > 0 && rateBefore <= 4) ? rateBefore : 1;
        }
      } catch (_) {}
    }
    isMutedByUs = false;
    isSpedUpByUs = false;
  };

  const sync = () => {
    if (!state.enabled || !isAdShowing()) {
      stop();
      return;
    }
    if (!timer) {
      const element = player();
      const video = (element && element.querySelector('video')) || document.querySelector('video');
      const currentRate = video ? video.playbackRate || 1 : 1;
      if (currentRate !== 16) rateBefore = currentRate;
      timer = setInterval(finish, 100);
    }
    finish();
  };

  const observer = new MutationObserver(sync);

  const attach = () => {
    const element = player();
    if (element && element !== observed) {
      observed = element;
      try {
        observer.observe(element, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
      } catch (_) {}
    }
    sync();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach, { once: true });
  } else {
    attach();
  }
  // YouTube is a single-page app and replaces the player element on navigation.
  setInterval(attach, 2000);
}

/* ------------------------------------------------------------------ */
/* 6. Spotify — adverts inserted server-side into the audio stream     */
/* ------------------------------------------------------------------ */

/**
 * The Spotify web player receives advert audio already mixed into the stream, so
 * there is nothing to strip from an API response. What a client-side extension
 * can do is silence it and try to move past it, which is what this does.
 */
function spotifySilenceAds(state) {
  let silenced = false;
  let wasMuted = false;
  let volumeBefore = 1;

  const media = () => document.querySelector('audio, video');

  const nowPlayingLabel = () => {
    const nodes = document.querySelectorAll(
      '[data-testid="context-item-info-title"], [data-testid="now-playing-widget"] a, [data-testid="nowplaying-track-link"]'
    );
    for (const node of nodes) {
      const text = (node.textContent || '').trim();
      if (text) return text;
    }
    return '';
  };

  const restore = () => {
    if (!silenced) return;
    silenced = false;
    const element = media();
    if (element) {
      try {
        element.muted = wasMuted;
        element.volume = volumeBefore;
      } catch (_) {}
    }
  };

  const silence = (element) => {
    silenced = true;
    wasMuted = element.muted;
    volumeBefore = element.volume;
    try {
      element.muted = true;
      element.volume = 0;
    } catch (_) {}
  };

  const sync = () => {
    if (!state.enabled) {
      restore();
      return;
    }
    const isAd = looksLikeAdLabel(nowPlayingLabel());
    const element = media();
    if (!element) return;

    if (isAd) {
      if (!silenced) {
        silence(element);
        const skip = document.querySelector('[data-testid="control-button-skip-forward"]');
        if (skip) {
          try {
            skip.click();
          } catch (_) {}
        }
      }
      return;
    }
    restore();
  };

  // A poll is used rather than a document-wide observer: Spotify mutates the DOM
  // constantly and the label only has to be noticed within a second.
  setInterval(sync, 700);
  sync();
}
})();
