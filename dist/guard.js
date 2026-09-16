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

// --- Module: content/core/context.js ---
/**
 * Content Script Context Validator, Injection Gate and Cleanup Guard
 */

/** Per-frame marker holding the running instance and a liveness probe. */
const INSTANCE_KEY = '__easywebInstance';
function isContextValid() {
  try {
    return Boolean(typeof chrome !== 'undefined' && chrome?.runtime && chrome.runtime.id);
  } catch (_) {
    return false;
  }
}

/**
 * Build a probe that reports whether the context which created it is still
 * usable.
 *
 * `chrome.runtime.getURL` throws "Extension context invalidated" as soon as the
 * extension is reloaded and the old content script is orphaned. That is the only
 * reliable way to tell a *live* previous injection from a *dead* one — and the
 * difference matters enormously: treating a dead instance as live means a
 * re-injected script refuses to start, leaving the page with no content script
 * at all until the user refreshes.
 */
function makeLivenessProbe() {
  return function probe() {
    if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
      throw new Error('extension-context-invalid');
    }
    chrome.runtime.getURL('');
    return true;
  };
}

/** Is a previously stored instance still running and from this version? */
function isInstanceAlive(instance, version = VERSION) {
  if (!instance || instance.version !== version) return false;
  try {
    return instance.isAlive() === true;
  } catch (_) {
    return false;
  }
}

/**
 * Claim a per-frame slot (the content script, or the document_start guard).
 * Returns true when the caller may install, false when a live instance of the
 * same version already owns it.
 */
function claimInstance(key = INSTANCE_KEY, version = VERSION) {
  if (isInstanceAlive(window[key], version)) return false;
  window[key] = { version, isAlive: makeLivenessProbe() };
  return true;
}

/** Undo the DOM changes a previous *version* left behind. */
function clearPreviousDom() {
  document.getElementById(RUNTIME_STYLE_ID)?.remove();
  document.getElementById(ADBLOCK_STYLE_ID)?.remove();
  document.getElementById('easyweb-adblock-ui-style')?.remove();

  document.querySelectorAll(`.${TEXT_CLASS}`).forEach((node) => {
    const parent = node.parentNode;
    if (parent) parent.replaceChild(document.createTextNode(node.textContent || ''), node);
  });
  document.querySelectorAll(`[${DIRECTION_ATTR}]`).forEach((node) => {
    node.removeAttribute(DIRECTION_ATTR);
    node.style.removeProperty('direction');
    node.style.removeProperty('text-align');
  });
  document.documentElement.removeAttribute(DIRECTION_ATTR);
  document.documentElement.style.removeProperty('direction');
  document.documentElement.style.removeProperty('text-align');
  if (document.body) {
    document.body.removeAttribute(DIRECTION_ATTR);
    document.body.style.removeProperty('direction');
    document.body.style.removeProperty('text-align');
  }
}

/**
 * Returns true when this content script should run.
 *
 * False only when a live instance of the same version is already running, which
 * makes a double injection harmless. A dead instance (the extension was
 * reloaded) or one from an older version is replaced.
 */
