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

// --- Module: shared/models.js ---
/**
 * Site Model, State Synchronization and Migration Helpers
 */
function mergeSite(value = {}) {
  const merged = {
    enabled: Boolean(value?.enabled),
    direction: { ...DEFAULT_SITE.direction, ...(value?.direction || {}) },
    font: { ...DEFAULT_SITE.font, ...(value?.font || {}) },
    translate: { ...DEFAULT_SITE.translate, ...(value?.translate || {}) },
    blocker: mergeBlocker(value?.blocker),
    targets: Array.isArray(value?.targets) ? value.targets.map((t) => ({
      id: t.id || `t${Math.random().toString(36).slice(2, 8)}`,
      selector: t.selector || '',
      label: t.label || t.selector || 'Element',
      direction: t.direction ? { ...DEFAULT_SITE.direction, ...t.direction } : null,
      font: t.font ? { ...DEFAULT_SITE.font, ...t.font } : null,
      translate: t.translate ? { ...DEFAULT_SITE.translate, ...t.translate } : null
    })) : []
  };

  // ponytail: preserve user scope choice without forcing to page when targets empty
  merged.direction.scope = value?.direction?.scope === 'element' ? 'element' : 'page';
  merged.font.scope = value?.font?.scope === 'element' ? 'element' : 'page';
  merged.translate.scope = value?.translate?.scope === 'element' ? 'element' : 'page';

  syncSiteEnabled(merged);
  return merged;
}

/**
 * Normalise a per-site blocker configuration.
 * `toggles` stays `null` unless the user explicitly customised them, so that
 * mode presets keep working after the global defaults change.
 */
function mergeBlocker(value) {
  if (!value || typeof value !== 'object') return { ...DEFAULT_BLOCKER, picked: [] };
  const toggles = value.toggles && typeof value.toggles === 'object'
    ? Object.fromEntries(Object.entries(value.toggles).map(([k, v]) => [k, Boolean(v)]))
    : null;
  return {
    enabled: value.enabled === undefined ? DEFAULT_BLOCKER.enabled : Boolean(value.enabled),
    mode: typeof value.mode === 'string' ? value.mode : DEFAULT_BLOCKER.mode,
    toggles,
    picked: normalizePickedRules(value.picked)
  };
}
function migrateSite(value) {
  const merged = mergeSite(value);

  if (value?.direction?.scope === 'element' && value.direction.selector && !merged.targets.some((t) => t.selector === value.direction.selector)) {
    merged.targets.push({
      id: `t${Math.random().toString(36).slice(2, 8)}`,
      selector: value.direction.selector,
      label: value.direction.label || value.direction.selector,
      direction: { ...DEFAULT_SITE.direction, ...value.direction },
      font: null,
      translate: null
    });
  }

  if (value?.font?.scope === 'element' && value.font.selector) {
    const existing = merged.targets.find((t) => t.selector === value.font.selector);
    if (existing) {
      existing.font = { ...DEFAULT_SITE.font, ...value.font };
    } else {
      merged.targets.push({
        id: `t${Math.random().toString(36).slice(2, 8)}`,
        selector: value.font.selector,
        label: value.font.label || value.font.selector,
        direction: null,
        font: { ...DEFAULT_SITE.font, ...value.font },
        translate: null
      });
    }
  }

  if (value?.translate?.scope === 'element' && value.translate.selector) {
    const existing = merged.targets.find((t) => t.selector === value.translate.selector);
    if (existing) {
      existing.translate = { ...DEFAULT_SITE.translate, ...value.translate };
    } else {
      merged.targets.push({
        id: `t${Math.random().toString(36).slice(2, 8)}`,
        selector: value.translate.selector,
        label: value.translate.label || value.translate.selector,
        direction: null,
        font: null,
        translate: { ...DEFAULT_SITE.translate, ...value.translate }
      });
    }
  }

  // ponytail: preserve user scope choice without forcing to page when targets empty
  merged.direction.scope = value?.direction?.scope === 'element' ? 'element' : 'page';
  merged.font.scope = value?.font?.scope === 'element' ? 'element' : 'page';
  merged.translate.scope = value?.translate?.scope === 'element' ? 'element' : 'page';

  if (value && value.enabled === undefined) {
    const dirActive = merged.direction.scope === 'page' ? merged.direction.enabled : merged.targets.some((t) => t.direction?.enabled);
    const fontActive = merged.font.scope === 'page' ? merged.font.enabled : merged.targets.some((t) => t.font?.enabled);
    const transActive = merged.translate.scope === 'page' ? merged.translate.enabled : merged.targets.some((t) => t.translate?.enabled);
    merged.enabled = dirActive || fontActive || transActive;
  }
  return merged;
}
function syncSiteEnabled(site) {
  if (!site) return false;
  const dirScope = site.direction?.scope || 'page';
  const fontScope = site.font?.scope || 'page';
  const transScope = site.translate?.scope || 'page';

  const dirActive = dirScope === 'page' ? Boolean(site.direction?.enabled) : (Array.isArray(site.targets) && site.targets.some((t) => t.direction?.enabled));
  const fontActive = fontScope === 'page' ? Boolean(site.font?.enabled) : (Array.isArray(site.targets) && site.targets.some((t) => t.font?.enabled));
  const transActive = transScope === 'page' ? Boolean(site.translate?.enabled) : (Array.isArray(site.targets) && site.targets.some((t) => t.translate?.enabled));

  site.enabled = dirActive || fontActive || transActive;
  return site.enabled;
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

// --- Module: popup/state.js ---
/**
 * Reactive Popup State Management
 */
const state = {
  domain: '',
  tabId: null,
  site: structuredClone(DEFAULT_SITE),
  fonts: [],
  activeTargetId: null,
  openPanels: [],
  adblock: null,
  /** How a newly picked advertising section should be neutralised. */
  adPickMode: 'hide'
};
const $ = (id) => document.getElementById(id);
function setStatus(message, error = false) {
  const node = $('status');
  if (!node) return;
  node.textContent = message;
  node.style.color = error ? '#ff8d9c' : '';
}
function activeTarget(feature) {
  return state.site.targets.find((t) => t.id === state.activeTargetId) || null;
}
async function getStorage() {
  return chrome.storage.local.get(DEFAULTS);
}
async function ensureContentScript() {
  if (!state.tabId) return false;
  let alive = false;
  try {
    const status = await chrome.tabs.sendMessage(state.tabId, { type: 'PING' });
    // Compare against the live VERSION constant. A hardcoded value here used to
    // make every popup interaction re-inject content.js, which left two content
    // script instances running on the page.
    alive = !!(status?.ok && (!status.version || status.version === VERSION));
  } catch (_) {}
  if (alive) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId: state.tabId }, files: ['content.js'] });
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Send a message to the active tab, re-injecting the content script first when
 * it is missing or orphaned.
 *
 * This is what removes the need for a manual page refresh: after the extension
 * is reloaded, every already-open page has a dead content script, and a plain
 * `tabs.sendMessage` would simply fail.
 */
async function messageTab(message) {
  if (!state.tabId) return false;
  try {
    const ready = await ensureContentScript();
    if (!ready) return false;
    await chrome.tabs.sendMessage(state.tabId, message);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Instant live preview: sends current settings directly to the page content script
 * without awaiting PING roundtrips or disk storage writes.
 */
async function applyLive() {
  if (!state.tabId) return false;
  syncSiteEnabled(state.site);
  try {
    const res = await chrome.tabs.sendMessage(state.tabId, {
      type: 'APPLY_SETTINGS',
      settings: state.site,
      fonts: state.fonts
    });
    if (res?.ok) return true;
  } catch (_) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: state.tabId }, files: ['content.js'] });
      const retry = await chrome.tabs.sendMessage(state.tabId, {
        type: 'APPLY_SETTINGS',
        settings: state.site,
        fonts: state.fonts
      });
      return !!retry?.ok;
    } catch (_) {
      return false;
    }
  }
  return false;
}

let saveTimer = null;

/**
 * Schedule site persistence to storage with debounce for responsive input typing.
 */
