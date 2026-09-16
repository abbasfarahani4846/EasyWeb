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

// --- Module: shared/adblock.js ---
/**
 * EasyWeb Ad Blocker — Shared Core
 * Mode presets, toggle resolution, domain-list matching, cosmetic filter
 * catalogues and custom-rule parsing. Safe to import from the background
 * worker, content script, popup and sidebar (no chrome.* access at load time).
 */

/** Storage keys owned by the blocker (kept separate from the layout/font map). */const ADBLOCK_STORAGE_KEY = 'adblock';const ADBLOCK_STATS_KEY = 'adblockStats';

/** Rule-set ids referenced by manifest.json -> declarative_net_request. */const RULESET_IDS = {
  ads: 'easyweb_ads',
  trackers: 'easyweb_trackers',
  popups: 'easyweb_popups',
  annoyances: 'easyweb_annoyances'
};

/** Every toggle the blocker understands, in UI order. */const TOGGLE_KEYS = ['ads', 'trackers', 'popups', 'cosmetic', 'annoyances'];const TOGGLE_META = {
  ads: {
    name: 'تبلیغات تصویری و ویدیویی',
    hint: 'بنرها، تبلیغات تصویری، پیش‌رول ویدیو و اسکریپت‌های تبلیغاتی شبکه‌ای',
    network: true
  },
  trackers: {
    name: 'ردیاب‌ها (Trackers)',
    hint: 'تحلیل‌گرها، پیکسل‌های ردیابی، تبلیغات رفتاری و ابزارهای اندازه‌گیری',
    network: true
  },
  popups: {
    name: 'محافظ تب و پاپ‌آپ',
    hint: 'جلوگیری از باز شدن خودکار تب جدید هنگام کلیک روی ویدیو و لینک‌ها',
    network: true
  },
  cosmetic: {
    name: 'پاک‌سازی تبلیغات متنی و بصری',
    hint: 'حذف و پنهان‌سازی عناصر تبلیغاتی، فضای خالی تبلیغ و پیام‌های مزاحم',
    network: false
  },
  annoyances: {
    name: 'مزاحمت‌ها (Annoyances)',
    hint: 'پیام «ادبلاکر خود را خاموش کنید»، ویجت‌های شبکه اجتماعی و بنر کوکی',
    network: true
  }
};

/** Preset toggle bundles: complete blocking or off. */const MODE_PRESETS = {
  default: { ads: true, trackers: true, popups: true, cosmetic: true, annoyances: true },
  strict: { ads: true, trackers: true, popups: true, cosmetic: true, annoyances: true },
  off: { ads: false, trackers: false, popups: false, cosmetic: false, annoyances: false }
};

/** Site-level mode ids. */const SITE_MODES = [
  { id: 'inherit', name: 'پیش‌فرض کلی', hint: 'همان تنظیمات سراسری اعمال شود' },
  { id: 'strict', name: 'کامل', hint: 'مسدودسازی تمام تبلیغات و مزاحمت‌ها' },
  { id: 'off', name: 'غیرفعال در این سایت', hint: 'هیچ چیزی مسدود نشود (لیست سفید)' }
];const DEFAULT_TOGGLES = { ...MODE_PRESETS.strict };

/** How a user-picked advertising section is neutralised. */const PICKED_MODES = [
  { id: 'hide', name: 'مخفی شود', hint: 'بخش دیده نمی‌شود ولی در صفحه باقی می‌ماند' },
  { id: 'remove', name: 'کامل حذف شود', hint: 'بخش از ساختار صفحه پاک می‌شود' }
];

/** Per-site blocker defaults (merged into DEFAULT_SITE by defaults.js). */const DEFAULT_BLOCKER = {
  enabled: true,
  mode: 'inherit',
  toggles: null,
  /** Sections the user picked by hand on this site. */
  picked: []
};

/** Global blocker defaults stored under the `adblock` storage key. */const DEFAULT_ADBLOCK = {
  enabled: true,
  mode: 'strict',
  toggles: { ...DEFAULT_TOGGLES },
  /** Domains where the blocker never runs. */
  whitelist: [],
  /** Domains the user explicitly wants blocked. */
  blacklist: [],
  /** Extra cosmetic CSS selectors appended to the built-in catalogue. */
  customSelectors: [],
  /** Extra network filters written in Adblock/uBlock syntax. */
  customRules: [],
  /** Popup guard tuning. */
  popupGuard: {
    enabled: true,
    blockWithoutGesture: true,
    blockThirdPartyPopup: true,
    /**
     * A player/seek/fullscreen click must never be used as a redirect button.
     * This remains on even if the destination is an unknown ad domain.
     */
    blockFromMedia: true,
    /** Hosts that may always open a popup (OAuth, payment, captcha). */
    allowedHosts: [
      'accounts.google.com',
      'accounts.youtube.com',
      'login.microsoftonline.com',
      'login.live.com',
      'github.com',
      'appleid.apple.com',
      'paypal.com',
      'checkout.stripe.com',
      'recaptcha.net',
      'hcaptcha.com'
    ]
  },
  /** Cosmetic engine tuning. */
  cosmetic: {
    hideAdFrames: true,
    collapseEmptySlots: true,
    neutralizeAntiAdblock: true
  },
  /**
   * Run the MAIN-world scriptlet engine. This is what removes first-party
   * advertising on YouTube and silences it on Spotify — sites whose adverts come
   * from their own domains and therefore cannot be blocked by host rules.
   */
  scriptlets: true,
  /** Show a small counter badge on the toolbar icon. */
  showBadge: true
};

/**
 * Hosts that are always allowed to open a new window/tab because they are
 * part of a legitimate sign-in, payment or captcha flow.
 */const AUTH_ALLOW_HOSTS = [
  'accounts.google.com',
  'accounts.youtube.com',
  'login.microsoftonline.com',
  'login.live.com',
  'login.yahoo.com',
  'appleid.apple.com',
  'github.com',
  'gitlab.com',
  'facebook.com',
  'web.facebook.com',
  'paypal.com',
  'checkout.stripe.com',
  'recaptcha.net',
  'hcaptcha.com',
  'cloudflare.com',
  'challenges.cloudflare.com',
  'id.atlassian.com',
  'auth0.com',
  'okta.com'
];

/** Resource types blocked by the network rule-sets. */const NETWORK_RESOURCE_TYPES = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'media',
  'websocket',
  'other'
];

/** Resource types used when blocking popup navigations. */const NAVIGATION_RESOURCE_TYPES = ['main_frame', 'sub_frame'];

/**
 * Hosts used by the content script for fast, synchronous click / popup
 * decisions. Kept intentionally compact — the authoritative network lists
 * live in src/rules/lists.js.
 */const AD_HOST_SUFFIXES = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adservice.google.com',
  'googletagservices.com',
  'googletagmanager.com',
  'adnxs.com',
  'adsrvr.org',
  'advertising.com',
  'amazon-adsystem.com',
  'criteo.com',
  'criteo.net',
  'outbrain.com',
  'taboola.com',
  'taboolanews.com',
  'zedo.com',
  'pubmatic.com',
  'rubiconproject.com',
  'openx.net',
  'smartadserver.com',
  'teads.tv',
  'sharethrough.com',
  'mgid.com',
  'revcontent.com',
  'propellerads.com',
  'popads.net',
  'popcash.net',
  'adcash.com',
  'exoclick.com',
  'juicyads.com',
  'trafficjunky.com',
  'onclickads.net',
  'clickadu.com',
  'adsterra.com',
  'hilltopads.net',
  'yandex.ru/ads',
  'an.yandex.ru',
  'bannersbroker.com',
  'adf.ly',
  'shorte.st',
  'linkvertise.com',
  'ouo.io',
  'adfoc.us',
  'bc.vc',
  'clk.sh',
  'ad-maven.com',
  'admaven.com',
  'syndication.exoclick.com',
  'realsrv.com',
  'tsyndicate.com',
  'trafficstars.com',
  'clickaine.com',
  'bidvertiser.com',
  'adplugg.com',
  'adroll.com',
  'yieldmo.com',
  'spotxchange.com',
  'connatix.com',
  'primis.tech',
  'unrulymedia.com',
  'vidazoo.com',
  'anyclip.com',
  'districtm.io',
  'sonobi.com',
  'lijit.com',
  'sovrn.com',
  'gumgum.com',
  'indexww.com',
  '33across.com',
  'triplelift.com',
  'rhythmone.com',
  'adcolony.com',
  'vungle.com',
  'chartboost.com',
  'applovin.com',
  'inmobi.com',
  'unityads.unity3d.com',
  'mopub.com',
  'startapp.com',
  'smaato.net',
  'adform.net',
  'flashtalking.com',
  'serving-sys.com',
  'mathtag.com',
  'turn.com',
  'tapad.com',
  'bluekai.com',
  'demdex.net',
  'krxd.net',
  'crwdcntrl.net',
  'exelator.com',
  'agkn.com',
  'ml314.com',
  'rlcdn.com',
  'matomo.cloud',
  'hotjar.com',
  'clarity.ms',
  'mouseflow.com',
  'luckyorange.com',
  'fullstory.com',
  'smartlook.com',
  'inspectlet.com',
  'crazyegg.com',
  'quantserve.com',
  'scorecardresearch.com',
  'newrelic.com',
  'bugsnag.com',
  'branch.io',
  'adjust.com',
  'appsflyer.com',
  'kochava.com',
  'mixpanel.com',
  'amplitude.com',
  'segment.io',
  'segment.com',
  'heapanalytics.com',
  'statcounter.com',
  'histats.com',
  'extremetracking.com',
  'sitemeter.com',
  'addthis.com',
  'sharethis.com',
  'disqus.com/embed',
  'zoominfo.com',
  'clearbit.com',
  'fullcontact.com',
  'pipl.com',
  'lusha.com',
  'hunter.io',
  'getkoala.com',
  'leadfeeder.com',
  'albacross.com',
  'visistat.com',
  'clicky.com',
  'gostats.com',
  'trackingclick.net',
  'tracking101.com',
  'adzerk.net',
  'admedia.com',
  'adbutler.com',
  'adition.com',
  'adtech.de',
  'adtechus.com',
  'adsafeprotected.com',
  'moatads.com',
  'iasds01.com',
  'doubleverify.com',
  'adlightning.com',
  'confiant-integrations.net',
  'coadvertise.com',
  'adpushup.com',
  'ezoic.net',
  'ezoic.com',
  'mediavine.com',
  'adthrive.com',
  'playwire.com',
  'monumetric.com',
  'snigelweb.com',
  'freestar.com',
  'sortable.com',
  'adplugg.com',
  'adnium.com',
  'trafficjunky.net',
  'adtng.com',
  'twinrdack.com',
  'tsyndicate.com',
  'phncdn.com/ads',
  'redtubepartners.com',
  'stripchat.com/ads',
  'bestcontentfood.top',
  'pushnotification.website',
  'onesignal.com',
  'pushengage.com',
  'izooto.com',
  'webpushr.com',
  'sendpulse.com',
  'cleverpush.com',
  'pushwoosh.com',
  'pushnami.com',
  'notifystatistics.com',
  'ntv.io',
  'nativeads.com',
  'adblade.com',
  'content.ad',
  'engageya.com',
  'dable.io',
  'plista.com',
  'ligatus.com',
  'adyoulike.com',
  'adpushup.net',
  'snapads.com',
  'widespace.com',
  'adkernel.com',
  'clickagy.com',
  'audiencenetwork.com',
  'bidswitch.net',
  'casalemedia.com',
  'contextweb.com',
  'emxdgt.com',
  'improvedigital.com',
  'loopme.me',
  'media.net',
  'nativo.com',
  'onetag-sys.com',
  'pubnative.net',
  'quantcast.com',
  'seedtag.com',
  'smadex.com',
  'stickyadstv.com',
  'tremorhub.com',
  'undertone.com',
  'videoamp.com',
  'yieldlab.net',
  'zemanta.com',

  // Iranian ad networks
  'yektanet.com',
  'ynr4.net',
  'ynr5.net',
  'yektasource.com',
  'mediaad.org',
  'sabavision.com',
  'najva.com',
  'kaprila.com',
  'daart.org',
  'daart.ir',
  'tavoos.net',
  'anjoman.org',
  'vatanclick.ir',
  'clickyab.com',
  'magnet.ir',
  'raykaad.com',

  // Aggressive pop-unders & ad networks
  'deloplen.com',
  'zeybuxah.com',
  'onclckpro.com',
  'highcpmgate.com',
  'highcpmrevenuenetwork.com',
  'profitablecpmrate.com',
  'asgardianm.com',
  'alwingulla.com',
  'whomeetoget.com',
  'syndication.exdynsrv.com'
];