function cleanupStaleInjections() {
  const previous = window[INSTANCE_KEY];
  if (isInstanceAlive(previous)) return false;

  // Only strip the page when the conventions may have changed between versions.
  // For a same-version takeover the apply path restores and re-applies anyway.
  if (previous && previous.version !== VERSION) clearPreviousDom();

  window[INSTANCE_KEY] = { version: VERSION, isAlive: makeLivenessProbe() };
  return true;
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

// --- Module: content/features/cosmetic.js ---
/**
 * EasyWeb Ad Blocker — Cosmetic Filtering
 *
 * Hides advertising containers with a `display:none !important` stylesheet and
 * keeps up with dynamically injected ads through a debounced DOM sweep.
 * The stylesheet can be injected as early as `document_start` (from guard.js) so
 * ads never get a chance to flash before the page paints.
 *
 * Two kinds of rule are applied:
 *   • catalogue + custom selectors  → hidden
 *   • sections the user picked with the element picker → hidden, or (in
 *     "remove" mode) deleted from the DOM and re-deleted if the page puts
 *     them back.
 *
 * Everything applied here is reversible. Hiding records the element's original
 * `style` attribute, and deleting keeps the detached node plus its position, so
 * that removing or disabling a rule (or turning cosmetic filtering off) restores
 * the page instead of leaving elements hidden forever.
 */



/** Elements we are comfortable deleting outright rather than merely hiding. */
const REMOVABLE_TAGS = new Set(['IFRAME', 'INS', 'EMBED', 'OBJECT']);

/** Never delete these, no matter what the user picked — it would blank the page. */
const UNREMOVABLE_TAGS = new Set(['HTML', 'HEAD', 'BODY']);

/** Upper bound on how many detached nodes we hold for restoration. */
const MAX_REMEMBERED_REMOVALS = 200;

let observer = null;
let sweepTimer = null;
let reportTimer = null;
let hideSelectorText = '';
let removeSelectorText = '';
let hiddenCount = 0;
let reportCallback = null;
let removeFrames = true;
let onCountChange = null;

/** Detached nodes, kept so that a deleted rule can bring them back. */
const removedNodes = [];

function getStyleElement() {
  let el = document.getElementById(ADBLOCK_STYLE_ID);
  if (!el) {
    el = document.createElement('style');
    el.id = ADBLOCK_STYLE_ID;
    el.setAttribute(ADBLOCK_FLAG_ATTR, 'style');
    (document.head || document.documentElement).appendChild(el);
  }
  return el;
}

/** A selector is only usable if the browser can actually parse it. */
function isValidSelector(selector) {
  try {
    document.querySelector(selector);
    return true;
  } catch (_) {
    return false;
  }
}

/** Join selectors into one query, dropping anything unparseable. */
function combineSelectors(selectors) {
  const usable = selectors.filter((s) => s && isValidSelector(s));
  return usable.length ? usable.join(',\n') : '';
}

/**
 * Write (or clear) the cosmetic stylesheet.
 * @param {{toggles:object, config:object, customRules?:string[], picked?:Array}} options
 */
function injectCosmeticCss({ toggles, config, customRules = [], picked = [] }) {
  try {
    if (!toggles?.cosmetic) {
      document.getElementById(ADBLOCK_STYLE_ID)?.remove();
      document.documentElement.removeAttribute(ADBLOCK_FLAG_ATTR);
      return false;
    }

    const extraSelectors = [
      ...(config?.customSelectors || []),
      ...extractCosmeticRules(customRules)
    ];

    const css = buildCosmeticCss({
      customSelectors: extraSelectors,
      includeAnnoyances: Boolean(toggles.annoyances),
      collapseEmptySlots: config?.cosmetic?.collapseEmptySlots !== false,
      picked
    });

    const style = getStyleElement();
    if (style.textContent !== css) style.textContent = css;
    document.documentElement.setAttribute(ADBLOCK_FLAG_ATTR, 'on');
    return true;
  } catch (_) {
    return false;
  }
}

/** Host of the current page, or '' when there is no DOM context. */
function currentHost() {
  try {
    return typeof location !== 'undefined' ? location.hostname : '';
  } catch (_) {
    return '';
  }
}

/** Selectors from the built-in catalogue plus the user's own custom selectors. */
function buildHideSelectors({ toggles, config, customRules }) {
  const selectors = [...BASE_COSMETIC_SELECTORS];
  if (toggles?.annoyances) selectors.push(...ANNOYANCE_SELECTORS);
  selectors.push(...(config?.customSelectors || []));
  selectors.push(...extractCosmeticRules(customRules));

  // Site-specific containers (YouTube ad overlays and cards, Spotify banners).
  // Only added where they can actually match, so other sites do not pay for them.
  const profile = profileForHost(currentHost());
  if (profile?.selectors?.length) selectors.push(...profile.selectors);

  return [...new Set(selectors.filter(Boolean))];
}

/** Selectors the user explicitly asked to delete from the DOM. */
function buildRemoveSelectors(picked = []) {
  return [...new Set(
    picked
      .filter((rule) => rule?.enabled !== false && rule?.mode === 'remove')
      .map((rule) => activePickedSelector(rule))
      .filter(Boolean)
  )];
}

/** Everything the picker marked as "hide" (the default mode). */
function buildPickedHideSelectors(picked = []) {
  return [...new Set(
    picked
      .filter((rule) => rule?.enabled !== false && rule?.mode !== 'remove')
      .map((rule) => activePickedSelector(rule))
      .filter(Boolean)
  )];
}

function countAndNotify() {
  if (onCountChange) onCountChange(hiddenCount);
}

/* ------------------------------------------------------------------ */
/* Reversible hiding                                                   */
/* ------------------------------------------------------------------ */

/** Remember the element's original inline style before we override it. */
function rememberStyle(el) {
  if (el.hasAttribute(ADBLOCK_PREV_STYLE_ATTR)) return;
  el.setAttribute(ADBLOCK_PREV_STYLE_ATTR, el.getAttribute('style') || '');
}

/** Remember a detached node and where it came from. */
function rememberRemoval(node) {
  const parent = node.parentNode;
  if (!parent) return;
  removedNodes.push({ node, parent, next: node.nextSibling });
  if (removedNodes.length > MAX_REMEMBERED_REMOVALS) removedNodes.shift();
}

function detach(el) {
  rememberRemoval(el);
  el.setAttribute(ADBLOCK_FLAG_ATTR, 'removed');
  el.remove();
}

/** Put back every element we hid, restoring its exact original inline style. */
function restoreHiddenElements() {
  let restored = 0;
  let nodes;
  try {
    nodes = document.querySelectorAll(`[${ADBLOCK_FLAG_ATTR}="hidden"]`);
  } catch (_) {
    return 0;
  }

  for (const el of nodes) {
    const saved = el.getAttribute(ADBLOCK_PREV_STYLE_ATTR);
    el.removeAttribute(ADBLOCK_FLAG_ATTR);
    if (saved !== null) {
      if (saved) el.setAttribute('style', saved);
      else el.removeAttribute('style');
      el.removeAttribute(ADBLOCK_PREV_STYLE_ATTR);
    } else {
      // Defensive: we hid it without recording the original.
      el.style.removeProperty('display');
      el.style.removeProperty('pointer-events');
    }
    restored += 1;
  }
  return restored;
}

/** Re-attach everything we deleted, as close to its original position as we can. */
function restoreRemovedNodes() {
  let restored = 0;
  while (removedNodes.length) {
    const entry = removedNodes.pop();
    try {
      if (entry.next && entry.next.parentNode === entry.parent) {
        entry.parent.insertBefore(entry.node, entry.next);
      } else {
        entry.parent.appendChild(entry.node);
      }
      entry.node.removeAttribute(ADBLOCK_FLAG_ATTR);
      restored += 1;
    } catch (_) {
      // The page moved on and the original parent is gone — nothing to restore.
    }
  }
  return restored;
}

/**
 * Undo everything the cosmetic engine did. Called before re-applying settings so
 * that a deleted or disabled rule stops hiding its elements.
 */
function restoreCosmetic() {
  return restoreHiddenElements() + restoreRemovedNodes();
}

/* ------------------------------------------------------------------ */
/* Sweeps                                                             */
/* ------------------------------------------------------------------ */

/** Remove the nodes the user asked to delete. */
function removalPass() {
  if (!removeSelectorText) return 0;
  let touched = 0;
  let matches;
  try {
    matches = document.querySelectorAll(removeSelectorText);
  } catch (_) {
    return 0;
  }
  for (const el of matches) {
    if (touched > 300) break;
    if (el.hasAttribute(ADBLOCK_FLAG_ATTR)) continue;
    // Deleting the document root or the body would blank the whole page.
    if (UNREMOVABLE_TAGS.has(el.tagName)) continue;
    detach(el);
    touched += 1;
    hiddenCount += 1;
  }
  return touched;
}

/** Hide everything else the stylesheet may have missed. */
function hidePass() {
  if (!hideSelectorText) return 0;
  let touched = 0;
  let matches;
  try {
    matches = document.querySelectorAll(hideSelectorText);
  } catch (_) {
    return 0;
  }
  for (const el of matches) {
    if (touched > 400) break;
    if (el.hasAttribute(ADBLOCK_FLAG_ATTR)) continue;
    if (el.id === ADBLOCK_STYLE_ID) continue;

    if (removeFrames && REMOVABLE_TAGS.has(el.tagName)) {
      detach(el);
      touched += 1;
      hiddenCount += 1;
      continue;
    }

    if (el.getAttribute(ADBLOCK_FLAG_ATTR) === 'hidden') continue;
    rememberStyle(el);
    el.setAttribute(ADBLOCK_FLAG_ATTR, 'hidden');
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
    touched += 1;
    hiddenCount += 1;
  }
  return touched;
}

/**
 * One pass over the document. Removal runs first so that deleted nodes never
 * reach the hide pass.
 */
function sweep() {
  if (!hideSelectorText && !removeSelectorText) return 0;
  const touched = removalPass() + hidePass();
  if (touched) countAndNotify();
  return touched;
}

/** Run a sweep immediately instead of waiting for the debounce. */
function sweepNow() {
  if (sweepTimer) {
    clearTimeout(sweepTimer);
    sweepTimer = null;
  }
  try {
    return sweep();
  } catch (_) {
    return 0;
  }
}

function scheduleSweep() {
  if (sweepTimer) return;
  sweepTimer = setTimeout(() => {
    sweepTimer = null;
    try {
      sweep();
    } catch (_) {}
  }, 350);
}

function scheduleReport() {
  if (!reportCallback || reportTimer) return;
  reportTimer = setTimeout(() => {
    reportTimer = null;
    const pending = hiddenCount - (scheduleReport.reported || 0);
    if (pending <= 0) return;
    scheduleReport.reported = hiddenCount;
    reportCallback(pending);
  }, 2500);
}
scheduleReport.reported = 0;

function attachObserver() {
  if (observer || typeof MutationObserver === 'undefined') return;
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes?.length) {
        scheduleSweep();
        return;
      }
    }
  });
  try {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}
}