function scheduleSaveSite(delay = 120) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveSite();
  }, delay);
}
async function pushSettings() {
  return applyLive();
}
async function saveSite() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!state.domain) return;
  syncSiteEnabled(state.site);
  // Apply changes to the active tab in real time
  applyLive();
  try {
    const store = await getStorage();
    const settingsMap = store.settings || {};
    settingsMap[state.domain] = state.site;
    await chrome.storage.local.set({ settings: settingsMap });
    if (state.tabId) {
      setStatus('✓ ذخیره و اعمال شد');
    } else {
      setStatus('✓ ذخیره شد');
    }
  } catch (err) {
    console.error('[EasyWeb Save Error]:', err);
    setStatus('خطا در ذخیره‌سازی', true);
  }
}

/**
 * Re-read the current domain's stored site object.
 *
 * The ad-blocker card writes through the background worker (which merges into
 * the same storage entry), so the popup's cached copy has to be refreshed
 * before `saveSite()` writes the whole object back — otherwise it would clobber
 * the blocker settings.
 */
async function reloadSite() {
  if (!state.domain) return state.site;
  try {
    const store = await getStorage();
    state.site = migrateSite((store.settings || {})[state.domain]);
  } catch (_) {}
  return state.site;
}
async function highlightOnPage(selector) {
  if (!state.tabId || !selector) return;
  await chrome.tabs.sendMessage(state.tabId, { type: 'HIGHLIGHT', selector }).catch(() => {});
}
async function clearHighlightOnPage() {
  if (!state.tabId) return;
  await chrome.tabs.sendMessage(state.tabId, { type: 'CLEAR_HIGHLIGHT' }).catch(() => {});
}

// --- Module: popup/components/scope-tabs.js ---
/**
 * Scope Tabs Component (Entire Page vs Selected Sections)
 */
function bindScopeTabs(renderCallback) {
  document.querySelectorAll('.scope-tab').forEach((btn) => {
    btn.onclick = async () => {
      const feature = btn.dataset.feature;
      const scope = btn.dataset.scope;
      if (!state.site[feature]) state.site[feature] = {};
      state.site[feature].scope = scope;

      if (scope === 'element') {
        const first = state.site.targets.find((t) => t[feature]?.enabled || t[feature]);
        if (first) state.activeTargetId = first.id;
        $(`${feature}-advanced`)?.classList.add('open');
      } else {
        state.activeTargetId = null;
      }

      syncSiteEnabled(state.site);
      applyLive();
      renderCallback();
      await saveSite();
    };
  });
}
function renderScopeTabs() {
  const dirScope = state.site.direction.scope || 'page';
  const fontScope = state.site.font.scope || 'page';
  const transScope = state.site.translate?.scope || 'page';

  document.querySelectorAll('.scope-tab[data-feature="direction"]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.scope === dirScope);
  });
  document.querySelectorAll('.scope-tab[data-feature="font"]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.scope === fontScope);
  });
  document.querySelectorAll('.scope-tab[data-feature="translate"]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.scope === transScope);
  });
}

// --- Module: popup/components/targets-list.js ---
/**
 * Interactive Targets List Component
 */
