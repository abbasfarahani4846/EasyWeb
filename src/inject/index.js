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

import {
  profileForHost,
  endpointFor,
  deepPrune,
  looksLikeAdLabel
} from '../shared/inject-profiles.js';

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
export function youtubeSkipAds(state) {
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