/** Install the long-lived engine (observer + periodic sweep). */
function startCosmeticEngine({ toggles, config, customRules = [], picked = [], onCount }) {
  reportCallback = typeof onCount === 'function' ? onCount : null;
  removeFrames = config?.cosmetic?.hideAdFrames !== false;

  if (!toggles?.cosmetic) {
    stopCosmeticEngine();
    return;
  }

  hideSelectorText = combineSelectors([
    ...buildHideSelectors({ toggles, config, customRules }),
    ...buildPickedHideSelectors(picked)
  ]);
  removeSelectorText = combineSelectors(buildRemoveSelectors(picked));

  attachObserver();
  scheduleSweep();

  // Some pages swap content in long after load without a clean mutation burst.
  if (!startCosmeticEngine.timer) {
    startCosmeticEngine.timer = setInterval(() => {
      scheduleSweep();
      scheduleReport();
    }, 12000);
  }
}
startCosmeticEngine.timer = null;

/** Tear the engine down and put the page back the way we found it. */
function stopCosmeticEngine() {
  if (observer) {
    try { observer.disconnect(); } catch (_) {}
    observer = null;
  }
  if (sweepTimer) {
    clearTimeout(sweepTimer);
    sweepTimer = null;
  }
  if (reportTimer) {
    clearTimeout(reportTimer);
    reportTimer = null;
  }
  if (startCosmeticEngine.timer) {
    clearInterval(startCosmeticEngine.timer);
    startCosmeticEngine.timer = null;
  }
  hideSelectorText = '';
  removeSelectorText = '';
  restoreCosmetic();
  document.getElementById(ADBLOCK_STYLE_ID)?.remove();
  document.documentElement.removeAttribute(ADBLOCK_FLAG_ATTR);
}
function cosmeticCount() {
  return hiddenCount;
}