function renderTargets(feature, renderCallback) {
  const listId = feature === 'direction' ? 'direction-targets' : feature === 'translate' ? 'translate-targets' : 'font-targets';
  const list = $(listId);
  if (!list) return;
  list.replaceChildren();

  const targets = state.site.targets.filter((t) => {
    if (feature === 'direction') return t.direction?.enabled;
    if (feature === 'translate') return t.translate?.enabled;
    return t.font?.enabled;
  });
  if (!targets.length) return;

  targets.forEach((target) => {
    const row = document.createElement('div');
    const isActive = state.activeTargetId === target.id;
    row.className = 'target-row' + (isActive ? ' active' : '');

    const info = document.createElement('div');
    info.className = 'target-info';
    info.style.display = 'flex';
    info.style.flexDirection = 'column';
    info.style.cursor = 'pointer';
    info.style.overflow = 'hidden';
    info.style.flex = '1';

    const label = document.createElement('span');
    label.className = 'target-label';
    label.textContent = target.label || target.selector;
    label.title = target.selector;

    const sub = document.createElement('span');
    sub.className = 'target-sub';
    sub.style.fontSize = '8px';
    sub.style.color = isActive ? '#27c8ba' : '#8f93b3';

    if (feature === 'font' && target.font) {
      const rawFont = target.font.family || 'Default';
      const fontName = rawFont.replace(/['"]/g, '').split(',')[0].trim();
      sub.textContent = `${fontName} · ${target.font.size || 16}${target.font.unit || 'px'} · w${target.font.weight || 400}`;
    } else if (feature === 'direction' && target.direction) {
      sub.textContent = target.direction.value === 'rtl' ? 'RTL · راست‌چین' : 'LTR · چپ‌چین';
    } else if (feature === 'translate' && target.translate) {
      sub.textContent = `ترجمه به ${target.translate.targetLang || 'fa'} · ${target.translate.engine || 'google'}`;
    }

    info.append(label, sub);
    info.onclick = () => {
      state.activeTargetId = state.activeTargetId === target.id ? null : target.id;
      renderCallback();
    };
    row.append(info);

    const actions = document.createElement('span');
    actions.className = 'target-actions';

    const show = document.createElement('button');
    show.className = 'target-show';
    show.textContent = '⌖';
    show.title = 'Show on page';
    show.onclick = (e) => {
      e.stopPropagation();
      highlightOnPage(target.selector);
    };

    const remove = document.createElement('button');
    remove.className = 'target-remove';
    remove.textContent = '✕';
    remove.title = 'Remove';
    remove.onclick = async (e) => {
      e.stopPropagation();
      const selector = target.selector;
      state.site.targets = state.site.targets.filter((t) => t.id !== target.id);
      if (state.activeTargetId === target.id) state.activeTargetId = null;

      if (feature === 'translate' || target.translate) {
        if (state.tabId) {
          await chrome.tabs.sendMessage(state.tabId, { type: 'RESTORE_TRANSLATION', selector }).catch(() => {});
        }
      }

      renderCallback();
      await saveSite();
      if (feature === 'translate' || target.translate) {
        setStatus('✓ بخش انتخابی حذف و متن آن به حالت اصلی بازگردانده شد');
      }
    };

    actions.append(show, remove);
    row.append(actions);
    row.addEventListener('mouseenter', () => highlightOnPage(target.selector));
    row.addEventListener('mouseleave', () => clearHighlightOnPage());
    list.append(row);
  });
}

// --- Module: popup/components/layout-card.js ---
/**
 * Layout / Direction Card Controller
 */
function bindLayoutCard(renderCallback) {
  $('layout-card')?.querySelector('.eyebrow')?.addEventListener('click', () => {
    $('layout-card')?.classList.toggle('collapsed');
  });

  $('direction-target').onclick = () => {
    state.activeTargetId = null;
    renderCallback();
  };

  $('direction-enabled').onchange = async () => {
    const checked = $('direction-enabled').checked;
    const scope = state.site.direction.scope || 'page';

    if (checked) {
      if (scope === 'element') {
        const targets = state.site.targets || [];
        const dirTargets = targets.filter((t) => t.direction);
        if (dirTargets.length > 0) {
          const target = activeTarget('direction') || dirTargets[0];
          target.direction = target.direction || { ...DEFAULT_SITE.direction, enabled: true, value: $('direction-value').value };
          target.direction.enabled = true;
        } else if (targets.length > 0) {
          targets[0].direction = { ...DEFAULT_SITE.direction, enabled: true, value: $('direction-value').value };
          state.activeTargetId = targets[0].id;
        } else {
          startPicker('direction');
          return;
        }
      } else {
        state.site.direction.scope = 'page';
        state.site.direction.enabled = true;
      }
    } else {
      if (scope === 'element') {
        if (Array.isArray(state.site.targets)) {
          state.site.targets.forEach((t) => {
            if (t.direction) t.direction.enabled = false;
          });
        }
      } else {
        state.site.direction.enabled = false;
      }
    }
    syncSiteEnabled(state.site);
    applyLive();
    renderCallback();
    await saveSite();
  };

  const onDirChange = () => {
    const scope = state.site.direction.scope || 'page';
    const val = $('direction-value').value;
    if (scope === 'element') {
      const target = activeTarget('direction');
      if (target) {
        target.direction = { ...target.direction, enabled: true, value: val, scope: 'element' };
      } else if (Array.isArray(state.site.targets) && state.site.targets.length) {
        state.site.targets.forEach((t) => {
          if (t.direction) {
            t.direction.value = val;
            t.direction.enabled = true;
          }
        });
      }
    } else {
      state.site.direction.enabled = true;
      state.site.direction.value = val;
      state.site.direction.scope = 'page';
    }
    syncSiteEnabled(state.site);
    $('direction-enabled').checked = true;
    $('layout-card')?.classList.remove('collapsed');
    applyLive();
    scheduleSaveSite(100);
  };

  $('direction-value').onchange = onDirChange;
  $('direction-value').oninput = onDirChange;

  $('pick-direction').onclick = () => startPicker('direction');

  $('reset-direction').onclick = async () => {
    state.site.direction = structuredClone(DEFAULT_SITE.direction);
    state.site.targets = state.site.targets.map((t) => ({ ...t, direction: null }));
    syncSiteEnabled(state.site);
    applyLive();
    renderCallback();
    await saveSite();
  };
}
function renderLayoutCard() {
  const dirScope = state.site.direction.scope || 'page';
  const hasDirTargets = Array.isArray(state.site.targets) && state.site.targets.some((t) => t.direction?.enabled);
  const dirOn = dirScope === 'page' ? Boolean(state.site.direction?.enabled) : hasDirTargets;
  $('direction-enabled').checked = dirOn;
  const shouldCollapse = !dirOn && dirScope === 'page';
  $('layout-card')?.classList.toggle('collapsed', shouldCollapse);

  const dirTarget = dirScope === 'element' ? activeTarget('direction') : null;
  const dirCfg = dirTarget?.direction || state.site.direction;

  $('direction-value').value = dirCfg.value || 'rtl';
  if ($('direction-target')) {
    $('direction-target').innerHTML = dirTarget
      ? `<b>Segment:</b> ${dirTarget.label} <span style="font-size:8px;color:#b8b2ff">(Click for Page)</span>`
      : (dirScope === 'element' ? 'Scope: <b>Sections</b> (Click ＋ to Add)' : 'Scope: <b>Page</b>');
  }
}

async function startPicker(feature) {
  if (!state.tabId) return setStatus('Open a web page first', true);
  const ready = await ensureContentScript();
  if (!ready) return setStatus('Picker unavailable', true);
  const result = await chrome.tabs.sendMessage(state.tabId, { type: 'START_PICKER', feature }).catch(() => null);
  // ponytail: close popup so user sees page and can click element
  if (result?.ok) {
    window.close();
  } else {
    setStatus('Picker unavailable', true);
  }
}

// --- Module: popup/components/type-card.js ---
/**
 * Type / Typography Card Controller
 */
function bindTypeCard(renderCallback) {
  $('type-card')?.querySelector('.eyebrow')?.addEventListener('click', () => {
    $('type-card')?.classList.toggle('collapsed');
  });

  $('font-target').onclick = () => {
    state.activeTargetId = null;
    renderCallback();
  };

  $('font-enabled').onchange = async () => {
    const checked = $('font-enabled').checked;
    const scope = state.site.font.scope || 'page';

    if (checked) {
      if (scope === 'element') {
        const targets = state.site.targets || [];
        const fontTargets = targets.filter((t) => t.font);
        if (fontTargets.length > 0) {
          const target = activeTarget('font') || fontTargets[0];
          target.font = target.font || { ...DEFAULT_SITE.font, enabled: true };
          target.font.enabled = true;
        } else if (targets.length > 0) {
          targets[0].font = { ...DEFAULT_SITE.font, enabled: true };
          state.activeTargetId = targets[0].id;
        } else {
          startPicker('font');
          return;
        }
      } else {
        state.site.font.scope = 'page';
        state.site.font.enabled = true;
      }
    } else {
      if (scope === 'element') {
        if (Array.isArray(state.site.targets)) {
          state.site.targets.forEach((t) => {
            if (t.font) t.font.enabled = false;
          });
        }
      } else {
        state.site.font.enabled = false;
      }
    }
    syncSiteEnabled(state.site);
    applyLive();
    renderCallback();
    await saveSite();
  };

  const onFamilyChange = () => {
    const scope = state.site.font.scope || 'page';
    const val = $('font-family').value;
    if (scope === 'element') {
      const target = activeTarget('font');
      if (target) {
        target.font = { ...target.font, enabled: true, scope: 'element', family: val };
      } else if (Array.isArray(state.site.targets) && state.site.targets.length) {
        state.site.targets.forEach((t) => {
          if (t.font) {
            t.font.family = val;
            t.font.enabled = true;
          }
        });
      }
    } else {
      state.site.font.enabled = true;
      state.site.font.family = val;
      state.site.font.scope = 'page';
    }
    syncSiteEnabled(state.site);
    $('font-enabled').checked = true;
    $('type-card')?.classList.remove('collapsed');
    applyLive();
    scheduleSaveSite(100);
  };

  $('font-family').onchange = onFamilyChange;
  $('font-family').oninput = onFamilyChange;

  const fields = [
    ['font-size', 'size'],
    ['font-unit', 'unit'],
    ['line-height', 'lineHeight'],
    ['font-weight', 'weight'],
    ['text-align', 'align']
  ];

  fields.forEach(([id, key]) => {
    const handler = () => {
      const scope = state.site.font.scope || 'page';
      const rawVal = $(id).value;
      let val = rawVal;
      if (key === 'size') val = Math.max(8, Math.min(96, Number(rawVal) || 16));
      if (key === 'weight') val = Math.max(100, Math.min(1000, Number(rawVal) || 400));

      if (scope === 'element') {
        const target = activeTarget('font');
        if (target) {
          target.font = { ...target.font, enabled: true, scope: 'element', [key]: val };
        } else if (Array.isArray(state.site.targets) && state.site.targets.length) {
          state.site.targets.forEach((t) => {
            if (t.font) {
              t.font[key] = val;
              t.font.enabled = true;
            }
          });
        }
      } else {
        state.site.font.enabled = true;
        state.site.font[key] = val;
        state.site.font.scope = 'page';
      }
      syncSiteEnabled(state.site);
      $('font-enabled').checked = true;
      $('type-card')?.classList.remove('collapsed');
      applyLive();
      scheduleSaveSite(150);
    };

    $(id).oninput = handler;
    $(id).onchange = handler;
  });

  $('pick-font').onclick = () => startPicker('font');

  $('reset-font').onclick = async () => {
    state.site.font = structuredClone(DEFAULT_SITE.font);
    state.site.targets = state.site.targets.map((t) => ({ ...t, font: null }));
    syncSiteEnabled(state.site);
    applyLive();
    renderCallback();
    await saveSite();
  };

  $('font-upload').onchange = async (event) => {
    await uploadFont(event, renderCallback);
  };
}
function renderTypeCard(renderCallback) {
  const fontScope = state.site.font.scope || 'page';
  const hasFontTargets = Array.isArray(state.site.targets) && state.site.targets.some((t) => t.font?.enabled);
  const fontOn = fontScope === 'page' ? Boolean(state.site.font?.enabled) : hasFontTargets;
  $('font-enabled').checked = fontOn;
  const shouldCollapse = !fontOn && fontScope === 'page';
  $('type-card')?.classList.toggle('collapsed', shouldCollapse);

  const fontTarget = fontScope === 'element' ? activeTarget('font') : null;
  const fontCfg = fontTarget?.font || state.site.font;

  if ($('font-target')) {
    $('font-target').innerHTML = fontTarget
      ? `<b>Segment:</b> ${fontTarget.label} <span style="font-size:8px;color:#b8b2ff">(Click for Page)</span>`
      : (fontScope === 'element' ? 'Scope: <b>Sections</b> (Click ＋ to Add)' : 'Scope: <b>Page</b>');
  }

  const active = document.activeElement;
  const isEditing = (id) => active && active.id === id;

  if (!isEditing('font-size')) $('font-size').value = fontCfg.size || 16;
  if (!isEditing('font-unit')) $('font-unit').value = fontCfg.unit || 'px';
  if (!isEditing('line-height')) $('line-height').value = fontCfg.lineHeight || '1.6';
  if (!isEditing('font-weight')) $('font-weight').value = fontCfg.weight || 400;
  if (!isEditing('text-align')) $('text-align').value = fontCfg.align || 'start';

  renderFontOptions();
  renderCustomFonts(renderCallback);
}

function renderFontOptions() {
  const select = $('font-family');
  if (!select) return;
  const fontTarget = activeTarget('font');
  const current = fontTarget?.font?.family || state.site.font.family;

  const allFonts = [
    ...DEFAULT_FONTS,
    ...state.fonts.map((f) => ({ name: f.name, family: `'${f.name.replaceAll("'", "\\'")}'` }))
  ];

  if (select.children.length !== allFonts.length) {
    select.innerHTML = '';
    allFonts.forEach((f) => {
      const opt = document.createElement('option');
      opt.value = f.family;
      opt.textContent = f.name;
      select.append(opt);
    });
  }

  if (select.value !== current) {
    select.value = current;
    if (select.value !== current) {
      const match = Array.from(select.options).find((opt) =>
        opt.value.includes(current) || current.includes(opt.value) ||
        opt.textContent.trim().toLowerCase() === current.trim().toLowerCase()
      );
      if (match) select.value = match.value;
      else select.value = DEFAULT_FONTS[0].family;
    }
  }
}

function renderCustomFonts(renderCallback) {
  const list = $('custom-fonts-list');
  if (!list) return;
  list.replaceChildren();

  if (!state.fonts || !state.fonts.length) return;

  state.fonts.forEach((f) => {
    const row = document.createElement('div');
    row.className = 'custom-font-item';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'custom-font-name';
    nameSpan.textContent = `🗛 ${f.name} (${f.format || 'font'})`;
    nameSpan.title = f.name;

    const delBtn = document.createElement('button');
    delBtn.className = 'custom-font-del';
    delBtn.textContent = '✕';
    delBtn.title = 'حذف فونت ذخیره شده';
    delBtn.onclick = async (e) => {
      e.stopPropagation();
      state.fonts = state.fonts.filter((item) => item.name !== f.name);
      try {
        await chrome.storage.local.set({ fonts: state.fonts });
        if (state.site.font.family.includes(f.name)) {
          state.site.font.family = DEFAULT_FONTS[0].family;
        }
        if (renderCallback) renderCallback();
        await saveSite();
        setStatus('✓ فونت حذف شد');
      } catch (err) {
        console.error('[EasyWeb Font Delete Error]:', err);
        setStatus('خطا در حذف فونت', true);
      }
    };

    row.append(nameSpan, delBtn);
    list.append(row);
  });
}

async function uploadFont(event, renderCallback) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!/\.(ttf|otf|woff2?|font)$/i.test(file.name) || file.size > 8 * 1024 * 1024) {
    return setStatus('Font file must be under 8 MB', true);
  }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const name = file.name.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[^a-z0-9 _-]/gi, '').trim() || 'Custom Font';
      const extension = file.name.split('.').pop()?.toLowerCase();
      const format = extension === 'woff2' ? 'woff2' : extension === 'woff' ? 'woff' : 'truetype';

      const store = await chrome.storage.local.get({ fonts: [] });
      const currentFonts = store.fonts || [];
      const updatedFonts = [
        ...currentFonts.filter((f) => f.name !== name),
        { name, data: reader.result, type: file.type, format, size: file.size, updatedAt: Date.now() }
      ];

      await chrome.storage.local.set({ fonts: updatedFonts });
      state.fonts = updatedFonts;
      state.site.font.family = `'${name.replaceAll("'", "\\'")}'`;
      state.site.font.enabled = true;
      if (renderCallback) renderCallback();
      await saveSite();
      setStatus('✓ فونت با موفقیت ذخیره و اعمال شد');
    } catch (err) {
      console.error('[EasyWeb Font Save Error]:', err);
      setStatus('خطا در ذخیره فونت: ' + (err.message || ''), true);
    }
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