/**
 * Generic cosmetic selectors that hide advertising containers and the empty
 * gaps they leave behind. Deliberately conservative: every entry targets an
 * ad-specific id/class/attribute rather than a layout pattern.
 */const BASE_COSMETIC_SELECTORS = [
  'ins.adsbygoogle',
  'iframe[src*="googlesyndication.com"]',
  'iframe[src*="doubleclick.net"]',
  'iframe[src*="adservice.google.com"]',
  'iframe[src*="adsystem"]',
  'iframe[src*="adnxs.com"]',
  'iframe[src*="criteo"]',
  'iframe[src*="taboola"]',
  'iframe[src*="outbrain"]',
  'iframe[src*="mgid.com"]',
  'iframe[src*="revcontent"]',
  'iframe[src*="propellerads"]',
  'iframe[src*="adsterra"]',
  'iframe[src*="clickadu"]',
  'iframe[src*="exoclick"]',
  'iframe[src*="popads"]',
  'iframe[src*="onclickads"]',
  'iframe[id*="google_ads_iframe"]',
  'iframe[name*="google_ads_iframe"]',
  'iframe[id^="aswift_"]',
  'iframe[title="3rd party ad content"]',
  'div[id^="google_ads_"]',
  'div[id^="div-gpt-ad"]',
  'div[class^="div-gpt-ad"]',
  'div[id*="gpt-passback"]',
  'div[data-ad-slot]',
  'div[data-ad-client]',
  'div[data-ad-unit]',
  'div[data-adunit]',
  'div[data-google-query-id]',
  '[data-ad-placement]',
  '[data-ad-position]',
  '[data-advertisement]',
  '[data-adserver]',
  '[data-adblock]',
  '[data-ad-slot]',
  '[data-ad-client]',
  '[data-adsbygoogle-status]',
  '.adsbygoogle',
  '.ad-slot',
  '.ad-unit',
  '.ad-container',
  '.ad-wrapper',
  '.ad-banner',
  '.ad-holder',
  '.ad-block',
  '.ad-box',
  '.ad-placeholder',
  '.advertisement',
  '.advertising-container',
  '.ads-container',
  '.ads-wrapper',
  '.adsbox',
  '.ad_holder',
  '.ad_banner',
  '.ad_slot',
  '.ad_leaderboard',
  '.ad-rectangle',
  '.banner-ad',
  '.banner_ad',
  '.leaderboard-ad',
  '.sponsored-content',
  '.sponsored-post',
  '.sponsored-article',
  '.sponsored-links',
  '.promoted-content',
  '.native-ad',
  '.nativead',
  '.outbrain-widget',
  '.taboola-widget',
  '.taboola-block',
  '.trc_related_container',
  '#ad-slot',
  '#ad-container',
  '#ad-wrapper',
  '#ad-banner',
  '#advertisement',
  '#advertising',
  '#ads-wrapper',
  '#google_ads_frame',
  '#google_ads_iframe',
  '#taboola-below-article-thumbnails',
  '#taboola-below-article-text-links',
  '#outbrain_widget_0',
  '#div-gpt-ad-',
  'amp-ad',
  'amp-embed[type="taboola"]',
  'amp-embed[type="outbrain"]',
  '[class^="ad-slot-"]',
  '[class^="advert-"]',
  '[class*="-ad-slot"]',
  '[class*="advertisement-"]',
  '[id^="ad-slot-"]',
  '[id^="advert-"]',
  '[id*="-advertisement"]',

  // Iranian ad widgets & containers
  '#pos-article-display-card',
  '.yn-item',
  '[id^="yn-"]',
  '[id^="yektanet-"]',
  '.mediaad-container',
  '[id^="mediaad-"]',
  '.sabavision-container',
  '[id^="sabavision-"]',
  '.kaprila-container',
  '[id^="kaprila-"]',
  '.najva-container',
  '[id^="najva-"]',
  '.tavoos-container'
];

/** Selectors used by the "annoyances" toggle. */const ANNOYANCE_SELECTORS = [
  '[class*="adblock-detected"]',
  '[class*="adblock-message"]',
  '[class*="adblock-notice"]',
  '[class*="adblock-warning"]',
  '[class*="adblocker-detected"]',
  '[id*="adblock-detected"]',
  '[id*="adblock-message"]',
  '.adblock-modal',
  '.adblock-overlay',
  '.antiadblock',
  '.anti-adblock',
  '.anti-adblocker',
  '#antiadblock',
  '[class*="please-disable"]',
  '[class*="disable-adblock"]',
  '[class*="turn-off-adblock"]',
  '.cookie-consent-banner',
  '.cookie-banner',
  '.cookie-notice',
  '.cookie-consent',
  '#cookie-consent',
  '#cookie-banner',
  '.gdpr-banner',
  '.gdpr-consent',
  '.cc-window',
  '#onetrust-banner-sdk',
  '.ot-sdk-container',
  '.fc-consent-root',
  '.social-share-bar',
  '.sticky-social',
  '.floating-social',
  '.newsletter-popup',
  '.subscribe-popup',
  '.push-notification-prompt',
  '[class*="push-notification-prompt"]'
];

/* ------------------------------------------------------------------ */
/* Domain matching                                                     */
/* ------------------------------------------------------------------ */

/** Normalise any hostname-ish input to a bare lowercase host. */
/**
 * Re-exported from domain.js so that lightweight consumers (the MAIN-world
 * scriptlet bundle) can import it without inlining this whole catalogue.
 * @see domain.js
 */
/**
 * Does `host` match a single list entry?
 * Supports `example.com` (domain + subdomains) and `*.example.com` (subdomains).
 */function hostMatchesEntry(host, entry) {
  const h = normalizeHost(host);
  let pattern = String(entry || '').trim().toLowerCase();
  if (!h || !pattern) return false;
  pattern = pattern.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^\.+|\.+$/g, '');
  if (!pattern) return false;
  if (pattern.startsWith('*.')) {
    const base = pattern.slice(2);
    return h === base || h.endsWith(`.${base}`);
  }
  return h === pattern || h.endsWith(`.${pattern}`);
}

/** Does `host` appear anywhere in a domain list? */function hostInList(host, list = []) {
  if (!host || !Array.isArray(list)) return false;
  return list.some((entry) => hostMatchesEntry(host, entry));
}

/** Does `host` match one of the known ad / popup network suffixes? */function isKnownAdHost(host, extra = []) {
  const h = normalizeHost(host);
  if (!h) return false;
  if (hostInList(h, extra)) return true;
  return AD_HOST_SUFFIXES.some((entry) => {
    if (entry.includes('/')) return h.endsWith(entry.split('/')[0]);
    return h === entry || h.endsWith(`.${entry}`);
  });
}

/** Is this host part of a legitimate auth / payment flow? */function isAuthHost(host, extraAllowed = []) {
  return hostInList(host, AUTH_ALLOW_HOSTS) || hostInList(host, extraAllowed);
}

/* ------------------------------------------------------------------ */
/* Toggle resolution                                                   */
/* ------------------------------------------------------------------ */

/**
 * Work out the toggles that actually apply to a site.
 * Precedence: global off > whitelist > site off > site custom > site mode > global mode.
 */function resolveToggles(globalConfig, site, host) {
  const config = { ...DEFAULT_ADBLOCK, ...(globalConfig || {}) };
  const allOff = { ...MODE_PRESETS.off };

  if (!config.enabled) return { ...allOff, reason: 'global-off' };
  if (hostInList(host, config.whitelist)) return { ...allOff, reason: 'whitelisted' };

  const blocker = site?.blocker;
  if (blocker && blocker.enabled === false) return { ...allOff, reason: 'site-off' };

  const mode = blocker?.mode || 'inherit';
  if (mode === 'off') return { ...allOff, reason: 'site-off' };
  if (mode === 'custom' && blocker?.toggles) {
    return { ...allOff, ...blocker.toggles, reason: 'site-custom' };
  }
  if (mode === 'default' || mode === 'strict') {
    return { ...MODE_PRESETS[mode], reason: 'site-mode' };
  }

  const globalMode = config.mode || 'default';
  if (globalMode === 'custom') {
    return { ...allOff, ...(config.toggles || {}), reason: 'global-custom' };
  }
  return { ...(MODE_PRESETS[globalMode] || MODE_PRESETS.default), reason: 'global-mode' };
}