// --- Module: content/features/popup-guard.js ---
/**
 * EasyWeb Ad Blocker — Content-side Popup Guard
 *
 * Runs as early as `document_start` so it can neutralise the page's popup
 * machinery before the site's own scripts capture the references.
 *
 * Layers
 *   1. `window.open` wrapper — blocks pop-unders during unload, known ad hosts
 *      and calls made with no user activation at all.
 *   2. Capture-phase click / auxclick guard — blocks invisible hijack links,
 *      links pointing at advertising hosts, and synthetic clicks.
 *   3. Video overlay neutralisation — a transparent layer stacked on top of a
 *      player is switched to `pointer-events: none` and the click is forwarded
 *      to the player underneath, so playback still starts.
 *   4. Gesture reporting — every genuine interaction is described to the
 *      background worker, which uses it to judge new tabs and windows.
 */


let active = false;
let guardConfig = null;
let lastGestureReport = 0;
let lastGestureHref = '';
let lastGestureAt = 0;
let lastPlayerInteractionAt = 0;
let pageUnloading = false;
let forwarding = false;

/** Player controls are often siblings of the <video>, not descendants. */
const PLAYER_HINT = /(?:^|[-_\s])(video|media|player|jwplayer|vjs|plyr|shaka|dplayer|artplayer|clappr)(?:[-_\s]|$)/i;
const PLAYER_ATTR_SELECTOR = '[data-player],[data-video-player],[data-media-player],[class*="player"],[id*="player"],[class*="video"],[id*="video"],[class*="media"],[id*="media"]';
const AD_SELECTOR_HINT = 'ins,iframe,[data-ad-slot],[data-ad-client],[id^="google_ads"],[class*="adsbygoogle"],.adsbygoogle';
const PLAYER_INTERACTION_WINDOW_MS = 1800;

function sameSite(a, b) {
  const hostA = normalizeHost(a);
  const hostB = normalizeHost(b);
  if (!hostA || !hostB) return false;
  return hostA === hostB || hostA.endsWith(`.${hostB}`) || hostB.endsWith(`.${hostA}`);
}

function resolveUrl(url) {
  if (!url) return '';
  try {
    return new URL(String(url), location.href).href;
  } catch (_) {
    return '';
  }
}

/** Old listeners remain on a page after an extension reload. They must become
 * inert so a fresh guard can take over without a page refresh. */
function hasLiveExtensionContext() {
  try {
    return Boolean(typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.runtime.getURL(''));
  } catch (_) {
    return false;
  }
}

function report(patch) {
  try {
    chrome.runtime.sendMessage({ type: 'ADBLOCK_RECORD', patch });
  } catch (_) {}
}

function eventPoint(event) {
  const touch = event?.touches?.[0] || event?.changedTouches?.[0];
  return {
    x: Number(touch?.clientX ?? event?.clientX ?? -1),
    y: Number(touch?.clientY ?? event?.clientY ?? -1)
  };
}