async function startPicker(feature) {
  if (!state.tabId) return setStatus('Open a web page first', true);
  const ready = await ensureContentScript();
  if (!ready) return setStatus('Picker unavailable', true);
  const result = await chrome.tabs.sendMessage(state.tabId, { type: 'START_PICKER', feature }).catch(() => null);
  // ponytail: close popup so user sees page and can click element
  if (result?.ok) {
    window.close();
  } else {
    setStatus('Picker unavailable', true);
  }
}

// --- Module: popup/components/translate-card.js ---
/**
 * Translate Card Controller with Google and AI Engine Support,
 * Tone / Prompt Customization and Manual On-Demand Execution
 */
function bindTranslateCard(renderCallback) {
  $('translate-card')?.querySelector('.eyebrow')?.addEventListener('click', () => {
    $('translate-card')?.classList.toggle('collapsed');
  });

  $('translate-target').onclick = () => {
    state.activeTargetId = null;
    renderCallback();
  };

  $('translate-enabled').onchange = async () => {
    const checked = $('translate-enabled').checked;
    const scope = state.site.translate?.scope || 'page';

    if (checked) {
      if (scope === 'element') {
        const target = activeTarget('translate') || state.site.targets.find((t) => t.translate) || state.site.targets[0];
        if (target) {
          target.translate = target.translate || { ...DEFAULT_SITE.translate, enabled: true };
          target.translate.enabled = true;
        } else {
          // No targets exist for element scope — switch to page scope and enable
          if (!state.site.translate) state.site.translate = {};
          state.site.translate.scope = 'page';
          state.site.translate.enabled = true;
        }
      } else {
        if (!state.site.translate) state.site.translate = {};
        state.site.translate.scope = 'page';
        state.site.translate.enabled = true;
      }
    } else {
      if (state.site.translate) state.site.translate.enabled = false;
      if (Array.isArray(state.site.targets)) {
        state.site.targets.forEach((t) => {
          if (t.translate) t.translate.enabled = false;
        });
      }
    }
    syncSiteEnabled(state.site);
    applyLive();
    if (!checked) {
      if (state.tabId) {
        await chrome.tabs.sendMessage(state.tabId, { type: 'RESTORE_TRANSLATION' }).catch(() => {});
      }
      setStatus('✓ ترجمه غیرفعال شد و متن اصلی بازگردانده شد');
    }

    renderCallback();
    await saveSite();
  };

  const onLangChange = () => {
    const scope = state.site.translate?.scope || 'page';
    const target = scope === 'element' ? activeTarget('translate') : null;
    const lang = $('translate-target-lang').value;
    if (target) {
      target.translate = { ...target.translate, enabled: true, scope: 'element', targetLang: lang };
    } else {
      state.site.translate.enabled = true;
      state.site.translate.targetLang = lang;
    }
    syncSiteEnabled(state.site);
    applyLive();
    scheduleSaveSite(100);
  };

  $('translate-target-lang').onchange = onLangChange;
  $('translate-target-lang').oninput = onLangChange;

  const onEngineChange = () => {
    const scope = state.site.translate?.scope || 'page';
    const target = scope === 'element' ? activeTarget('translate') : null;
    const engine = $('translate-engine').value;
    if (target) {
      target.translate = { ...target.translate, scope: 'element', engine };
    } else {
      state.site.translate.engine = engine;
    }
    scheduleSaveSite(100);
  };

  $('translate-engine').onchange = onEngineChange;
  $('translate-engine').oninput = onEngineChange;

  if ($('translate-tone')) {
    const onToneChange = () => {
      const scope = state.site.translate?.scope || 'page';
      const target = scope === 'element' ? activeTarget('translate') : null;
      const tone = $('translate-tone').value;
      if (target) {
        target.translate = { ...target.translate, scope: 'element', tone };
      } else {
        state.site.translate.tone = tone;
      }
      scheduleSaveSite(100);
    };
    $('translate-tone').onchange = onToneChange;
    $('translate-tone').oninput = onToneChange;
  }

  if ($('translate-prompt')) {
    $('translate-prompt').oninput = () => {
      const scope = state.site.translate?.scope || 'page';
      const target = scope === 'element' ? activeTarget('translate') : null;
      const customPrompt = $('translate-prompt').value;
      if (target) {
        target.translate = { ...target.translate, scope: 'element', customPrompt };
      } else {
        state.site.translate.customPrompt = customPrompt;
      }
      scheduleSaveSite(200);
    };
  }

  // Manual Trigger: Translate Action Button
  if ($('translate-action-btn')) {
    $('translate-action-btn').onclick = async () => {
      if (!state.tabId) return setStatus('یک صفحه وب را باز کنید', true);
      const ready = await ensureContentScript();
      if (!ready) return setStatus('اسکریپت صفحه در دسترس نیست', true);

      const scope = state.site.translate?.scope || 'page';
      const target = scope === 'element' ? activeTarget('translate') : null;
      const transCfg = target?.translate || state.site.translate || DEFAULT_SITE.translate;

      const btn = $('translate-action-btn');
      const originalText = btn.textContent;
      btn.textContent = '⏳ در حال ترجمه...';
      btn.classList.add('loading');
      setStatus('در حال ارسال و ترجمه متن صفحه...');

      try {
        if (scope === 'page') {
          state.site.translate.enabled = true;
        } else if (target) {
          target.translate = target.translate || { ...DEFAULT_SITE.translate };
          target.translate.enabled = true;
        }
        await saveSite();

        const response = await chrome.tabs.sendMessage(state.tabId, {
          type: 'EXECUTE_TRANSLATION',
          targetLang: transCfg.targetLang || $('translate-target-lang')?.value || 'fa',
          engine: transCfg.engine || $('translate-engine')?.value || 'google',
          tone: transCfg.tone || $('translate-tone')?.value || 'standard',
          customPrompt: transCfg.customPrompt || $('translate-prompt')?.value || '',
          scope,
          targetId: target?.id || null
        });

        if (response?.ok) {
          setStatus('✓ ترجمه با موفقیت انجام شد');
        } else {
          setStatus('خطا در ترجمه: ' + (response?.error || 'ناشناخته'), true);
        }
      } catch (err) {
        console.error('[EasyWeb Translate Execute Error]:', err);
        setStatus('خطا در ارتباط با صفحه', true);
      } finally {
        btn.textContent = originalText;
        btn.classList.remove('loading');
        renderCallback();
      }
    };
  }

  $('pick-translate').onclick = () => startPicker('translate');

  $('reset-translate').onclick = async () => {
    if (state.tabId) {
      await chrome.tabs.sendMessage(state.tabId, { type: 'RESTORE_TRANSLATION' }).catch(() => {});
    }
    state.site.translate = structuredClone(DEFAULT_SITE.translate);
    state.site.targets = state.site.targets.map((t) => ({ ...t, translate: null }));
    renderCallback();
    await saveSite();
    setStatus('✓ متن به حالت اصلی بازگردانده شد');
  };
}
function renderTranslateCard() {
  const transScope = state.site.translate?.scope || 'page';
  const hasTransTargets = Array.isArray(state.site.targets) && state.site.targets.some((t) => t.translate);
  const transOn = transScope === 'page'
    ? Boolean(state.site.translate?.enabled)
    : state.site.targets.some((t) => t.translate?.enabled);
  $('translate-enabled').checked = transOn;
  // Switched off -> show only the title and the switch (keep open if user is configuring element scope)
  const shouldCollapse = !transOn && (transScope !== 'element' || hasTransTargets);
  $('translate-card')?.classList.toggle('collapsed', shouldCollapse);

  const transTarget = transScope === 'element' ? activeTarget('translate') : null;
  const transCfg = transTarget?.translate || state.site.translate || DEFAULT_SITE.translate;

  if ($('translate-target')) {
    $('translate-target').innerHTML = transTarget
      ? `<b>Segment:</b> ${transTarget.label} <span style="font-size:8px;color:#b8b2ff">(Click for Page)</span>`
      : (transScope === 'element' ? 'Scope: <b>Sections</b> (Click ＋ to Add)' : 'Scope: <b>Page</b>');
  }

  renderLanguageOptions();
  renderToneOptions();

  $('translate-target-lang').value = transCfg.targetLang || 'fa';
  $('translate-engine').value = transCfg.engine || 'google';

  if ($('translate-tone')) {
    $('translate-tone').value = transCfg.tone || 'standard';
  }
  if ($('translate-prompt')) {
    $('translate-prompt').value = transCfg.customPrompt || '';
  }
}