/** True when *any* blocking is active for the site. */function isActiveForSite(globalConfig, site, host) {
  const toggles = resolveToggles(globalConfig, site, host);
  return TOGGLE_KEYS.some((key) => toggles[key]);
}

/**
 * Strip the bookkeeping fields off a resolved toggle object so it can be
 * stored back as an explicit per-site override.
 */function pickToggleValues(toggles) {
  const out = {};
  for (const key of TOGGLE_KEYS) out[key] = Boolean(toggles?.[key]);
  return out;
}

/** Human-readable explanation of the current site state, for the UI. */function describeSiteState(globalConfig, site, host) {
  const toggles = resolveToggles(globalConfig, site, host);
  switch (toggles.reason) {
    case 'global-off': return 'ادبلاکر سراسری خاموش است';
    case 'whitelisted': return 'این سایت در لیست سفید است';
    case 'site-off': return 'در این سایت غیرفعال است';
    case 'site-custom': return 'تنظیمات سفارشی این سایت';
    case 'site-mode': return 'حالت انتخابی این سایت';
    default: return 'حالت پیش‌فرض سراسری';
  }
}

/* ------------------------------------------------------------------ */
/* Cosmetic CSS                                                        */
/* ------------------------------------------------------------------ */

function sanitizeSelector(selector) {
  const value = String(selector || '').trim();
  if (!value) return '';
  // Reject anything that could escape the rule and inject extra declarations.
  // Note: `>` is deliberately allowed — it is a legitimate child combinator and
  // the picker generates selectors like `div.ad-slot > ins.adsbygoogle`.
  // (`<` cannot appear in a selector, and the stylesheet is written through
  // textContent, so it can never close the <style> element.)
  if (/[{}<;]/.test(value)) return '';
  if (value.includes('/*')) return '';
  return value;
}

/** The selector a picked rule currently resolves to (broad wins when selected). */function activePickedSelector(rule) {
  if (!rule) return '';
  if (rule.useBroad && rule.broad) return rule.broad;
  return rule.selector || '';
}

/** Normalise a user-picked "this section is an ad" rule. */function normalizePickedRule(rule) {
  if (!rule || typeof rule !== 'object') return null;
  const selector = String(rule.selector || '').trim();
  if (!selector) return null;
  const broad = String(rule.broad || '').trim();
  return {
    id: typeof rule.id === 'string' && rule.id ? rule.id : `p${Math.random().toString(36).slice(2, 8)}`,
    selector,
    broad,
    useBroad: Boolean(rule.useBroad) && Boolean(broad),
    label: String(rule.label || selector).slice(0, 80),
    mode: rule.mode === 'remove' ? 'remove' : 'hide',
    enabled: rule.enabled !== false
  };
}

/** Normalise a whole list, dropping entries that cannot be represented. */function normalizePickedRules(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of list) {
    const rule = normalizePickedRule(entry);
    if (!rule) continue;
    if (seen.has(rule.selector)) continue;
    seen.add(rule.selector);
    out.push(rule);
  }
  return out.slice(0, 300);
}

/** Build the `display:none` stylesheet from the selector catalogues. */function buildCosmeticCss({ customSelectors = [], includeAnnoyances = false, collapseEmptySlots = true, picked = [] } = {}) {
  const selectors = [...BASE_COSMETIC_SELECTORS];
  if (includeAnnoyances) selectors.push(...ANNOYANCE_SELECTORS);
  customSelectors.forEach((entry) => {
    const safe = sanitizeSelector(entry);
    if (safe) selectors.push(safe);
  });

  // User-picked sections. Both modes get the stylesheet treatment — it is the
  // cheapest first line of defence; "remove" additionally deletes the nodes.
  for (const rule of picked) {
    if (!rule || rule.enabled === false) continue;
    const safe = sanitizeSelector(activePickedSelector(rule));
    if (safe) selectors.push(safe);
  }

  const unique = [...new Set(selectors)];
  if (!unique.length) return '';

  const parts = [
    `${unique.join(',\n')} {\n  display: none !important;\n  visibility: hidden !important;\n  pointer-events: none !important;\n}`
  ];

  if (collapseEmptySlots) {
    parts.push(`iframe[width="1"][height="1"],\niframe[width="0"][height="0"],\nimg[width="1"][height="1"],\nimg[height="1"][width="1"] {\n  display: none !important;\n}`);
  }

  return parts.join('\n\n');
}

/** CSS applied to a hijack overlay while we keep the underlying player usable. */const OVERLAY_NEUTRALIZE_CSS = `
[data-easyweb-overlay-neutralized="true"] {
  pointer-events: none !important;
  cursor: default !important;
}
`;

/* ------------------------------------------------------------------ */
/* Custom rule parsing (Adblock / uBlock syntax subset)                */
/* ------------------------------------------------------------------ */

/**
 * Convert one user-written filter line into a declarativeNetRequest rule.
 * Supported: `||domain^`, plain substrings, `/regex/`, `*` wildcards and the
 * `@@` exception prefix (which becomes an allow rule).
 * Returns null when the line is a comment or cannot be represented.
 */function parseCustomRule(line) {
  const raw = String(line || '').trim();
  if (!raw || raw.startsWith('!') || raw.startsWith('#') || raw.startsWith('[')) return null;

  // Cosmetic rules are handled by the content script, not declarativeNetRequest.
  if (raw.includes('##') || raw.includes('#@#')) return null;

  let isException = false;
  let body = raw;

  if (body.startsWith('@@')) {
    isException = true;
    body = body.slice(2);
  }

  // Drop unsupported modifiers, keeping only the address part.
  const modifierIndex = body.search(/\$(?:~?[a-z-]+(?:=[^,]*)?)(?:,|$)/i);
  if (modifierIndex > 0) body = body.slice(0, modifierIndex);

  body = body.trim();
  if (!body) return null;

  const condition = { resourceTypes: NETWORK_RESOURCE_TYPES };
  let valid = true;

  if (body.startsWith('/') && body.endsWith('/') && body.length > 2) {
    // Regular expression filter — respected verbatim, exactly like uBlock.
    const regex = body.slice(1, -1);
    try {
      new RegExp(regex);
    } catch (_) {
      return null;
    }
    condition.regexFilter = regex;
  } else if (body.startsWith('||')) {
    // Domain anchor: keep the trailing separator so `||ads.example.com^` does
    // not also match `ads.example.com.evil.com`.
    const domain = body.slice(2).replace(/\|$/, '');
    if (!domain || domain === '^') valid = false;
    else condition.urlFilter = `||${domain}`;
  } else {
    const filter = body.replace(/^\|/, '').replace(/\|$/, '');
    if (!filter) valid = false;
    else condition.urlFilter = filter;
  }

  if (!valid) return null;

  return {
    action: { type: isException ? 'allow' : 'block' },
    condition,
    isException
  };
}

/** Parse a whole textarea of custom filters into DNR rule descriptors. */function parseCustomRules(lines = []) {
  return lines
    .map((line) => parseCustomRule(line))
    .filter(Boolean)
    .slice(0, 400);
}

/** Extract cosmetic-only rules (`##selector`) from a user filter list. */function extractCosmeticRules(lines = []) {
  return lines
    .map((line) => String(line || '').trim())
    .filter((line) => line.includes('##') && !line.startsWith('!'))
    .map((line) => sanitizeSelector(line.split('##').pop()))
    .filter(Boolean)
    .slice(0, 200);
}

/* ------------------------------------------------------------------ */
/* Statistics helpers                                                  */
/* ------------------------------------------------------------------ */

/** Merge two stat records without losing counters. */function mergeStats(base = {}, patch = {}) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(patch || {})) {
    merged[key] = (Number(merged[key]) || 0) + (Number(value) || 0);
  }
  return merged;
}