function pathHasMedia(path = []) {
  return path.some((node) => node instanceof Element
    && (node.tagName === 'VIDEO' || node.tagName === 'AUDIO'));
}

/**
 * Is this interaction on a real media player or one of its controls?
 *
 * Native controls land directly on <video>. Custom controls are normally in a
 * wrapper that contains media; `elementsFromPoint` catches overlays sitting on
 * top of the video. The final class/id check covers popular player libraries
 * while still requiring a media element in that wrapper, avoiding ordinary
 * buttons that merely happen to have "player" in a class name.
 */
function isPlayerInteraction(event, element, path = []) {
  try {
    if (pathHasMedia(path)) return true;
    if (element?.closest?.('video, audio')) return true;

    const { x, y } = eventPoint(event);
    if (x >= 0 && y >= 0 && document.elementsFromPoint) {
      const stack = document.elementsFromPoint(x, y) || [];
      if (stack.some((node) => node?.tagName === 'VIDEO' || node?.tagName === 'AUDIO')) return true;
    }

    let node = element;
    for (let depth = 0; node instanceof Element && depth < 7; depth += 1, node = node.parentElement) {
      const hint = `${node.id || ''} ${String(node.className || '')}`;
      if (!PLAYER_HINT.test(hint) && !node.matches?.(PLAYER_ATTR_SELECTOR)) continue;
      if (node.querySelector?.('video, audio')) return true;
    }
  } catch (_) {}
  return false;
}

function rememberPlayerInteraction(event, element, path) {
  if (!isPlayerInteraction(event, element, path)) return false;
  lastPlayerInteractionAt = Date.now();
  return true;
}

function hasRecentPlayerInteraction() {
  return Date.now() - lastPlayerInteractionAt <= PLAYER_INTERACTION_WINDOW_MS;
}

/** A harmless stand-in returned instead of a real popup window. */
function makeWindowStub(target) {
  const href = target || 'about:blank';
  return {
    closed: true,
    name: '',
    opener: null,
    length: 0,
    focus() {},
    blur() {},
    close() {},
    print() {},
    moveTo() {},
    resizeTo() {},
    scrollTo() {},
    postMessage() {},
    alert() {},
    confirm() { return false; },
    prompt() { return null; },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true; },
    document: {
      write() {},
      writeln() {},
      open() { return this; },
      close() {},
      getElementById() { return null; },
      getElementsByTagName() { return []; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      createElement() { return document.createElement('div'); },
      body: null,
      documentElement: null,
      readyState: 'complete'
    },
    location: {
      href,
      replace() {},
      assign() {},
      reload() {},
      toString() { return href; }
    }
  };
}

/* ------------------------------------------------------------------ */
/* 1. window.open                                                      */
/* ------------------------------------------------------------------ */

function installWindowOpenGuard() {
  const currentOpen = window.open;
  if (typeof currentOpen !== 'function') return;

  // On a later extension reload, `window.open` may still be the wrapper from an
  // orphaned content script. Keep a reference to the *native* opener on every
  // wrapper so the new guard can replace the old one instead of nesting wrappers
  // (nested old wrappers retain stale settings and a dead chrome context).
  const nativeOpen = currentOpen.__easywebNativeOpen || currentOpen;

  const guarded = function (url, name, features) {
    // An orphaned wrapper from a reloaded extension must defer to the browser;
    // the freshly injected wrapper (if any) is now the one that decides.
    if (!hasLiveExtensionContext()) return nativeOpen.call(window, url, name, features);
    if (!active) return nativeOpen.call(window, url, name, features);

    const target = resolveUrl(url);
    const host = normalizeHost(target);

    if (target && host) {
      if (isAuthHost(host, guardConfig?.allowedHosts)) {
        return nativeOpen.call(window, url, name, features);
      }
      if (sameSite(host, location.hostname)) {
        return nativeOpen.call(window, url, name, features);
      }

      // Player controls (seek, fullscreen, volume, play) are never consent to
      // leave the site. This must run before userActivation: hostile scripts
      // call window.open synchronously inside the trusted control click.
      if (guardConfig?.blockFromMedia !== false && hasRecentPlayerInteraction()) {
        report({ popups: 1, total: 1 });
        return makeWindowStub(target);
      }

      // Pop-under: a window opened while the page is being torn down.
      if (pageUnloading) {
        report({ popups: 1, total: 1 });
        return makeWindowStub(target);
      }

      if (isKnownAdHost(host)) {
        report({ popups: 1, total: 1 });
        return makeWindowStub(target);
      }

      // Third-party popup guard: if the user did not click on a link pointing to this destination host
      if (guardConfig?.blockThirdPartyPopup) {
        const matchingLink = lastGestureHref && sameSite(normalizeHost(lastGestureHref), host) && (Date.now() - lastGestureAt <= 2000);
        if (!matchingLink) {
          report({ popups: 1, total: 1 });
          return makeWindowStub(target);
        }
      }

      // No user activation whatsoever — nothing the visitor did caused this.
      const activated = navigator.userActivation ? navigator.userActivation.isActive : true;
      if (!activated && !pageUnloading) {
        report({ popups: 1, total: 1 });
        return makeWindowStub(target);
      }
    } else {
      if (guardConfig?.blockFromMedia !== false && hasRecentPlayerInteraction()) {
        report({ popups: 1, total: 1 });
        return makeWindowStub(target);
      }
      const activated = navigator.userActivation ? navigator.userActivation.isActive : true;
      if (!activated && !pageUnloading && guardConfig?.blockWithoutGesture) {
        report({ popups: 1, total: 1 });
        return makeWindowStub(target);
      }
    }

    return nativeOpen.call(window, url, name, features);
  };

  guarded.__easywebGuarded = true;
  guarded.__easywebNativeOpen = nativeOpen;
  try {
    window.open = guarded;
  } catch (_) {}
}

