/**
 * EasyWeb Ad Blocker — Shared Core
 * Mode presets, toggle resolution, domain-list matching, cosmetic filter
 * catalogues and custom-rule parsing. Safe to import from the background
 * worker, content script, popup and sidebar (no chrome.* access at load time).
 */

/** Storage keys owned by the blocker (kept separate from the layout/font map). */
import { normalizeHost } from './domain.js';

export const ADBLOCK_STORAGE_KEY = 'adblock';
export const ADBLOCK_STATS_KEY = 'adblockStats';

/** Rule-set ids referenced by manifest.json -> declarative_net_request. */
export const RULESET_IDS = {
  ads: 'easyweb_ads',
  trackers: 'easyweb_trackers',
  popups: 'easyweb_popups',
  annoyances: 'easyweb_annoyances'
};

/** Every toggle the blocker understands, in UI order. */
export const TOGGLE_KEYS = ['ads', 'trackers', 'popups', 'cosmetic', 'annoyances'];

export const TOGGLE_META = {
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

/** Preset toggle bundles: complete blocking or off. */
export const MODE_PRESETS = {
  default: { ads: true, trackers: true, popups: true, cosmetic: true, annoyances: true },
  strict: { ads: true, trackers: true, popups: true, cosmetic: true, annoyances: true },
  off: { ads: false, trackers: false, popups: false, cosmetic: false, annoyances: false }
};

/** Site-level mode ids. */
export const SITE_MODES = [
  { id: 'inherit', name: 'پیش‌فرض کلی', hint: 'همان تنظیمات سراسری اعمال شود' },
  { id: 'strict', name: 'کامل', hint: 'مسدودسازی تمام تبلیغات و مزاحمت‌ها' },
  { id: 'off', name: 'غیرفعال در این سایت', hint: 'هیچ چیزی مسدود نشود (لیست سفید)' }
];

export const DEFAULT_TOGGLES = { ...MODE_PRESETS.strict };

/** How a user-picked advertising section is neutralised. */
export const PICKED_MODES = [
  { id: 'hide', name: 'مخفی شود', hint: 'بخش دیده نمی‌شود ولی در صفحه باقی می‌ماند' },
  { id: 'remove', name: 'کامل حذف شود', hint: 'بخش از ساختار صفحه پاک می‌شود' }
];

/** Per-site blocker defaults (merged into DEFAULT_SITE by defaults.js). */
export const DEFAULT_BLOCKER = {
  enabled: true,
  mode: 'inherit',
  toggles: null,
  /** Sections the user picked by hand on this site. */
  picked: []
};

/** Global blocker defaults stored under the `adblock` storage key. */
export const DEFAULT_ADBLOCK = {
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
 */
export const AUTH_ALLOW_HOSTS = [
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

/** Resource types blocked by the network rule-sets. */
export const NETWORK_RESOURCE_TYPES = [
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

/** Resource types used when blocking popup navigations. */
export const NAVIGATION_RESOURCE_TYPES = ['main_frame', 'sub_frame'];

/**
 * Hosts used by the content script for fast, synchronous click / popup
 * decisions. Kept intentionally compact — the authoritative network lists
 * live in src/rules/lists.js.
 */
export const AD_HOST_SUFFIXES = [
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
 */
export const BASE_COSMETIC_SELECTORS = [
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

/** Selectors used by the "annoyances" toggle. */
export const ANNOYANCE_SELECTORS = [
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
export { normalizeHost };

/**
 * Does `host` match a single list entry?
 * Supports `example.com` (domain + subdomains) and `*.example.com` (subdomains).
 */
export function hostMatchesEntry(host, entry) {
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

/** Does `host` appear anywhere in a domain list? */
export function hostInList(host, list = []) {
  if (!host || !Array.isArray(list)) return false;
  return list.some((entry) => hostMatchesEntry(host, entry));
}

/** Does `host` match one of the known ad / popup network suffixes? */
export function isKnownAdHost(host, extra = []) {
  const h = normalizeHost(host);
  if (!h) return false;
  if (hostInList(h, extra)) return true;
  return AD_HOST_SUFFIXES.some((entry) => {
    if (entry.includes('/')) return h.endsWith(entry.split('/')[0]);
    return h === entry || h.endsWith(`.${entry}`);
  });
}

/** Is this host part of a legitimate auth / payment flow? */
export function isAuthHost(host, extraAllowed = []) {
  return hostInList(host, AUTH_ALLOW_HOSTS) || hostInList(host, extraAllowed);
}

/* ------------------------------------------------------------------ */
/* Toggle resolution                                                   */
/* ------------------------------------------------------------------ */

/**
 * Work out the toggles that actually apply to a site.
 * Precedence: global off > whitelist > site off > site custom > site mode > global mode.
 */
export function resolveToggles(globalConfig, site, host) {
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

/** True when *any* blocking is active for the site. */
export function isActiveForSite(globalConfig, site, host) {
  const toggles = resolveToggles(globalConfig, site, host);
  return TOGGLE_KEYS.some((key) => toggles[key]);
}

/**
 * Strip the bookkeeping fields off a resolved toggle object so it can be
 * stored back as an explicit per-site override.
 */
export function pickToggleValues(toggles) {
  const out = {};
  for (const key of TOGGLE_KEYS) out[key] = Boolean(toggles?.[key]);
  return out;
}

/** Human-readable explanation of the current site state, for the UI. */
export function describeSiteState(globalConfig, site, host) {
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

/** The selector a picked rule currently resolves to (broad wins when selected). */
export function activePickedSelector(rule) {
  if (!rule) return '';
  if (rule.useBroad && rule.broad) return rule.broad;
  return rule.selector || '';
}

/** Normalise a user-picked "this section is an ad" rule. */
export function normalizePickedRule(rule) {
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

/** Normalise a whole list, dropping entries that cannot be represented. */
export function normalizePickedRules(list) {
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

/** Build the `display:none` stylesheet from the selector catalogues. */
export function buildCosmeticCss({ customSelectors = [], includeAnnoyances = false, collapseEmptySlots = true, picked = [] } = {}) {
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

/** CSS applied to a hijack overlay while we keep the underlying player usable. */
export const OVERLAY_NEUTRALIZE_CSS = `
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
 */
export function parseCustomRule(line) {
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

/** Parse a whole textarea of custom filters into DNR rule descriptors. */
export function parseCustomRules(lines = []) {
  return lines
    .map((line) => parseCustomRule(line))
    .filter(Boolean)
    .slice(0, 400);
}

/** Extract cosmetic-only rules (`##selector`) from a user filter list. */
export function extractCosmeticRules(lines = []) {
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

/** Merge two stat records without losing counters. */
export function mergeStats(base = {}, patch = {}) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(patch || {})) {
    merged[key] = (Number(merged[key]) || 0) + (Number(value) || 0);
  }
  return merged;
}

/** Compact display number (1.2k / 3.4M). */
export function formatCount(value) {
  const n = Number(value) || 0;
  if (n < 1000) return String(n);
  if (n < 1000000) return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`;
  return `${(n / 1000000).toFixed(1)}M`;
}