function renderLanguageOptions() {
  const select = $('translate-target-lang');
  if (!select || select.children.length) return;
  select.innerHTML = '';
  SUPPORTED_LANGUAGES.forEach((lang) => {
    const opt = document.createElement('option');
    opt.value = lang.code;
    opt.textContent = lang.name;
    select.append(opt);
  });
}

function renderToneOptions() {
  const select = $('translate-tone');
  if (!select || select.children.length) return;
  select.innerHTML = '';
  TRANSLATION_TONES.forEach((tone) => {
    const opt = document.createElement('option');
    opt.value = tone.id;
    opt.textContent = tone.name;
    select.append(opt);
  });
}

async function startPicker(feature) {
  if (!state.tabId) return setStatus('Open a web page first', true);
  const ready = await ensureContentScript();
  if (!ready) return setStatus('Picker unavailable', true);
  const result = await chrome.tabs.sendMessage(state.tabId, { type: 'START_PICKER', feature }).catch(() => null);
  if (result?.ok) setStatus('Click an element on the page');
  else setStatus('Picker unavailable', true);
}

// --- Module: popup/components/persian-hint.js ---
/**
 * Persian Detection and Notification Banner
 */
function bindPersianHint(renderCallback) {
  $('persian-apply').onclick = async () => {
    state.site.font.enabled = true;
    state.site.font.scope = 'page';
    state.site.font.family = "'Vazirmatn', 'Tahoma', sans-serif";
    renderCallback();
    await saveSite();
  };

  $('persian-dismiss').onclick = () => {
    $('persian-hint')?.classList.add('hidden');
  };
}
async function checkPersianHint() {
  if (!state.tabId) return;
  const ready = await ensureContentScript();
  if (!ready) return;
  const res = await chrome.tabs.sendMessage(state.tabId, { type: 'GET_PAGE_INFO' }).catch(() => null);
  const info = res?.info;
  if (!info) return;

  if (info.persian) {
    const badge = $('persian-badge');
    if (badge) {
      badge.textContent = info.needsFont ? 'فارسی · no font' : 'فارسی';
      badge.classList.remove('hidden');
      badge.classList.toggle('warn', info.needsFont);
    }
  }

  if (info.persian && info.needsFont && !state.site.enabled) {
    const hintText = $('persian-hint-text');
    if (hintText) hintText.textContent = 'Persian text without a proper Persian font.';
    $('persian-hint')?.classList.remove('hidden');
  }
}

// --- Module: popup/components/adblock-card.js ---
/**
 * Ad Blocker Card Controller
 *
 * Drives the per-site blocker controls in the popup:
 * master switch, mode preset, per-site toggles, list membership and counters.
 */


/** Pull the live blocker state for the active tab from the background worker. */
async function refreshAdblock() {
  try {
    const [status, prefs] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'ADBLOCK_STATUS', tabId: state.tabId || undefined }),
      chrome.storage.local.get({ adPickMode: 'hide' })
    ]);
    if (status?.ok) state.adblock = status;
    state.adPickMode = prefs.adPickMode === 'remove' ? 'remove' : 'hide';
    return status;
  } catch (_) {
    return null;
  }
}

function effectiveToggles() {
  if (state.adblock?.toggles) return { ...state.adblock.toggles };
  return resolveToggles(
    state.adblock?.global || DEFAULT_ADBLOCK,
    state.site,
    state.domain
  );
}

async function setSiteBlocker(patch, renderCallback) {
  if (!state.domain) {
    setStatus('یک صفحه وب را باز کنید', true);
    return;
  }
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'ADBLOCK_SET_SITE',
      domain: state.domain,
      blocker: patch
    });
    if (!response?.ok) setStatus('خطا در ذخیره تنظیمات ادبلاکر', true);
  } catch (err) {
    console.error('[EasyWeb Adblock Save Error]:', err);
    setStatus('ارتباط با افزونه برقرار نشد؛ دوباره تلاش کنید', true);
  } finally {
    // Always re-read from storage. The write may have landed even when the reply
    // never made it back (the service worker can be restarting), and skipping
    // this was what left the list showing stale rules.
    await reloadSite();
    await refreshAdblock();
    // Push the change to the page explicitly, re-injecting the content script if
    // the extension has been reloaded since the page was opened.
    await messageTab({ type: 'RESYNC' });
    renderCallback();
  }
}