/* ------------------------------------------------------------------ */
/* 2. Click / auxclick guard                                           */
/* ------------------------------------------------------------------ */

function findAnchor(path) {
  for (const node of path) {
    if (node instanceof Element && node.tagName === 'A' && node.hasAttribute('href')) {
      return node;
    }
  }
  return null;
}

/** A link nobody could physically have clicked. */
function isInvisible(el) {
  try {
    const style = getComputedStyle(el);
    if (style.display === 'none') return true;
    if (style.visibility === 'hidden') return true;
    if (Number(style.opacity) < 0.05) return true;
    if (style.pointerEvents === 'none') return true;

    const rect = el.getBoundingClientRect();
    const offScreen = rect.right < -40 || rect.bottom < -40
      || rect.left > window.innerWidth + 40 || rect.top > window.innerHeight + 40;
    if (offScreen) return true;

    // A 1x1 (or smaller) box that the visitor supposedly hit with a mouse.
    if (rect.width <= 1 && rect.height <= 1) return true;
    return false;
  } catch (_) {
    return false;
  }
}

/**
 * Is the clicked element a transparent layer stacked above a video player?
 * Returns the video element it is covering, or null.
 */
function findCoveredVideo(event, clicked) {
  if (!clicked || clicked.tagName === 'VIDEO') return null;
  let stack;
  try {
    stack = document.elementsFromPoint(event.clientX, event.clientY);
  } catch (_) {
    return null;
  }
  if (!stack?.length) return null;

  const clickedIndex = stack.indexOf(clicked);
  const videoIndex = stack.findIndex((el) => el?.tagName === 'VIDEO');
  if (videoIndex === -1) return null;
  // The video must be *behind* the clicked element.
  if (clickedIndex !== -1 && videoIndex < clickedIndex) return null;

  const video = stack[videoIndex];
  if (!isOverlayLike(clicked, video)) return null;
  return video;
}

function isOverlayLike(el, video) {
  try {
    if (el.contains(video)) return false;
    if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') return false;

    const style = getComputedStyle(el);
    if (style.position !== 'absolute' && style.position !== 'fixed') return false;

    // Real controls (play button, caption toggle) are interactive elements.
    if (el.querySelector('button, [role="button"], input, select, textarea, a[href], video')) return false;
    if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') return false;

    // Meaningful text means it is content, not a hijack layer.
    if ((el.innerText || '').trim().length > 24) return false;

    // Advertising markers make it unambiguous.
    if (el.matches?.(AD_SELECTOR_HINT) || el.querySelector?.(AD_SELECTOR_HINT)) return true;

    const rect = el.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();
    const videoArea = videoRect.width * videoRect.height;
    if (!videoArea || !rect.width || !rect.height) return false;

    const overlapX = Math.max(0, Math.min(rect.right, videoRect.right) - Math.max(rect.left, videoRect.left));
    const overlapY = Math.max(0, Math.min(rect.bottom, videoRect.bottom) - Math.max(rect.top, videoRect.top));
    const coverage = (overlapX * overlapY) / videoArea;

    // Must be empty (no text, no controls) and cover most of the player.
    return coverage > 0.5;
  } catch (_) {
    return false;
  }
}

function neutralizeOverlay(el) {
  try {
    el.setAttribute(OVERLAY_ATTR, 'true');
    el.style.setProperty('pointer-events', 'none', 'important');
  } catch (_) {}
}