/** Compact display number (1.2k / 3.4M). */function formatCount(value) {
  const n = Number(value) || 0;
  if (n < 1000) return String(n);
  if (n < 1000000) return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`;
  return `${(n / 1000000).toFixed(1)}M`;
}

// --- Module: shared/defaults.js ---
/**
 * Shared Default Configurations and Font Definitions
 */
const DEFAULT_SITE = {
  enabled: false,
  direction: {
    enabled: false,
    value: 'rtl',
    scope: 'page',
    selector: '',
    label: ''
  },
  font: {
    enabled: false,
    scope: 'page',
    selector: '',
    label: '',
    family: "'Vazirmatn', 'Tahoma', sans-serif",
    size: 16,
    unit: 'px',
    lineHeight: '1.6',
    weight: '400',
    align: 'start'
  },
  translate: {
    enabled: false,
    scope: 'page',
    selector: '',
    label: '',
    targetLang: 'fa',
    engine: 'google',
    tone: 'standard',
    customPrompt: ''
  },
  blocker: { ...DEFAULT_BLOCKER },
  targets: []
};
const TRANSLATION_TONES = [
  { id: 'standard', name: 'روان و طبیعی (پیش‌فرض)' },
  { id: 'formal', name: 'رسمی و تخصصی' },
  { id: 'colloquial', name: 'صمیمی و محاوره‌ای' },
  { id: 'literal', name: 'کلمه‌به‌کلمه و دقیق' },
  { id: 'simplified', name: 'ساده‌سازی شده' },
  { id: 'custom', name: 'پرامپت سفارشی...' }
];
const SUPPORTED_LANGUAGES = [
  { code: 'fa', name: 'فارسی (Persian)' },
  { code: 'en', name: 'English' },
  { code: 'ar', name: 'العربية (Arabic)' },
  { code: 'fr', name: 'Français (French)' },
  { code: 'de', name: 'Deutsch (German)' },
  { code: 'es', name: 'Español (Spanish)' },
  { code: 'tr', name: 'Türkçe (Turkish)' },
  { code: 'ru', name: 'Русский (Russian)' },
  { code: 'zh', name: '中文 (Chinese)' },
  { code: 'ja', name: '日本語 (Japanese)' },
  { code: 'it', name: 'Italiano (Italian)' }
];
const DEFAULT_FONTS = [
  { name: 'Vazirmatn (فارسی)', family: "'Vazirmatn', 'Tahoma', sans-serif" },
  { name: 'Estedad (فارسی)', family: "'Estedad', 'Tahoma', sans-serif" },
  { name: 'Sahel (فارسی)', family: "'Sahel', 'Tahoma', sans-serif" },
  { name: 'Lalezar (فارسی)', family: "'Lalezar', 'Tahoma', sans-serif" }
];
const BUNDLED_FONTS = [
  { name: 'Vazirmatn', family: 'Vazirmatn', file: 'assets/fonts/Vazirmatn-Regular.woff2', format: 'woff2' },
  { name: 'Estedad', family: 'Estedad', file: 'assets/fonts/Estedad-Regular.woff2', format: 'woff2' },
  { name: 'Sahel', family: 'Sahel', file: 'assets/fonts/Sahel-Regular.woff2', format: 'woff2' },
  { name: 'Lalezar', family: 'Lalezar', file: 'assets/fonts/Lalezar-Regular.woff2', format: 'woff2' }
];
const DEFAULTS = {
  settings: {},
  fonts: [],
  bundledFonts: BUNDLED_FONTS,
  providers: [],
  customTools: [],
  chatHistory: {},
  detect: { threshold: 0.2, extraFonts: [] },
  adblock: DEFAULT_ADBLOCK,
  adblockStats: { total: 0, perDomain: {}, popups: 0, cosmetic: 0, since: 0 }
};

// --- Module: background/picker-bridge.js ---
/**
 * Element Picker Bridge for Background Service Worker
 */
const pickerResults = new Map();
function setPickerResult(tabId, result) {
  if (!tabId) return;
  pickerResults.set(tabId, result);
}
function popPickerResult(tabId) {
  if (!tabId) return null;
  const result = pickerResults.get(tabId) || null;
  pickerResults.delete(tabId);
  return result;
}

// --- Module: background/tab-context.js ---
/**
 * Tab and Context Management for Background Service Worker
 */
async function getStore() {
  return chrome.storage.local.get(DEFAULTS);
}
async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}
async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
async function getActiveTabContext() {
  const tab = await getActiveTab();
  if (!tab?.id) return { ok: false, error: 'No active tab.' };
  const store = await getStore();
  const domain = hostnameFromUrl(tab.url);
  return {
    ok: true,
    tab,
    domain,
    settings: store.settings[domain] || null
  };
}

// --- Module: shared/ai-providers.js ---
/**
 * Standard AI / LLM Provider Definitions & Endpoints
 */
const AI_PROVIDERS_CONFIG = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    authHeader: 'query', // key passed as query param ?key=...
    docUrl: 'https://aistudio.google.com/app/apikey',
    defaultModels: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', isFree: true },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', isFree: true },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', isFree: false }
    ]
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelsUrl: 'https://openrouter.ai/api/v1/models',
    authHeader: 'bearer',
    docUrl: 'https://openrouter.ai/keys',
    defaultModels: [
      { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (Free)', isFree: true },
      { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash Exp (Free)', isFree: true },
      { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Free)', isFree: true },
      { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B (Free)', isFree: true },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', isFree: false }
    ]
  },
  groq: {
    id: 'groq',
    name: 'Groq Cloud',
    baseUrl: 'https://api.groq.com/openai/v1',
    modelsUrl: 'https://api.groq.com/openai/v1/models',
    authHeader: 'bearer',
    docUrl: 'https://console.groq.com/keys',
    defaultModels: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile (Free tier)', isFree: true },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant (Free tier)', isFree: true },
      { id: 'gemma2-9b-it', name: 'Gemma 2 9B (Free tier)', isFree: true },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (Free tier)', isFree: true }
    ]
  },
  nvidia: {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    modelsUrl: 'https://integrate.api.nvidia.com/v1/models',
    authHeader: 'bearer',
    docUrl: 'https://build.nvidia.com',
    defaultModels: [
      { id: 'meta/llama-3.1-70b-instruct', name: 'Llama 3.1 70B Instruct', isFree: true },
      { id: 'meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B Instruct', isFree: true },
      { id: 'mistralai/mixtral-8x22b-instruct-v0.1', name: 'Mixtral 8x22B Instruct', isFree: true }
    ]
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    modelsUrl: 'https://api.openai.com/v1/models',
    authHeader: 'bearer',
    docUrl: 'https://platform.openai.com/api-keys',
    defaultModels: [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', isFree: false },
      { id: 'gpt-4o', name: 'GPT-4o', isFree: false },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', isFree: false }
    ]
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    modelsUrl: null,
    authHeader: 'x-api-key',
    docUrl: 'https://console.anthropic.com/settings/keys',
    defaultModels: [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', isFree: false },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', isFree: false }
    ]
  },
  custom: {
    id: 'custom',
    name: 'Custom / Ollama / Local',
    baseUrl: 'http://localhost:11434/v1',
    modelsUrl: 'http://localhost:11434/v1/models',
    authHeader: 'bearer',
    docUrl: 'https://ollama.com',
    defaultModels: [
      { id: 'llama3.2', name: 'Llama 3.2 (Local)', isFree: true },
      { id: 'qwen2.5', name: 'Qwen 2.5 (Local)', isFree: true },
      { id: 'mistral', name: 'Mistral (Local)', isFree: true }
    ]
  }
};

// --- Module: background/llm-client.js ---
/**
 * Universal LLM API Client & Model Discovery
 * Supports Google Gemini, OpenRouter, Groq, NVIDIA, OpenAI, Anthropic, and Ollama/Custom.
 */
async function fetchProviderModels(providerType, apiKey, customBaseUrl = '') {
  const config = AI_PROVIDERS_CONFIG[providerType] || AI_PROVIDERS_CONFIG.custom;
  const baseUrl = customBaseUrl.trim() || config.baseUrl;

  try {
    if (providerType === 'gemini') {
      const url = `${baseUrl}/models?key=${encodeURIComponent(apiKey.trim())}`;
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Gemini API HTTP ${res.status}`);
      }
      const data = await res.json();
      const rawModels = data.models || [];
      const models = rawModels
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => {
          const id = m.name.replace(/^models\//, '');
          const isFree = id.includes('flash') || id.includes('exp');
          return {
            id,
            name: m.displayName || id,
            description: m.description || '',
            isFree
          };
        });
      return { ok: true, models: models.length ? models : config.defaultModels };
    }

    if (providerType === 'anthropic') {
      // Anthropic does not have a public models list endpoint with simple key query; return standard list
      return { ok: true, models: config.defaultModels };
    }

    // OpenAI-compatible endpoints (OpenRouter, Groq, NVIDIA, OpenAI, Custom/Ollama)
    const modelsEndpoint = config.modelsUrl ? (customBaseUrl ? `${customBaseUrl}/models` : config.modelsUrl) : `${baseUrl}/models`;
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey?.trim()) {
      headers.Authorization = `Bearer ${apiKey.trim()}`;
    }

    const res = await fetch(modelsEndpoint, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API HTTP ${res.status}`);
    }
    const data = await res.json();
    const rawList = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];

    const models = rawList.map((m) => {
      const id = m.id || m.name;
      let isFree = false;
      if (providerType === 'openrouter') {
        isFree = id.endsWith(':free') || m.pricing?.prompt === '0' || Number(m.pricing?.prompt) === 0;
      } else if (providerType === 'groq' || providerType === 'custom') {
        isFree = true;
      }
      return {
        id,
        name: m.name || id,
        description: m.description || '',
        isFree
      };
    });

    return { ok: true, models: models.length ? models : config.defaultModels };
  } catch (error) {
    console.warn(`[Fetch Models Error ${providerType}]:`, error.message);
    return { ok: false, error: error.message, models: config.defaultModels };
  }
}
async function callLLM({ providerType, apiKey, baseUrl, model, prompt, systemPrompt = '' }) {
  const config = AI_PROVIDERS_CONFIG[providerType] || AI_PROVIDERS_CONFIG.custom;
  const endpointBase = (baseUrl || config.baseUrl).replace(/\/+$/, '');
  // ponytail: 35s timeout ceiling for chat completion requests
  const timeoutSignal = AbortSignal.timeout(35000);

  try {
    if (providerType === 'gemini') {
      const modelId = model || 'gemini-1.5-flash';
      const url = `${endpointBase}/models/${modelId}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
      const body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 }
      };
      if (systemPrompt) {
        body.systemInstruction = { parts: [{ text: systemPrompt }] };
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: timeoutSignal
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 524) throw new Error('Chat API timeout 524: server took too long to respond');
        throw new Error(err.error?.message || `Gemini API error ${res.status}`);
      }
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return { ok: true, text };
    }

    if (providerType === 'anthropic') {
      const modelId = model || 'claude-3-5-haiku-20241022';
      const url = `${endpointBase}/messages`;
      const body = {
        model: modelId,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }]
      };
      if (systemPrompt) body.system = systemPrompt;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey.trim(),
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body),
        signal: timeoutSignal
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 524) throw new Error('Chat API timeout 524: server took too long to respond');
        throw new Error(err.error?.message || `Anthropic error ${res.status}`);
      }
      const data = await res.json();
      const text = data.content?.[0]?.text || '';
      return { ok: true, text };
    }

    // OpenAI-compatible (OpenRouter, Groq, NVIDIA, OpenAI, Ollama)
    const modelId = model || (providerType === 'groq' ? 'llama-3.3-70b-versatile' : providerType === 'openrouter' ? 'meta-llama/llama-3.3-70b-instruct:free' : 'gpt-4o-mini');
    const url = `${endpointBase}/chat/completions`;
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey?.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
    if (providerType === 'openrouter') {
      headers['HTTP-Referer'] = 'https://easyweb.extension';
      headers['X-Title'] = 'EasyWeb Extension';
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelId,
        messages,
        temperature: 0.3
      }),
      signal: timeoutSignal
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 524) throw new Error('Chat API timeout 524: server took too long to respond');
      throw new Error(err.error?.message || `Chat API error ${res.status}`);
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    return { ok: true, text };
  } catch (error) {
    const isTimeout = error.name === 'TimeoutError' || error.name === 'AbortError';
    const msg = isTimeout ? 'Chat API request timed out (35s)' : error.message;
    console.warn(`[LLM Completion Error (${providerType})]:`, msg);
    return { ok: false, error: msg };
  }
}

// --- Module: background/translation-service.js ---
/**
 * Background Translation Service
 * Implements high-speed batch translation via Google Translate GTX API
 * and AI-driven translation using configured LLM providers.
 */

const translationCache = new Map();
const SEPARATOR = '\n====EW_SEP====\n';

/**
 * Translate a single chunk or joined text block via Google Translate GTX endpoint
 */
async function fetchGoogleTranslate(text, targetLang = 'fa') {
  if (!text || !text.trim()) return text;
  const cacheKey = `google:${targetLang}:${text}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Google Translate HTTP ${response.status}`);
    }
    const data = await response.json();
    let translated = '';
    if (Array.isArray(data?.[0])) {
      translated = data[0].map((item) => (Array.isArray(item) ? item[0] : '')).join('');
    } else {
      translated = text;
    }
    translationCache.set(cacheKey, translated);
    return translated;
  } catch (error) {
    console.warn('[EasyWeb Translation Error]:', error.message || error);
    return text;
  }
}