async function setListMembership(list, present, renderCallback) {
  if (!state.domain) return;
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'ADBLOCK_SET_LIST',
      list,
      domain: state.domain,
      present
    });
    if (response?.ok) {
      setStatus(present
        ? (list === 'whitelist' ? '✓ به لیست سفید اضافه شد' : '✓ به لیست سیاه اضافه شد')
        : '✓ از لیست حذف شد');
    } else {
      setStatus('خطا در ذخیره لیست', true);
    }
  } catch (err) {
    console.error('[EasyWeb Adblock List Error]:', err);
    setStatus('ارتباط با افزونه برقرار نشد؛ دوباره تلاش کنید', true);
  } finally {
    await reloadSite();
    await refreshAdblock();
    await messageTab({ type: 'RESYNC' });
    renderCallback();
  }
}

/* ---------------- Hand-picked advertising sections ---------------- */

function pickedRules() {
  return Array.isArray(state.site?.blocker?.picked) ? state.site.blocker.picked : [];
}

/** Replace the whole picked list (the background merges it into the site). */
async function writePicked(nextList, renderCallback, message) {
  await setSiteBlocker({ picked: nextList }, renderCallback);
  if (message) setStatus(message);
}

async function updatePickedRule(id, patch, renderCallback) {
  const next = pickedRules().map((rule) => (rule.id === id ? { ...rule, ...patch } : rule));
  await writePicked(next, renderCallback, '✓ ذخیره شد');
}

async function removePickedRule(id, renderCallback) {
  const next = pickedRules().filter((rule) => rule.id !== id);
  await writePicked(next, renderCallback, '✓ قانون حذف شد');
}

/**
 * Close the popup and hand control to the in-page picker. The user then clicks
 * the offending section; the content script persists the rule and applies it.
 */
async function startAdPick() {
  if (!state.tabId) return setStatus('یک صفحه وب را باز کنید', true);

  const ready = await ensureContentScript();
  if (!ready) return setStatus('اسکریپت صفحه در دسترس نیست', true);

  const mode = $('adblock-pick-mode')?.value === 'remove' ? 'remove' : 'hide';
  try {
    await chrome.storage.local.set({ adPickMode: mode });
  } catch (_) {}
  state.adPickMode = mode;

  const result = await chrome.tabs
    .sendMessage(state.tabId, { type: 'START_PICKER', feature: 'adblock', mode })
    .catch(() => null);

  if (result?.ok) window.close();
  else setStatus('انتخاب‌گر در دسترس نیست', true);
}
function bindAdblockCard(renderCallback) {
  $('adblock-enabled').onchange = async () => {
    const checked = $('adblock-enabled').checked;
    try {
      await chrome.runtime.sendMessage({
        type: 'ADBLOCK_UPDATE_GLOBAL',
        patch: { enabled: checked }
      });
      setStatus(checked ? '✓ ادبلاکر برای همه سایت‌ها فعال شد' : '✓ ادبلاکر در همه سایت‌ها غیرفعال شد');
    } catch (_) {
      setStatus('خطا در تغییر وضعیت سراسری ادبلاکر', true);
    } finally {
      await reloadSite();
      await refreshAdblock();
      await messageTab({ type: 'RESYNC' });
      renderCallback();
    }
  };

  const siteToggle = $('adblock-site-toggle');
  if (siteToggle) {
    siteToggle.onchange = async () => {
      const checked = siteToggle.checked;
      const patch = checked
        ? { enabled: true, mode: 'strict' }
        : { enabled: false, mode: 'off' };
      await setSiteBlocker(patch, renderCallback);
      setStatus(checked ? '✓ ادبلاکر در این سایت فعال شد' : '✓ ادبلاکر در این سایت غیرفعال شد');
    };
  }

  if ($('adblock-mode')) {
    $('adblock-mode').onchange = async () => {
      const mode = $('adblock-mode').value;
      await setSiteBlocker({ mode }, renderCallback);
      setStatus('✓ حالت مسدودسازی ذخیره شد');
    };
  }

  $('adblock-whitelist').onclick = async () => {
    const present = !state.adblock?.whitelisted;
    await setListMembership('whitelist', present, renderCallback);
  };

  $('adblock-blacklist').onclick = async () => {
    const present = !state.adblock?.blacklisted;
    await setListMembership('blacklist', present, renderCallback);
  };

  $('adblock-reset-stats').onclick = async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'ADBLOCK_RESET_STATS' });
      await refreshAdblock();
      setStatus('✓ آمار صفر شد');
    } catch (_) {
      setStatus('خطا در صفر کردن آمار', true);
    }
    renderCallback();
  };

  $('adblock-open-settings').onclick = () => openBlockerSettings();

  $('adblock-pick').onclick = () => startAdPick();

  $('adblock-pick-mode').onchange = async () => {
    const mode = $('adblock-pick-mode').value === 'remove' ? 'remove' : 'hide';
    state.adPickMode = mode;
    try {
      await chrome.storage.local.set({ adPickMode: mode });
    } catch (_) {}
    const meta = PICKED_MODES.find((m) => m.id === mode);
    setStatus(meta ? `✓ حالت «${meta.name}» انتخاب شد` : '✓ ذخیره شد');
  };
}

/** Build the five per-site toggle rows once. */
function ensureToggleRows() {
  const container = $('adblock-toggles');
  if (!container || container.children.length) return;

  TOGGLE_KEYS.forEach((key) => {
    const meta = TOGGLE_META[key];
    const row = document.createElement('label');
    row.className = 'ab-toggle-row';
    row.title = meta.hint;

    const text = document.createElement('span');
    text.className = 'ab-toggle-text';
    text.innerHTML = `<b>${meta.name}</b><i>${meta.hint}</i>`;

    const sw = document.createElement('span');
    sw.className = 'switch ab-switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `ab-toggle-${key}`;
    sw.append(input, document.createElement('span'));

    input.onchange = async () => {
      const toggles = { ...effectiveToggles(), [key]: input.checked };
      await setSiteBlocker({ mode: 'custom', toggles, enabled: true }, () => renderAdblockCard());
      setStatus(input.checked ? '✓ فعال شد' : '✓ غیرفعال شد');
    };

    row.append(text, sw);
    container.append(row);
  });
}

function renderModeOptions() {
  const select = $('adblock-mode');
  if (!select) return;
  if (!select.children.length) {
    const opt = document.createElement('option');
    opt.value = 'strict';
    opt.textContent = 'کامل (مسدودسازی تمام تبلیغات)';
    select.append(opt);
  }
  select.value = 'strict';
}