/** Re-issue the click on whatever sits underneath the neutralised overlay. */
function forwardClick(event) {
  let target = null;
  try {
    target = document.elementFromPoint(event.clientX, event.clientY);
  } catch (_) {}
  if (!target) return;

  const base = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
    button: 0,
    buttons: 1
  };

  forwarding = true;
  try {
    if (typeof PointerEvent === 'function') {
      target.dispatchEvent(new PointerEvent('pointerdown', base));
    }
    target.dispatchEvent(new MouseEvent('mousedown', base));
    if (typeof PointerEvent === 'function') {
      target.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0 }));
    }
    target.dispatchEvent(new MouseEvent('mouseup', { ...base, buttons: 0 }));
    target.dispatchEvent(new MouseEvent('click', { ...base, buttons: 0 }));
  } catch (_) {}
  setTimeout(() => { forwarding = false; }, 0);
}

function stopEvent(event) {
  try {
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
  } catch (_) {}
}

function onCaptureClick(event) {
  if (!hasLiveExtensionContext()) return;
  if (!active || forwarding) return;
  // The element picker needs to receive the click it was invoked for; blocking
  // it here would make it impossible to pick an ad link or an overlay.
  if (window[PICKER_FLAG]) return;
  if (event.defaultPrevented && !event.isTrusted) return;

  const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
  const clicked = event.target instanceof Element ? event.target : null;
  const onPlayer = rememberPlayerInteraction(event, clicked, path);
  const anchor = findAnchor(path);

  // (a) Hijack overlay sitting on top of a video player.
  const coveredVideo = findCoveredVideo(event, clicked);
  if (coveredVideo) {
    neutralizeOverlay(clicked);
    stopEvent(event);
    report({ cosmetic: 1, total: 1 });
    forwardClick(event);
    return;
  }

  if (!anchor) return;

  const host = normalizeHost(anchor.href);
  const isExternal = host && !sameSite(host, location.hostname);

  // A player control wrapped in a visible external link is the exact technique
  // used by many video sites. Stop the navigation here, before the site handler
  // sees it, even when the destination is too new to be in an ad-host list.
  if (onPlayer && isExternal && guardConfig?.blockFromMedia !== false && !isAuthHost(host, guardConfig?.allowedHosts)) {
    stopEvent(event);
    report({ popups: 1, total: 1 });
    return;
  }

  // (b) A link the visitor could not possibly have clicked.
  if (isInvisible(anchor)) {
    stopEvent(event);
    report({ popups: 1, total: 1 });
    return;
  }

  // (c) A visible link straight to an advertising destination.
  if (isExternal && isKnownAdHost(host)) {
    stopEvent(event);
    report({ popups: 1, total: 1 });
    return;
  }

  // (d) Programmatic click on an external link — the classic auto-popup trick.
  if (!event.isTrusted && isExternal && anchor.target === '_blank') {
    stopEvent(event);
    report({ popups: 1, total: 1 });
  }
}

function onCaptureAuxClick(event) {
  if (!hasLiveExtensionContext()) return;
  if (!active || event.button !== 1) return;
  if (window[PICKER_FLAG]) return;
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
  const clicked = event.target instanceof Element ? event.target : null;
  const onPlayer = rememberPlayerInteraction(event, clicked, path);
  const anchor = findAnchor(path);
  if (!anchor) return;
  if (isInvisible(anchor)) {
    stopEvent(event);
    return;
  }
  const host = normalizeHost(anchor.href);
  if (host && !sameSite(host, location.hostname)
    && ((onPlayer && guardConfig?.blockFromMedia !== false && !isAuthHost(host, guardConfig?.allowedHosts))
      || isKnownAdHost(host))) {
    stopEvent(event);
    report({ popups: 1, total: 1 });
  }
}

/* ------------------------------------------------------------------ */
/* 3. Gesture reporting                                                */
/* ------------------------------------------------------------------ */

function onGesture(event) {
  if (!hasLiveExtensionContext()) return;
  if (!active) return;
  if (window[PICKER_FLAG]) return;

  const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
  const el = event.target instanceof Element ? event.target : null;
  // This is intentionally before the throttled report: window.open can happen
  // synchronously in the same click, and the wrapper needs this flag immediately.
  const onPlayer = rememberPlayerInteraction(event, el, path);
  let anchor = null;
  try {
    anchor = el?.closest?.('a[href]') || null;
  } catch (_) {}

  lastGestureHref = anchor?.href || '';
  lastGestureAt = Date.now();

  const now = Date.now();
  if (now - lastGestureReport < 90) return;
  lastGestureReport = now;

  const gesture = {
    href: anchor?.href || '',
    isLink: Boolean(anchor),
    onOverlay: Boolean(el?.closest?.(`[${OVERLAY_ATTR}]`)),
    onMedia: Boolean(el?.tagName === 'VIDEO' || el?.tagName === 'AUDIO' || el?.closest?.('video, audio')),
    onPlayer
  };

  try {
    chrome.runtime.sendMessage({ type: 'USER_GESTURE', gesture });
  } catch (_) {}
}