/**
 * Translate a batch using an active AI / LLM Provider with chunking and graceful fallback
 */
async function translateWithAI(texts = [], targetLang = 'fa', tone = 'standard', customPrompt = '') {
  if (!Array.isArray(texts) || !texts.length) return [];

  const store = await chrome.storage.local.get({ providers: [], activeProviderId: '', translationAi: {} });
  const providers = store.providers || [];
  const activeId = store.translationAi?.providerId || store.activeProviderId;
  const provider = providers.find((p) => p.id === activeId) || providers[0];

  if (!provider || !provider.secret) {
    console.warn('[EasyWeb AI Translate]: No AI provider configured, falling back to Google Translate.');
    return null;
  }

  const model = store.translationAi?.model || provider.selectedModel || provider.defaultModel;
  const targetLangNames = {
    fa: 'Persian (فارسی)',
    en: 'English',
    ar: 'Arabic (العربية)',
    fr: 'French (Français)',
    de: 'German (Deutsch)',
    es: 'Spanish (Español)',
    tr: 'Turkish (Türkçe)',
    ru: 'Russian (Русский)',
    zh: 'Chinese (中文)',
    ja: 'Japanese (日本語)'
  };
  const langName = targetLangNames[targetLang] || targetLang;

  const toneInstructions = {
    standard: 'Translate with a fluent, natural, and idiomatic tone.',
    formal: 'Translate with a highly scholarly, professional tone suitable for official or academic texts.',
    colloquial: 'Translate with a friendly, conversational everyday tone.',
    literal: 'Translate with high precision, strictly preserving sentence structure.',
    simplified: 'Translate into clear, simplified language.',
    custom: customPrompt?.trim() || 'Translate accurately and naturally.'
  };

  const selectedTone = (tone === 'custom' && customPrompt?.trim())
    ? customPrompt.trim()
    : ((toneInstructions[tone] || toneInstructions.standard) + (customPrompt?.trim() ? ` Additional guidance: ${customPrompt.trim()}` : ''));

  // ponytail: 10 items / 1500 chars chunk ceiling prevents gateway 524 timeouts on large pages
  const CHUNK_SIZE = 10;
  const MAX_CHARS = 1500;
  const chunks = [];
  let currentChunk = [];
  let currentLen = 0;

  for (const t of texts) {
    const textLen = (t || '').length;
    if (currentChunk.length >= CHUNK_SIZE || (currentLen + textLen > MAX_CHARS && currentChunk.length > 0)) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentLen = 0;
    }
    currentChunk.push(t);
    currentLen += textLen;
  }
  if (currentChunk.length) chunks.push(currentChunk);

  const results = [];

  for (const chunk of chunks) {
    const combined = chunk.join(SEPARATOR);
    const systemPrompt = `You are a professional website translator. Translate the following text blocks into ${langName}.\nTranslation Style & Instructions: ${selectedTone}\nPreserve all line breaks, code tokens, technical tags, and punctuation. Maintain exact count of blocks separated by '====EW_SEP===='. Output ONLY the translated blocks separated by '====EW_SEP====' with NO commentary.`;

    const response = await callLLM({
      providerType: provider.type,
      apiKey: provider.secret,
      baseUrl: provider.baseUrl,
      model,
      prompt: combined,
      systemPrompt
    });

    if (!response?.ok || !response?.text) {
      console.warn('[EasyWeb AI Translate Error]:', response?.error || 'Unknown AI error, falling back chunk to Google Translate');
      // Fallback chunk to Google Translate
      const fallbackChunk = await Promise.all(chunk.map((item) => fetchGoogleTranslate(item, targetLang)));
      results.push(...fallbackChunk);
      continue;
    }

    const parts = response.text.split(/====EW_SEP====/i);
    if (parts.length === chunk.length) {
      results.push(...parts.map((p, idx) => (p !== undefined && p.trim() ? p.trim() : chunk[idx])));
    } else {
      console.warn('[EasyWeb AI Translate]: Separator count mismatch, falling back chunk to Google Translate');
      const fallbackChunk = await Promise.all(chunk.map((item) => fetchGoogleTranslate(item, targetLang)));
      results.push(...fallbackChunk);
    }
  }

  return results;
}

/**
 * Main batch translation handler: dispatches to Google Translate or AI engine.
 */
async function translateBatch(texts = [], targetLang = 'fa', engine = 'google', tone = 'standard', customPrompt = '') {
  if (!Array.isArray(texts) || !texts.length) {
    return { ok: true, translations: [] };
  }

  // 1. If engine is 'ai', attempt AI translation
  if (engine === 'ai') {
    const aiResults = await translateWithAI(texts, targetLang, tone, customPrompt);
    if (aiResults && aiResults.length === texts.length) {
      return { ok: true, translations: aiResults };
    }
    // Fallback to Google Translate if AI is not configured or fails
  }

  // 2. Default high-speed Google Translate
  const results = new Array(texts.length);
  const toFetchIndices = [];
  const toFetchTexts = [];

  texts.forEach((txt, idx) => {
    const clean = String(txt || '').trim();
    if (!clean) {
      results[idx] = txt;
      return;
    }
    const cacheKey = `google:${targetLang}:${clean}`;
    if (translationCache.has(cacheKey)) {
      results[idx] = translationCache.get(cacheKey);
    } else {
      toFetchIndices.push(idx);
      toFetchTexts.push(clean);
    }
  });

  if (!toFetchTexts.length) {
    return { ok: true, translations: results };
  }

  // Chunk into batches
  const chunks = [];
  let currentChunk = [];
  let currentLength = 0;
  let currentIndices = [];

  for (let i = 0; i < toFetchTexts.length; i++) {
    const item = toFetchTexts[i];
    const index = toFetchIndices[i];
    if (currentChunk.length >= 20 || currentLength + item.length > 2500) {
      chunks.push({ texts: currentChunk, indices: currentIndices });
      currentChunk = [];
      currentIndices = [];
      currentLength = 0;
    }
    currentChunk.push(item);
    currentIndices.push(index);
    currentLength += item.length;
  }
  if (currentChunk.length) {
    chunks.push({ texts: currentChunk, indices: currentIndices });
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      const combined = chunk.texts.join(SEPARATOR);
      const translatedCombined = await fetchGoogleTranslate(combined, targetLang);
      const parts = translatedCombined.split(new RegExp(SEPARATOR.trim(), 'i'));

      chunk.indices.forEach((origIndex, i) => {
        const trans = (parts[i] !== undefined ? parts[i] : chunk.texts[i]).trim();
        results[origIndex] = trans || texts[origIndex];
        const cacheKey = `google:${targetLang}:${chunk.texts[i]}`;
        translationCache.set(cacheKey, results[origIndex]);
      });
    })
  );

  return { ok: true, translations: results };
}

// --- Module: shared/constants.js ---
/**
 * Shared Application Constants
 */
const VERSION = '16';
const STORAGE_KEY = 'settings';
const TEXT_CLASS = 'easyweb-text-node';
const ROOT_ATTR = 'data-easyweb-font-root';
const DIRECTION_ATTR = 'data-easyweb-direction';
const RUNTIME_STYLE_ID = 'easyweb-runtime-style';

/** Ad-blocker runtime hooks (content side). */
const ADBLOCK_STYLE_ID = 'easyweb-adblock-style';
const ADBLOCK_FLAG_ATTR = 'data-easyweb-adblock';
/** Stores an element's original `style` attribute so hiding can be undone. */
const ADBLOCK_PREV_STYLE_ATTR = 'data-easyweb-adblock-style';
const OVERLAY_ATTR = 'data-easyweb-overlay-neutralized';
const GUARD_FLAG = '__easywebGuardInstalled';

/** Milliseconds within which a real user gesture legitimises a new tab. */
const GESTURE_WINDOW_MS = 1500;

/** Set on `window` while the element picker is running, so the popup guard
 *  steps aside and lets the picker receive the click. */
const PICKER_FLAG = '__easywebPickerActive';

/**
 * Master switch for the whole ad-blocker subsystem (network rules, popup guard,
 * cosmetic filtering and the MAIN-world scriptlet engine).
 *
 * Currently OFF by request: the feature is parked, not removed. Every runtime
 * entry point checks this flag, and `src/manifest.json` no longer declares the
 * blocker's permissions, content scripts or rule-sets.
 *
 * To bring it back:
 *   1. set this to `true`;
 *   2. in `src/manifest.json` restore `declarativeNetRequest` + `webNavigation`
 *      to `permissions`, the `declarative_net_request.rule_resources` block,
 *      the `guard.js` and `inject.js` content scripts, and the
 *      `rules/noop.js` web-accessible resource (see git history);
 *   3. `npm run verify` — the build compiles the rule-sets again automatically
 *      once the manifest declares them.
 */
const ADBLOCK_ENABLED = true;

// --- Module: rules/strict.js ---
/**
 * Extra-aggressive filters used only in per-site "strict" mode.
 *
 * Each entry becomes a *session* rule scoped with `initiatorDomains`, so the
 * extra blocking never leaks to other sites. Kept in its own module (instead of
 * lists.js) so the background bundle does not have to inline the full filter
 * catalogues.
 *
 * Entry shape:
 *   f -> urlFilter      r -> regexFilter
 *   t -> resourceTypes  d -> domainType ('thirdParty' | 'firstParty')
 */
const STRICT_SITE_FILTERS = [
  // Every third-party frame — this is what removes the ad overlays and
  // pop-under iframes that sit on top of video players.
  { t: ['sub_frame'], d: 'thirdParty' },

  // Advertising paths served from otherwise legitimate CDNs.
  { r: '^https?://[^/]+/(?:ads?|adserver|advert|advertising|banners?|pagead|gampad|adsystem|adframe|popunder|prebid)[-_.\\/]', t: ['sub_frame', 'script', 'image', 'xmlhttprequest', 'ping'] },

  // Tracking beacons and pixels.
  { r: '^https?://[^/]+/(?:pixel|beacon|track(?:ing)?|collect|analytics|telemetry|metrics)[-_.\\/]', t: ['image', 'xmlhttprequest', 'ping'] },

  // Common ad query parameters on third-party requests.
  { r: '[?&](?:adid|ad_id|adunit|adunitid|zoneid|zone_id|clickid|click_id|bannerid|banner_id|campaignid|campaign_id|utm_source|utm_medium|utm_campaign)=', t: ['sub_frame', 'image', 'xmlhttprequest', 'ping'] }
];