function renderPickedList() {
  const list = $('adblock-picked-list');
  if (!list) return;
  list.replaceChildren();

  const rules = pickedRules();
  // Keep the collapsed card compact when there is nothing to show.
  list.classList.toggle('hidden', rules.length === 0);
  if (!rules.length) return;

  rules.forEach((rule) => {
    const row = document.createElement('div');
    row.className = 'ab-picked-row' + (rule.enabled === false ? ' disabled' : '');

    const top = document.createElement('div');
    top.className = 'ab-picked-top';

    const name = document.createElement('span');
    name.className = 'ab-picked-name';
    name.textContent = rule.label || rule.selector;
    name.title = rule.selector;

    const matchBadge = document.createElement('span');
    matchBadge.className = 'ab-match';
    matchBadge.dataset.ruleId = rule.id;
    matchBadge.hidden = true;

    const powerBtn = document.createElement('button');
    powerBtn.className = 'ab-mini' + (rule.enabled !== false ? ' on' : '');
    powerBtn.textContent = rule.enabled !== false ? 'روشن' : 'خاموش';
    powerBtn.title = rule.enabled !== false ? 'کلیک برای غیرفعال کردن' : 'کلیک برای فعال کردن';
    powerBtn.onclick = () => updatePickedRule(
      rule.id, { enabled: rule.enabled === false }, () => renderAdblockCard()
    );

    top.append(name, matchBadge, powerBtn);

    const active = activePickedSelector(rule);
    const code = document.createElement('code');
    code.className = 'ab-picked-sel';
    code.textContent = active;
    code.title = active;

    const actions = document.createElement('div');
    actions.className = 'ab-picked-actions';

    const modeBtn = document.createElement('button');
    modeBtn.className = 'ab-mini' + (rule.mode === 'remove' ? ' on' : '');
    modeBtn.textContent = rule.mode === 'remove' ? 'حذف کامل' : 'مخفی';
    modeBtn.title = 'تغییر حالت: مخفی کردن یا حذف کامل';
    modeBtn.onclick = () => updatePickedRule(
      rule.id, { mode: rule.mode === 'remove' ? 'hide' : 'remove' }, () => renderAdblockCard()
    );
    actions.append(modeBtn);

    // Only offered when a broader class-based selector was found.
    if (rule.broad) {
      const broadBtn = document.createElement('button');
      broadBtn.className = 'ab-mini' + (rule.useBroad ? ' on' : '');
      broadBtn.textContent = 'گسترده';
      broadBtn.title = `سلکتور گسترده: ${rule.broad}\nمناسب وقتی بخش در هر بارگذاری از نو ساخته می‌شود`;
      broadBtn.onclick = () => updatePickedRule(
        rule.id, { useBroad: !rule.useBroad }, () => renderAdblockCard()
      );
      actions.append(broadBtn);
    }

    const del = document.createElement('button');
    del.className = 'ab-mini danger';
    del.textContent = '✕';
    del.title = 'حذف این قانون';
    del.onclick = () => removePickedRule(rule.id, () => renderAdblockCard());
    actions.append(del);

    row.append(top, code, actions);
    list.append(row);
  });

  markRuleEffectiveness(rules);
}

/**
 * Ask the page whether each rule still matches anything and label it.
 * A rule whose selector no longer matches is the silent failure mode this
 * feature is most prone to, so it is surfaced rather than hidden.
 */
async function markRuleEffectiveness(rules) {
  if (!state.tabId || !rules.length) return;

  const selectors = rules.map((rule) => activePickedSelector(rule)).filter(Boolean);
  if (!selectors.length) return;

  let response = null;
  try {
    response = await chrome.tabs.sendMessage(state.tabId, {
      type: 'ADBLOCK_TEST_SELECTORS',
      selectors
    });
  } catch (_) {
    return;
  }
  if (!response?.ok) return;

  rules.forEach((rule) => {
    const badge = document.querySelector(`.ab-match[data-rule-id="${rule.id}"]`);
    if (!badge) return;

    const count = response.results?.[activePickedSelector(rule)];
    if (count === undefined) return;

    if (count < 0) {
      badge.textContent = 'سلکتور نامعتبر';
      badge.className = 'ab-match bad';
    } else if (count === 0) {
      badge.textContent = 'پیدا نشد';
      badge.className = 'ab-match warn';
      badge.title = 'این سلکتور همین حالا چیزی در صفحه پیدا نمیکند. اگر بخش بعد از رفرش برنگشت، دکمه «گسترده» را امتحان کنید.';
    } else {
      badge.textContent = `${formatCount(count)} مورد`;
      badge.className = 'ab-match ok';
      badge.title = 'این سلکتور همین حالا در صفحه اعمال میشود.';
    }
    badge.hidden = false;
  });
}
function renderAdblockCard() {
  const card = $('adblock-card');
  if (!card) return;

  ensureToggleRows();
  renderModeOptions();
  renderPickedList();

  const pickMode = $('adblock-pick-mode');
  if (pickMode) pickMode.value = state.adPickMode || 'hide';

  const global = state.adblock?.global || DEFAULT_ADBLOCK;
  const globalOn = global.enabled !== false;
  const toggles = effectiveToggles();
  const reason = state.adblock?.toggles?.reason || '';
  const siteOn = Boolean(state.site?.blocker?.enabled !== false) && reason !== 'site-off' && !state.adblock?.whitelisted;
  const anyActive = TOGGLE_KEYS.some((key) => toggles[key]);
  const active = globalOn && siteOn && anyActive;

  // Master global switch
  $('adblock-enabled').checked = globalOn;

  // Per-site toggle
  const siteToggle = $('adblock-site-toggle');
  if (siteToggle) {
    siteToggle.checked = siteOn;
    siteToggle.disabled = !globalOn;
  }

  // Switched off globally or for this site -> show only the title and the switch.
  card.classList.toggle('collapsed', !active);

  const status = $('adblock-status');
  if (status) {
    if (!globalOn) {
      status.innerHTML = '<span class="ab-warn">ادبلاکر سراسری خاموش است</span>';
    } else if (state.adblock?.whitelisted) {
      status.innerHTML = '<span class="ab-warn">این سایت در لیست سفید است</span>';
    } else if (!siteOn) {
      status.innerHTML = '<span class="ab-muted">در این سایت غیرفعال</span>';
    } else {
      const parts = [];
      if (state.adblock?.tabCount) parts.push(`<b>${formatCount(state.adblock.tabCount)}</b> مورد در این صفحه`);
      if (state.adblock?.stats?.total) parts.push(`${formatCount(state.adblock.stats.total)} مورد در کل`);
      status.innerHTML = parts.length
        ? `🛡️ ${parts.join(' · ')}`
        : `<span class="ab-muted">${describeSiteState(global, state.site, state.domain)}</span>`;
    }
  }

  TOGGLE_KEYS.forEach((key) => {
    const input = $(`ab-toggle-${key}`);
    if (input) input.checked = Boolean(toggles[key]);
  });

  const badge = $('adblock-badge');
  if (badge) {
    const popupBlocked = state.adblock?.stats?.popups || 0;
    if (!active) {
      const why = !globalOn ? 'سراسری خاموش' : (state.adblock?.whitelisted ? 'لیست سفید' : 'غیرفعال');
      if (why) {
        badge.textContent = why;
        badge.classList.remove('hidden');
        badge.classList.add('warn');
      } else {
        badge.classList.add('hidden');
        badge.classList.remove('warn');
      }
    } else if (popupBlocked > 0) {
      badge.textContent = `${formatCount(popupBlocked)} پاپ‌آپ`;
      badge.classList.remove('hidden');
      badge.classList.add('warn');
    } else {
      badge.classList.add('hidden');
      badge.classList.remove('warn');
    }
  }

  const wl = $('adblock-whitelist');
  const bl = $('adblock-blacklist');
  if (wl) {
    wl.textContent = state.adblock?.whitelisted ? '✓ در لیست سفید' : '＋ لیست سفید';
    wl.classList.toggle('active', Boolean(state.adblock?.whitelisted));
  }
  if (bl) {
    bl.textContent = state.adblock?.blacklisted ? '✓ در لیست سیاه' : '＋ لیست سیاه';
    bl.classList.toggle('active', Boolean(state.adblock?.blacklisted));
  }

  const stats = $('adblock-stats');
  if (stats) {
    const s = state.adblock?.stats || {};
    stats.innerHTML = `
      <span>تبلیغات شبکه: <b>${formatCount(s.total || 0)}</b></span>
      <span>پاپ‌آپ بسته‌شده: <b>${formatCount(s.popups || 0)}</b></span>
      <span>عنصر پنهان‌شده: <b>${formatCount(s.cosmetic || 0)}</b></span>
    `;
  }
}

/** Open the sidebar directly on the blocker tab. */
async function openBlockerSettings() {
  try {
    await chrome.storage.local.set({ sidebarTab: 'adblock' });
  } catch (_) {}
  const button = $('open-sidebar');
  if (button) button.click();
}

// --- Module: popup/popup.js ---
/**
 * Main Popup Controller & Lifecycle
 *
 * Two invariants matter here:
 *   1. The popup must never be left half-painted. Every async step is wrapped so
 *      that a failed message round-trip (the service worker may still be waking
 *      up) cannot stop `render()` from running.
 *   2. The panel is live. It subscribes to `chrome.storage.onChanged`, so a rule
 *      added or deleted from anywhere — including the in-page picker — shows up
 *      without closing and reopening the popup.
 */