function onKeyGesture(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  onGesture(event);
}

/* ------------------------------------------------------------------ */
/* 4. Pop-unders triggered while the page is closing                   */
/* ------------------------------------------------------------------ */

function markUnloading() {
  pageUnloading = true;
}

/* ------------------------------------------------------------------ */
/* Installation                                                        */
/* ------------------------------------------------------------------ */
function installInteractionGuard({ guard, isActive }) {
  guardConfig = guard || {};
  active = Boolean(isActive);

  installWindowOpenGuard();

  // Listeners are attached unconditionally (each handler exits immediately when
  // the guard is inactive) so a later settings change takes effect without a
  // page reload.
  document.addEventListener('click', onCaptureClick, true);
  document.addEventListener('auxclick', onCaptureAuxClick, true);
  // pointerdown/touchstart happen before a player can synchronously call
  // window.open; mousedown remains for older browsers and mouse-only players.
  document.addEventListener('pointerdown', onGesture, true);
  document.addEventListener('touchstart', onGesture, true);
  document.addEventListener('mousedown', onGesture, true);
  document.addEventListener('auxclick', onGesture, true);
  document.addEventListener('keydown', onKeyGesture, true);

  window.addEventListener('beforeunload', markUnloading, true);
  window.addEventListener('pagehide', markUnloading, true);
}

/** Allow the page to be re-evaluated when settings change. */
function setGuardActive(next) {
  active = Boolean(next);
}
function updateGuardConfig(next) {
  guardConfig = next || guardConfig;
}

// --- Module: content/features/guard-boot.js ---
/**
 * EasyWeb Ad Blocker — Guard Bootstrap
 *
 * Installs the document_start interaction guard and keeps its settings fresh.
 * Shared by two callers:
 *   • guard.js  — the manifest content script, which runs at document_start
 *   • content.js — which calls it again on (re-)injection, so the guard comes
 *     back to life on pages that were already open when the extension reloaded
 *
 * `claimInstance` makes this safe to call repeatedly: a live guard of the same
 * version is never duplicated.
 */






/**
 * Tell the MAIN-world scriptlet engine whether it should act on this page.
 * `window.postMessage` is the only channel that crosses between the isolated
 * content-script world and the page's own context.
 */
function publishScriptletConfig(config, toggles) {
  try {
    window.postMessage({
      source: 'easyweb-isolated',
      type: 'inject-config',
      enabled: config.scriptlets !== false && TOGGLE_KEYS.some((key) => toggles[key])
    }, '*');
  } catch (_) {}
}

/**
 * @returns {boolean} true when this call installed the guard, false when a live
 *   instance already owned the slot.
 */
function bootGuard() {
  if (!isContextValid()) return false;
  if (!claimInstance(GUARD_FLAG)) return false;

  const domain = cleanHostname(location.hostname);

  const apply = (config, site) => {
    const toggles = resolveToggles(config, site, domain);
    injectCosmeticCss({ toggles, config, customRules: config.customRules });
    updateGuardConfig(config.popupGuard || DEFAULT_ADBLOCK.popupGuard);
    setGuardActive(Boolean(toggles.popups));
    publishScriptletConfig(config, toggles);
  };

  // Install with defaults immediately; the stored settings arrive a tick later.
  installInteractionGuard({ guard: DEFAULT_ADBLOCK.popupGuard, isActive: false });

  const load = async () => {
    try {
      const store = await chrome.storage.local.get({
        [ADBLOCK_STORAGE_KEY]: DEFAULT_ADBLOCK,
        [STORAGE_KEY]: {}
      });
      if (!isContextValid()) return;
      const config = { ...DEFAULT_ADBLOCK, ...(store[ADBLOCK_STORAGE_KEY] || {}) };
      apply(config, (store[STORAGE_KEY] || {})[domain] || null);
    } catch (_) {}
  };

  load();

  if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (!changes[ADBLOCK_STORAGE_KEY] && !changes[STORAGE_KEY]) return;
      load();
    });
  }

  return true;
}

// --- Module: content/guard.js ---
/**
 * EasyWeb Ad Blocker — document_start Guard
 *
 * Injected into every frame before the page's own scripts run. Writes the
 * cosmetic stylesheet so ads never flash on first paint, and installs the popup /
 * click-hijack protections.
 *
 * All of the logic lives in `features/guard-boot.js` so that `content.js` can run
 * the exact same bootstrap when it is re-injected into an already-open page —
 * which is how the guard comes back to life after the extension is reloaded.
 */

bootGuard();
})();