/** Session-rule id ranges so categories can be rebuilt independently. */
const SESSION_RULE_RANGES = {
  allow: { start: 1, size: 900 },
  block: { start: 901, size: 900 },
  strict: { start: 1801, size: 1500 },
  custom: { start: 3301, size: 800 }
};

// --- Module: background/adblock.js ---
/**
 * EasyWeb Ad Blocker — Background Engine
 *
 * Owns the declarativeNetRequest side of the blocker:
 *   • enables / disables the static filter rule-sets from the global toggles
 *   • keeps a live set of session rules for whitelist, blacklist, per-site
 *     "strict" hardening and user-written custom filters
 *   • maintains blocking statistics and the toolbar badge
 */



const EMPTY_STATS = { total: 0, perDomain: {}, popups: 0, cosmetic: 0, since: 0 };

let cachedConfig = { ...DEFAULT_ADBLOCK };
let cachedSites = {};
let refreshTimer = null;
let badgeTimer = null;
const tabCountCache = new Map();

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

function normalizeConfig(raw) {
  const config = { ...DEFAULT_ADBLOCK, ...(raw || {}) };
  config.toggles = { ...DEFAULT_ADBLOCK.toggles, ...(config.toggles || {}) };
  config.popupGuard = { ...DEFAULT_ADBLOCK.popupGuard, ...(config.popupGuard || {}) };
  config.cosmetic = { ...DEFAULT_ADBLOCK.cosmetic, ...(config.cosmetic || {}) };
  config.whitelist = Array.isArray(config.whitelist) ? config.whitelist.filter(Boolean) : [];
  config.blacklist = Array.isArray(config.blacklist) ? config.blacklist.filter(Boolean) : [];
  config.customSelectors = Array.isArray(config.customSelectors) ? config.customSelectors.filter(Boolean) : [];
  config.customRules = Array.isArray(config.customRules) ? config.customRules.filter(Boolean) : [];
  return config;
}
async function readState() {
  try {
    const store = await chrome.storage.local.get({
      [ADBLOCK_STORAGE_KEY]: DEFAULT_ADBLOCK,
      [STORAGE_KEY]: {}
    });
    cachedConfig = normalizeConfig(store[ADBLOCK_STORAGE_KEY]);
    cachedSites = store[STORAGE_KEY] || {};
  } catch (err) {
    console.warn('[EasyWeb Adblock] state read failed:', err);
  }
  return cachedConfig;
}
function getConfig() {
  return cachedConfig;
}

/** Synchronous toggle lookup for the popup guard (state is refreshed on boot). */
function togglesForDomain(domain) {
  const host = normalizeHost(domain);
  const site = cachedSites[host] || null;
  return resolveToggles(cachedConfig, site, host);
}
function popupGuardSettings() {
  return cachedConfig.popupGuard || DEFAULT_ADBLOCK.popupGuard;
}

/* ------------------------------------------------------------------ */
/* Static rule-sets                                                    */
/* ------------------------------------------------------------------ */

async function applyStaticRulesets() {
  let current = [];
  try {
    current = await chrome.declarativeNetRequest.getEnabledRulesets();
  } catch (_) {
    current = [];
  }

  const desired = new Set();
  if (cachedConfig.enabled) {
    for (const key of Object.keys(RULESET_IDS)) {
      if (cachedConfig.toggles[key]) desired.add(RULESET_IDS[key]);
    }
  }

  const enableRulesetIds = [...desired].filter((id) => !current.includes(id));
  const disableRulesetIds = current.filter((id) => !desired.has(id));
  if (!enableRulesetIds.length && !disableRulesetIds.length) return;

  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds, disableRulesetIds });
  } catch (err) {
    console.warn('[EasyWeb Adblock] could not update rule-sets:', err);
  }
}

/* ------------------------------------------------------------------ */
/* Session rules                                                       */
/* ------------------------------------------------------------------ */

function pushAllowRule(rules, cursor, domain) {
  if (cursor.value >= cursor.limit) return;
  rules.push({
    id: cursor.value++,
    priority: 1000,
    action: { type: 'allowAllRequests' },
    condition: { urlFilter: `||${domain}^`, resourceTypes: ['main_frame', 'sub_frame'] }
  });
}

function buildStrictCondition(entry, domain) {
  const condition = {
    resourceTypes: entry.t || NETWORK_RESOURCE_TYPES,
    initiatorDomains: [domain]
  };
  if (entry.r) condition.regexFilter = entry.r;
  else if (entry.f) condition.urlFilter = entry.f;
  if (entry.d) condition.domainType = entry.d;
  return condition;
}

/**
 * Build the complete session-rule set for a given configuration.
 * Pure (no chrome API access) so it can be verified in isolation.
 */
function buildSessionRules(config = cachedConfig, sites = cachedSites) {
  const rules = [];
  const ranges = SESSION_RULE_RANGES;
  const cursor = {
    allow: { value: ranges.allow.start, limit: ranges.allow.start + ranges.allow.size },
    block: { value: ranges.block.start, limit: ranges.block.start + ranges.block.size },
    strict: { value: ranges.strict.start, limit: ranges.strict.start + ranges.strict.size },
    custom: { value: ranges.custom.start, limit: ranges.custom.start + ranges.custom.size }
  };

  if (!config.enabled) return rules;

  // --- 1. Fully-allowed domains: global whitelist, per-site off, and sites
  //        where the user turned every network toggle off.
  const allowedDomains = new Set(
    (config.whitelist || []).map(normalizeHost).filter(Boolean)
  );

  for (const [host, site] of Object.entries(sites || {})) {
    const domain = normalizeHost(host);
    if (!domain) continue;
    const toggles = resolveToggles(config, site, domain);
    if (!toggles.ads && !toggles.trackers && !toggles.annoyances) allowedDomains.add(domain);
  }

  allowedDomains.forEach((domain) => pushAllowRule(rules, cursor.allow, domain));

  // --- 2. User blacklist: always blocked, even if the domain looks harmless.
  const blacklist = (config.blacklist || []).map(normalizeHost).filter(Boolean);
  for (const domain of blacklist) {
    if (allowedDomains.has(domain)) continue;
    if (cursor.block.value >= cursor.block.limit) break;
    rules.push({
      id: cursor.block.value++,
      priority: 900,
      action: { type: 'block' },
      condition: { urlFilter: `||${domain}^`, resourceTypes: NETWORK_RESOURCE_TYPES }
    });
  }

  // --- 3. Per-site "strict" hardening, scoped by initiator domain.
  for (const [host, site] of Object.entries(sites || {})) {
    const domain = normalizeHost(host);
    if (!domain || allowedDomains.has(domain)) continue;
    if (site?.blocker?.mode !== 'strict') continue;
    for (const entry of STRICT_SITE_FILTERS) {
      if (cursor.strict.value >= cursor.strict.limit) break;
      rules.push({
        id: cursor.strict.value++,
        priority: 800,
        action: { type: 'block' },
        condition: buildStrictCondition(entry, domain)
      });
    }
  }

  // --- 4. Custom filters written by the user.
  for (const line of config.customRules || []) {
    const parsed = parseCustomRule(line);
    if (!parsed) continue;
    if (cursor.custom.value >= cursor.custom.limit) break;
    rules.push({
      id: cursor.custom.value++,
      priority: parsed.isException ? 950 : 700,
      action: parsed.action,
      condition: {
        ...parsed.condition,
        resourceTypes: parsed.condition.resourceTypes || NETWORK_RESOURCE_TYPES
      }
    });
  }

  return rules;
}

async function applySessionRules() {
  const desired = buildSessionRules();

  let existingIds = [];
  try {
    const existing = await chrome.declarativeNetRequest.getSessionRules();
    existingIds = existing.map((rule) => rule.id);
  } catch (_) {
    existingIds = [];
  }

  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: existingIds,
      addRules: desired
    });
  } catch (err) {
    console.warn('[EasyWeb Adblock] could not update session rules:', err);
    return;
  }

  // Keep the popup guard's view of "is this site protected" in sync.
  tabCountCache.clear();
}

/* ------------------------------------------------------------------ */
/* Statistics & badge                                                  */
/* ------------------------------------------------------------------ */
async function getStats() {
  try {
    const store = await chrome.storage.local.get({ [ADBLOCK_STATS_KEY]: EMPTY_STATS });
    return { ...EMPTY_STATS, ...(store[ADBLOCK_STATS_KEY] || {}) };
  } catch (_) {
    return { ...EMPTY_STATS };
  }
}

/**
 * Add to the lifetime counters.
 * @param {{total?:number, popups?:number, cosmetic?:number}} patch
 * @param {string} domain
 */
async function recordStats(patch = {}, domain = '') {
  try {
    const stats = await getStats();
    const next = {
      total: (stats.total || 0) + (Number(patch.total) || 0),
      popups: (stats.popups || 0) + (Number(patch.popups) || 0),
      cosmetic: (stats.cosmetic || 0) + (Number(patch.cosmetic) || 0),
      since: stats.since || Date.now(),
      perDomain: { ...(stats.perDomain || {}) }
    };
    const host = normalizeHost(domain);
    if (host) {
      const delta = (Number(patch.total) || 0) + (Number(patch.popups) || 0) + (Number(patch.cosmetic) || 0);
      next.perDomain[host] = (next.perDomain[host] || 0) + delta;
      // Keep the per-domain map from growing without bound.
      const entries = Object.entries(next.perDomain);
      if (entries.length > 400) {
        entries.sort((a, b) => b[1] - a[1]);
        next.perDomain = Object.fromEntries(entries.slice(0, 300));
      }
    }
    await chrome.storage.local.set({ [ADBLOCK_STATS_KEY]: next });
    return next;
  } catch (_) {
    return null;
  }
}
async function resetStats() {
  const fresh = { ...EMPTY_STATS, perDomain: {}, since: Date.now() };
  await chrome.storage.local.set({ [ADBLOCK_STATS_KEY]: fresh });
  await updateBadge(null);
  return fresh;
}

/**
 * Network blocks for one tab. `getMatchedRules` needs the activeTab grant (or
 * the feedback permission); when it is unavailable we simply report 0 rather
 * than showing a wrong number.
 */