/** Storage keys that change what the popup displays. */
const WATCHED_KEYS = ['settings', 'adblock', 'adblockStats', 'fonts', 'bundledFonts'];

function render() {
  renderScopeTabs();
  renderLayoutCard();
  renderTypeCard(render);
  renderTranslateCard();
  renderAdblockCard();
  renderTargets('direction', render);
  renderTargets('font', render);
  renderTargets('translate', render);
}

/** `chrome.runtime.sendMessage` that resolves instead of rejecting. */
async function sendSafe(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (err) {
    return { ok: false, error: err?.message || 'extension-unreachable' };
  }
}

/**
 * Ask the background for the active tab, retrying briefly. The very first
 * message after the popup opens is what wakes a sleeping service worker, so a
 * single rejection here is expected and must not kill the whole panel.
 */
async function getContextWithRetry(attempts = 3) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const context = await sendSafe({ type: 'GET_ACTIVE_CONTEXT' });
    if (context?.ok) return context;
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 80 * (attempt + 1)));
    } else {
      return context;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Live sync                                                           */
/* ------------------------------------------------------------------ */

let syncTimer = null;

/** Re-read everything the UI depends on and repaint. */
async function syncFromStorage() {
  try {
    const store = await getStorage();
    state.fonts = store.fonts || [];
    state.site = migrateSite((store.settings || {})[state.domain]);
  } catch (_) {}
  await refreshAdblock();

  // Never yank the value out from under someone who is mid-edit.
  const active = document.activeElement;
  const editing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');
  if (!editing) render();
}

function scheduleSync() {
  if (syncTimer) return;
  syncTimer = setTimeout(() => {
    syncTimer = null;
    syncFromStorage();
  }, 60);
}

function watchStorage() {
  if (!chrome.storage?.onChanged) return;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (WATCHED_KEYS.some((key) => key in changes)) scheduleSync();
  });
}

/* ------------------------------------------------------------------ */
/* Binding                                                             */
/* ------------------------------------------------------------------ */

function bind() {
  bindScopeTabs(render);
  bindLayoutCard(render);
  bindTypeCard(render);
  bindTranslateCard(render);
  bindPersianHint(render);
  bindAdblockCard(render);

  document.querySelectorAll('[data-advanced]').forEach((button) => {
    button.onclick = async () => {
      const panel = $(button.dataset.advanced + '-advanced');
      if (!panel) return;
      panel.classList.toggle('open');
      const openIds = [...document.querySelectorAll('.advanced.open')].map((p) => p.id);
      try {
        await chrome.storage.local.set({ openPanels: openIds });
      } catch (_) {}
    };
  });

  $('open-sidebar').onclick = async () => {
    if (state.tabId && chrome.sidePanel?.open) {
      try {
        await chrome.sidePanel.open({ tabId: state.tabId });
        window.close();
        return;
      } catch (_) {}
    }
    const result = await sendSafe({ type: 'OPEN_SIDEBAR' });
    if (!result?.ok) setStatus(result?.error || 'Sidebar unavailable', true);
    else window.close();
  };

  $('clear-all-data-popup')?.addEventListener('click', async () => {
    const ok = confirm('هشدار: آیا مطمئن هستید؟ تمامی داده‌ها و تنظیمات ذخیره‌شده توسط مرورگر (تنظیمات سایت‌ها، فونت‌ها و آمار) به طور کامل پاک خواهند شد.');
    if (!ok) return;
    try {
      await chrome.storage.local.clear();
      await chrome.storage.local.set(DEFAULTS);
      state.site = structuredClone(DEFAULT_SITE);
      state.fonts = [];
      await reloadSite();
      await refreshAdblock();
      await messageTab({ type: 'RESYNC' });
      render();
      setStatus('✓ تمام داده‌های مرورگر پاک شدند');
    } catch (err) {
      console.error('[EasyWeb Clear Error]:', err);
      setStatus('خطا در پاک‌سازی داده‌ها', true);
    }
  });

  window.addEventListener('blur', () => {
    const node = $('status');
    if (node) node.textContent = '';
  });
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

/** Apply a picker result that belongs to the layout / typography features. */
function applyTargetPick(result) {
  const feature = result.feature;
  if (!state.site[feature]) state.site[feature] = {};
  state.site[feature].scope = 'element';

  const existing = state.site.targets.find((t) => t.selector === result.selector);
  if (existing) {
    state.activeTargetId = existing.id;
  } else {
    const target = {
      id: `t${Math.random().toString(36).slice(2, 8)}`,
      selector: result.selector,
      label: result.label || result.selector,
      direction: null,
      font: null,
      translate: null
    };
    state.site.targets.push(target);
    state.activeTargetId = target.id;
  }

  const target = state.site.targets.find((t) => t.id === state.activeTargetId);
  if (!target) return;

  if (feature === 'direction') {
    target.direction = {
      ...DEFAULT_SITE.direction,
      enabled: true,
      value: $('direction-value').value,
      scope: 'element',
      selector: target.selector,
      label: target.label
    };
    $('direction-advanced')?.classList.add('open');
  } else if (feature === 'translate') {
    target.translate = {
      ...DEFAULT_SITE.translate,
      enabled: true,
      scope: 'element',
      selector: target.selector,
      label: target.label,
      targetLang: $('translate-target-lang')?.value || 'fa',
      engine: $('translate-engine')?.value || 'google'
    };
    $('translate-advanced')?.classList.add('open');
  } else {
    target.font = {
      ...DEFAULT_SITE.font,
      enabled: true,
      scope: 'element',
      selector: target.selector,
      label: target.label,
      family: $('font-family').value,
      size: Number($('font-size').value) || 16,
      unit: $('font-unit').value,
      lineHeight: $('line-height').value,
      weight: Number($('font-weight').value) || 400,
      align: $('text-align').value
    };
    $('font-advanced')?.classList.add('open');
  }

  syncSiteEnabled(state.site);
}

async function handlePickerResult() {
  const picked = await sendSafe({ type: 'GET_PICKER_RESULT' });
  const result = picked?.result;
  if (!result) return;

  if (result.feature === 'adblock') {
    // The content script already applied and persisted the rule, so we only need
    // to re-sync our copy and confirm.
    await reloadSite();
    await refreshAdblock();
    render();
    const label = result.label || result.selector;
    const how = result.mode === 'remove' ? 'حذف شد' : 'مخفی شد';
    setStatus(`✓ بخش «${label}» ${how} — از این پس در این سایت بلاک می‌شود`);
    return;
  }

  applyTargetPick(result);
  render();
  await saveSite();
  setStatus('✓ Section added');
}

async function init() {
  // Bind first, then paint the shell immediately: the panel must never be left
  // showing placeholders just because a later step failed.
  try {
    bind();
  } catch (err) {
    console.error('[EasyWeb Popup] bind failed:', err);
  }
  watchStorage();
  render();

  const context = await getContextWithRetry();
  if (!context?.ok) {
    setStatus(context?.error || 'صفحه‌ی وب فعالی پیدا نشد', true);
    return;
  }

  state.tabId = context.tab.id;
  state.domain = context.domain || '';
  $('domain').textContent = state.domain;

  try {
    const store = await getStorage();
    state.fonts = store.fonts || [];
    state.site = migrateSite((store.settings || {})[state.domain]);
    const openPanels = store.openPanels || [];
    openPanels.forEach((id) => $(id)?.classList.add('open'));
  } catch (err) {
    console.error('[EasyWeb Popup] initial state load failed:', err);
  }
  render();

  try {
    await handlePickerResult();
  } catch (err) {
    console.error('[EasyWeb Popup] picker result failed:', err);
  }

  // allSettled: one failing step must not skip the final repaint.
  await Promise.allSettled([checkPersianHint(), refreshAdblock()]);
  render();

  // Bring the page in line with current settings on every open. `pushSettings`
  // re-injects the content script when it is missing, so a page left with an
  // orphaned script (extension reloaded) recovers without a manual refresh.
  const applied = await pushSettings();
  if (applied && state.site.enabled) setStatus('Applied to this page');
}

init();
})();