async function getTabBlockedCount(tabId) {
  if (!tabId) return 0;
  const cached = tabCountCache.get(tabId);
  if (cached && Date.now() - cached.at < 1500) return cached.value;
  let value = 0;
  try {
    const result = await chrome.declarativeNetRequest.getMatchedRules({ tabId });
    value = (result?.matchedRules || []).length;
  } catch (_) {
    value = cached?.value || 0;
  }
  tabCountCache.set(tabId, { at: Date.now(), value });
  return value;
}
async function updateBadge(tabId) {
  if (!cachedConfig.showBadge || !chrome.action?.setBadgeText) return;
  if (!tabId) {
    try {
      await chrome.action.setBadgeText({ text: '' });
    } catch (_) {}
    return;
  }
  const count = await getTabBlockedCount(tabId);
  try {
    await chrome.action.setBadgeText({ text: count > 0 ? formatCount(count) : '' });
    await chrome.action.setBadgeBackgroundColor({ color: count > 0 ? '#8d73ff' : '#00000000' });
    await chrome.action.setBadgeTextColor?.({ color: '#ffffff' });
  } catch (_) {}
}

function scheduleBadgeUpdate(tabId) {
  if (badgeTimer) clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => {
    badgeTimer = null;
    updateBadge(tabId);
  }, 600);
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** Rebuild every rule layer from storage. Debounced to absorb write bursts. */
function scheduleRefresh(delay = 120) {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    refresh().catch((err) => console.warn('[EasyWeb Adblock] refresh failed:', err));
  }, delay);
}
async function refresh() {
  await readState();
  await applyStaticRulesets();
  await applySessionRules();
  return { ok: true, enabled: cachedConfig.enabled, toggles: cachedConfig.toggles };
}

/** Everything the popup / sidebar needs to render the blocker UI. */
async function getStatus(tab) {
  await readState();
  const domain = normalizeHost(tab?.url || '');
  const site = cachedSites[domain] || null;
  const toggles = resolveToggles(cachedConfig, site, domain);
  const stats = await getStats();
  const tabCount = tab?.id ? await getTabBlockedCount(tab.id) : 0;

  let rulesetCount = 0;
  try {
    rulesetCount = (await chrome.declarativeNetRequest.getSessionRules()).length;
  } catch (_) {}

  return {
    ok: true,
    domain,
    global: cachedConfig,
    site,
    toggles,
    stats,
    tabCount,
    sessionRuleCount: rulesetCount,
    whitelisted: hostInList(domain, cachedConfig.whitelist),
    blacklisted: hostInList(domain, cachedConfig.blacklist)
  };
}
const getAdblockStatus = getStatus;

/** Patch the global configuration and re-apply. */
async function updateGlobal(patch = {}) {
  const store = await chrome.storage.local.get({ [ADBLOCK_STORAGE_KEY]: DEFAULT_ADBLOCK });
  const next = normalizeConfig({ ...(store[ADBLOCK_STORAGE_KEY] || {}), ...patch });
  await chrome.storage.local.set({ [ADBLOCK_STORAGE_KEY]: next });
  await refresh();
  return next;
}
const updateAdblockGlobal = updateGlobal;

/** Add / remove a domain from the whitelist or blacklist. */
async function setDomainList(listName, domain, present) {
  const host = normalizeHost(domain);
  if (!host || !['whitelist', 'blacklist'].includes(listName)) {
    return { ok: false, error: 'invalid-domain' };
  }
  const store = await chrome.storage.local.get({ [ADBLOCK_STORAGE_KEY]: DEFAULT_ADBLOCK });
  const config = normalizeConfig(store[ADBLOCK_STORAGE_KEY]);
  const list = new Set(config[listName] || []);
  if (present) {
    list.add(host);
    // A domain cannot be on both lists.
    const other = listName === 'whitelist' ? 'blacklist' : 'whitelist';
    const otherList = new Set(config[other] || []);
    otherList.delete(host);
    config[other] = [...otherList];
  } else {
    list.delete(host);
  }
  config[listName] = [...list];
  await chrome.storage.local.set({ [ADBLOCK_STORAGE_KEY]: config });
  await refresh();
  return { ok: true, config };
}

/** Persist a per-site blocker configuration and re-apply. */
async function updateSiteBlocker(domain, blocker) {
  const host = normalizeHost(domain);
  if (!host) return { ok: false, error: 'invalid-domain' };
  const store = await chrome.storage.local.get({ [STORAGE_KEY]: {} });
  const settings = store[STORAGE_KEY] || {};
  const site = settings[host] || {};
  site.blocker = { ...(site.blocker || {}), ...(blocker || {}) };
  settings[host] = site;
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
  await refresh();
  return { ok: true, site };
}
async function toggleSiteMode(domain, mode) {
  return updateSiteBlocker(domain, { mode });
}

/** Attach the badge + storage listeners. Called once from the service worker. */
function installAdblockListeners() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[ADBLOCK_STORAGE_KEY] || changes[STORAGE_KEY]) scheduleRefresh();
  });

  if (chrome.tabs?.onActivated) {
    chrome.tabs.onActivated.addListener(({ tabId }) => scheduleBadgeUpdate(tabId));
  }
  if (chrome.tabs?.onUpdated) {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.status === 'complete' || changeInfo.url) {
        tabCountCache.delete(tabId);
        scheduleBadgeUpdate(tabId);
      }
    });
  }
  if (chrome.tabs?.onRemoved) {
    chrome.tabs.onRemoved.addListener((tabId) => tabCountCache.delete(tabId));
  }
}

// --- Module: background/popup-guard.js ---
/**
 * EasyWeb Ad Blocker — Popup / Tab Guard
 *
 * Stops the "click a video and a new advertising tab opens" pattern.
 *
 * Strategy
 *   1. The document_start guard reports every genuine user gesture (mousedown /
 *      keydown / auxclick) together with the link it landed on, whether that
 *      link was a real anchor, and whether the target looked like a hijack
 *      overlay.
 *   2. Every new navigation target (window.open / target=_blank / pop-under) is
 *      evaluated against that gesture, the source site's settings and the known
 *      advertising host list.
 *   3. Anything that fails the check is closed immediately.
 */



/** tabId -> last genuine gesture seen in that tab. */
const gestures = new Map();
/** Tabs created by a page that we still need to inspect once they navigate. */
const suspects = new Map();

const URL_SCHEME_ALLOW = /^(?:about:|blob:|data:|chrome:|chrome-extension:|edge:|moz-extension:)/i;

function sameSite(a, b) {
  const hostA = normalizeHost(a);
  const hostB = normalizeHost(b);
  if (!hostA || !hostB) return false;
  return hostA === hostB || hostA.endsWith(`.${hostB}`) || hostB.endsWith(`.${hostA}`);
}

/** Record a gesture reported by the content guard. */
function recordGesture(tabId, gesture = {}) {
  if (!tabId) return;
  gestures.set(tabId, {
    at: Date.now(),
    href: gesture.href || '',
    hrefHost: gesture.href ? normalizeHost(gesture.href) : '',
    isLink: Boolean(gesture.isLink),
    onOverlay: Boolean(gesture.onOverlay),
    onMedia: Boolean(gesture.onMedia),
    onPlayer: Boolean(gesture.onPlayer)
  });
  // Keep the map from leaking entries for long-lived tabs.
  if (gestures.size > 300) {
    const cutoff = Date.now() - 60000;
    for (const [key, value] of gestures) {
      if (value.at < cutoff) gestures.delete(key);
    }
  }
}
function clearGesture(tabId) {
  gestures.delete(tabId);
  suspects.delete(tabId);
}

function recentGesture(tabId) {
  const gesture = gestures.get(tabId);
  if (!gesture) return null;
  if (Date.now() - gesture.at > GESTURE_WINDOW_MS) return null;
  return gesture;
}

/**
 * Decide whether a navigation target should be allowed.
 * Exported for testing.
 * @returns {{allow: boolean, reason: string}}
 */
function evaluate({ sourceDomain, targetUrl, gesture, guard }) {
  const targetHost = normalizeHost(targetUrl);

  if (!targetHost) return { allow: true, reason: 'no-host' };
  if (URL_SCHEME_ALLOW.test(targetUrl)) return { allow: true, reason: 'internal-scheme' };
  if (isAuthHost(targetHost, guard.allowedHosts)) return { allow: true, reason: 'auth-flow' };
  if (sameSite(targetHost, sourceDomain)) return { allow: true, reason: 'same-site' };

  if (!gesture) {
    return guard.blockWithoutGesture
      ? { allow: false, reason: 'no-gesture' }
      : { allow: true, reason: 'no-gesture-allowed' };
  }

  // A known advertising / pop-under destination is never legitimate, even if
  // the hostile player deliberately put it in a visible anchor.
  if (isKnownAdHost(targetHost)) {
    return { allow: false, reason: 'ad-host' };
  }

  // The click landed on a transparent overlay sitting on top of the content.
  if (gesture.onOverlay) {
    return { allow: false, reason: 'overlay-hijack' };
  }

  // A seek/fullscreen/volume/play click must never become a redirect button.
  // Check this *before* accepting a matching href: many hostile players wrap
  // their control surface in an ordinary-looking <a href="external-host">.
  if (guard.blockFromMedia !== false && (gesture.onMedia || gesture.onPlayer)) {
    return { allow: false, reason: 'media-popup' };
  }

  // The gesture pointed at this very destination — a normal link click.
  if (gesture.hrefHost && sameSite(gesture.hrefHost, targetHost)) {
    return { allow: true, reason: 'gesture-target' };
  }

  // A click that was not on a real link, yet produced a third-party window.
  if (guard.blockThirdPartyPopup && !gesture.isLink) {
    return { allow: false, reason: 'synthetic-popup' };
  }

  return { allow: true, reason: 'gesture-allowed' };
}

async function getSourceDomain(sourceTabId, sourceUrl) {
  if (sourceUrl) return normalizeHost(sourceUrl);
  if (!sourceTabId) return '';
  try {
    const tab = await chrome.tabs.get(sourceTabId);
    return normalizeHost(tab?.url || '');
  } catch (_) {
    return '';
  }
}

async function closeTarget(tabId, reason, sourceTabId, targetUrl) {
  try {
    await chrome.tabs.remove(tabId);
  } catch (_) {
    return false;
  }

  const targetHost = normalizeHost(targetUrl);
  const sourceDomain = await getSourceDomain(sourceTabId, '');

  recordStats({ popups: 1, total: 1 }, sourceDomain || targetHost);

  // Tell the page so it can show a small toast.
  if (sourceTabId) {
    try {
      await chrome.tabs.sendMessage(sourceTabId, {
        type: 'ADBLOCK_POPUP_BLOCKED',
        host: targetHost,
        reason
      });
    } catch (_) {}
  }

  return true;
}

/** Core handler shared by both detection paths. */
async function handleTarget({ targetTabId, sourceTabId, targetUrl, sourceUrl }) {
  const config = getConfig();
  if (!config.enabled) return;
  const guard = popupGuardSettings();
  if (!guard.enabled) return;

  const sourceDomain = await getSourceDomain(sourceTabId, sourceUrl);
  if (!sourceDomain) return;

  const toggles = togglesForDomain(sourceDomain);
  if (!toggles.popups) return;

  const gesture = sourceTabId ? recentGesture(sourceTabId) : null;
  const decision = evaluate({ sourceDomain, targetUrl, gesture, guard });

  if (!decision.allow) {
    await closeTarget(targetTabId, decision.reason, sourceTabId, targetUrl);
  }
}

/* ------------------------------------------------------------------ */
/* Detection paths                                                     */
/* ------------------------------------------------------------------ */

/** Primary path: fires for window.open, target=_blank and pop-unders. */
function onCreatedNavigationTarget(details) {
  const { tabId, sourceTabId, url } = details;
  if (!sourceTabId || !tabId) return;
  if (!url || url === 'about:blank') {
    suspects.set(tabId, { openerTabId: sourceTabId, at: Date.now() });
    return;
  }
  handleTarget({ targetTabId: tabId, sourceTabId, targetUrl: url }).catch(() => {});
}

/**
 * Secondary path: a page opens a blank window/tab and navigates it a moment
 * later. We remember the tab when it is created and inspect it on first
 * navigation.
 */
function onTabCreated(tab) {
  if (!tab?.id || !tab.openerTabId) return;
  const config = getConfig();
  if (!config.enabled) return;
  const guard = popupGuardSettings();
  if (!guard.enabled) return;
  // A brand-new tab with no URL or about:blank — decide once it navigates.
  const initialUrl = tab.url || tab.pendingUrl || '';
  if (!initialUrl || initialUrl === 'about:blank') {
    suspects.set(tab.id, { openerTabId: tab.openerTabId, at: Date.now() });
  }
}

function onTabUpdated(tabId, changeInfo, tab) {
  const suspect = suspects.get(tabId);
  if (!suspect) return;
  const url = changeInfo.url || tab?.url || '';
  if (!url) return;
  suspects.delete(tabId);
  if (!/^https?:/i.test(url)) return;
  handleTarget({
    targetTabId: tabId,
    sourceTabId: suspect.openerTabId,
    targetUrl: url
  }).catch(() => {});
}
function installPopupGuard() {
  if (!chrome.webNavigation?.onCreatedNavigationTarget) {
    console.warn('[EasyWeb Adblock] webNavigation unavailable — popup guard degraded.');
  } else {
    chrome.webNavigation.onCreatedNavigationTarget.addListener(onCreatedNavigationTarget);
  }

  chrome.tabs?.onCreated?.addListener(onTabCreated);
  chrome.tabs?.onUpdated?.addListener(onTabUpdated);
  chrome.tabs?.onRemoved?.addListener((tabId) => {
    clearGesture(tabId);
  });
}

/** Diagnostics for the sidebar. */
function guardDiagnostics() {
  return {
    trackedGestures: gestures.size,
    pendingSuspects: suspects.size
  };
}

// --- Module: background/index.js ---
/**
 * Background Service Worker Entry Point
 */








async function ensureStorageInitialized() {
  try {
    const current = await chrome.storage.local.get(null);
    const updates = {};
    for (const key of Object.keys(DEFAULTS)) {
      if (current[key] === undefined) {
        updates[key] = DEFAULTS[key];
      }
    }
    if (!current.bundledFonts || !Array.isArray(current.bundledFonts) || current.bundledFonts.length === 0) {
      updates.bundledFonts = BUNDLED_FONTS;
    }
    if (Object.keys(updates).length > 0) {
      await chrome.storage.local.set(updates);
    }
  } catch (err) {
    console.warn('[EasyWeb Storage Init Error]:', err);
  }
  await refresh().catch(() => {});
}

/**
 * Push the current settings to the active tab, re-injecting the content script
 * when it is missing.
 *
 * Every already-open page loses its content script when the extension is
 * reloaded, and a plain `tabs.sendMessage` then fails silently — which is why
 * changes used to need a manual page refresh. Repairing the script here means a
 * settings change always reaches the page.
 */
async function resyncActiveTab() {
  let tab = null;
  try {
    tab = await getActiveTab();
  } catch (_) {
    return;
  }
  if (!tab?.id || !/^https?:/i.test(tab.url || '')) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'RESYNC' });
    return;
  } catch (_) {
    // No live content script — inject one and retry.
  }

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await chrome.tabs.sendMessage(tab.id, { type: 'RESYNC' });
  } catch (_) {}
}

chrome.runtime.onInstalled.addListener(ensureStorageInitialized);
if (typeof chrome.runtime.onStartup !== 'undefined') {
  chrome.runtime.onStartup.addListener(ensureStorageInitialized);
}

// The service worker is torn down and restarted often; session rules live only
// for the browser session, so re-apply the blocker every time we boot.
// The whole subsystem is parked behind ADBLOCK_ENABLED (see shared/constants.js).
if (ADBLOCK_ENABLED) {
  installAdblockListeners();
  installPopupGuard();
  refresh().catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === 'GET_ACTIVE_CONTEXT') {
      const context = await getActiveTabContext();
      return sendResponse(context);
    }

    if (message.type === 'FETCH_MODELS') {
      const { providerType, apiKey, baseUrl } = message;
      const res = await fetchProviderModels(providerType, apiKey, baseUrl);
      return sendResponse(res);
    }

    if (message.type === 'AI_REQUEST') {
      const store = await chrome.storage.local.get({ providers: [], activeProviderId: '' });
      const providers = store.providers || [];
      const provider = providers.find((p) => p.id === message.providerId) ||
                       providers.find((p) => p.id === store.activeProviderId) ||
                       providers[0];

      if (!provider || !provider.secret) {
        return sendResponse({
          ok: false,
          error: 'No AI provider configured. Open Settings (⚙) to add your API key.'
        });
      }

      const model = message.model || provider.selectedModel || provider.defaultModel;
      const res = await callLLM({
        providerType: provider.type,
        apiKey: provider.secret,
        baseUrl: provider.baseUrl,
        model,
        prompt: message.prompt,
        systemPrompt: message.pageText ? `Active page content:\n${message.pageText.slice(0, 8000)}` : ''
      });
      return sendResponse(res);
    }

    if (message.type === 'TRANSLATE_BATCH') {
      const { texts, targetLang, engine, tone, customPrompt } = message;
      const res = await translateBatch(texts, targetLang, engine, tone, customPrompt);
      return sendResponse(res);
    }

    if (message.type === 'ELEMENT_PICKED' && sender.tab?.id) {
      setPickerResult(sender.tab.id, {
        feature: message.feature,
        selector: message.selector,
        label: message.label,
        broad: message.broad,
        mode: message.mode,
        ruleId: message.ruleId
      });
      return sendResponse({ ok: true });
    }

    if (message.type === 'GET_PICKER_RESULT') {
      const tab = await getActiveTab();
      const result = tab?.id ? popPickerResult(tab.id) : null;
      return sendResponse({ ok: true, result: result || null });
    }

    if (message.type === 'OPEN_SIDEBAR') {
      const tab = await getActiveTab();
      if (!tab?.id) return sendResponse({ ok: false, error: 'No active tab.' });
      if (chrome.sidePanel?.open) {
        await chrome.sidePanel.open({ tabId: tab.id });
        return sendResponse({ ok: true });
      }
      return sendResponse({ ok: false, error: 'Side panel not supported.' });
    }

    if (message.type === 'PAGE_ACTION') {
      const tab = await getActiveTab();
      if (!tab?.id) return sendResponse({ ok: false, error: 'No active tab.' });
      let page = await sendToTab(tab.id, { type: 'GET_PAGE_TEXT' });
      if (!page?.ok && !page?.text) {
        try {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
          page = await sendToTab(tab.id, { type: 'GET_PAGE_TEXT' });
        } catch (_) {}
      }
      return sendResponse({ ok: true, text: page?.text || '' });
    }

    /* ---------------- Ad blocker ---------------- */

    // Parked for now: answer politely instead of touching APIs whose permissions
    // are no longer declared in the manifest.
    if (!ADBLOCK_ENABLED && typeof message.type === 'string' && message.type.startsWith('ADBLOCK_')) {
      return sendResponse({ ok: false, disabled: true });
    }

    if (message.type === 'USER_GESTURE' && sender.tab?.id) {
      recordGesture(sender.tab.id, message.gesture || {});
      return sendResponse({ ok: true });
    }

    if (message.type === 'ADBLOCK_STATUS') {
      const tab = message.tabId
        ? await chrome.tabs.get(message.tabId).catch(() => null)
        : await getActiveTab();
      return sendResponse(await getAdblockStatus(tab));
    }

    if (message.type === 'ADBLOCK_UPDATE_GLOBAL') {
      const config = await updateAdblockGlobal(message.patch || {});
      // Apply to the page the user is looking at, without waiting for the
      // storage notification (and repairing an orphaned content script).
      resyncActiveTab();
      return sendResponse({ ok: true, config });
    }

    if (message.type === 'ADBLOCK_SET_LIST') {
      const result = await setDomainList(message.list, message.domain, Boolean(message.present));
      resyncActiveTab();
      return sendResponse(result);
    }

    if (message.type === 'ADBLOCK_SET_SITE') {
      const result = await updateSiteBlocker(message.domain, message.blocker || {});
      resyncActiveTab();
      return sendResponse(result);
    }

    if (message.type === 'ADBLOCK_RECORD') {
      const domain = message.domain || (sender.tab?.url ? new URL(sender.tab.url).hostname : '');
      const stats = await recordStats(message.patch || {}, domain);
      return sendResponse({ ok: true, stats });
    }

    if (message.type === 'ADBLOCK_STATS') {
      return sendResponse({ ok: true, stats: await getStats() });
    }

    if (message.type === 'ADBLOCK_RESET_STATS') {
      return sendResponse({ ok: true, stats: await resetStats() });
    }

    if (message.type === 'ADBLOCK_DIAGNOSTICS') {
      let sessionRuleCount = 0;
      try {
        sessionRuleCount = (await chrome.declarativeNetRequest.getSessionRules()).length;
      } catch (_) {}
      return sendResponse({
        ok: true,
        guard: guardDiagnostics(),
        stats: await getStats(),
        sessionRuleCount
      });
    }

    if (message.type === 'ADBLOCK_CLEAR_GESTURES' && sender.tab?.id) {
      clearGesture(sender.tab.id);
      return sendResponse({ ok: true });
    }

    return sendResponse({ ok: false, error: 'Unknown message type.' });
  })();
  return true;
});
})();
