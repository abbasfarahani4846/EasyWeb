(() => {
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

// --- Module: shared/markdown.js ---
/**
 * Minimal, dependency-free Markdown -> HTML renderer for AI answers.
 * Covers what LLMs commonly emit (code fences, headings, lists, inline code,
 * bold/italic, links, blockquotes, hr). Everything is HTML-escaped first, so
 * no user or LLM text can become executable markup. Not a complete spec — it
 * is tuned for chat messages, not document interchange.
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function renderMarkdown(md) {
  const esc = escapeHtml;
  return esc(md ?? '')
    .replace(/\r\n/g, '\n')
    // fenced code blocks first (optional language tag)
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
      `<pre><code>${code.replace(/\n$/, '')}</code></pre>`)
    // headings
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    // blockquote + hr
    .replace(/^&gt; (.*)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^---$/gm, '<hr>')
    // lists
    .replace(/^\s*[-*] (.*)$/gm, '<li>$1</li>')
    .replace(/^\s*\d+[.)] (.*)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>')
    // paragraphs: wrap non-block plain lines in <p>
    .replace(/\n{2,}/g, '\n')
    .split('\n')
    .map((line) => {
      const t = line.trim();
      if (!t) return '';
      if (/^(<h\d>|<ul>|<li>|<pre>|<blockquote>|<hr>)/.test(t) || /^<\/?/.test(t) || /^\s*<t/.test(t)) return t;
      return `<p>${formatInline(t)}</p>`;
    })
    .join('\n');

  function formatInline(text) {
    const safeHref = (url) => {
      const u = String(url ?? '').trim();
      // only safe schemes; block javascript:/data: etc. (blocking XSS via links)
      return /^(https?:|mailto:)/i.test(u) ? u : '#';
    };
    return text
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) =>
        `<a href="${safeHref(url)}" target="_blank" rel="noopener">${label}</a>`);
  }
}

/** Render one assistant message's text. Plain one-liners stay plain text. */
function assistantBody(text) {
  const t = String(text ?? '').trim();
  if (!t) return escapeHtml(text ?? '');
  if (!/[#*`>\[]/.test(t) && !t.includes('\n')) return escapeHtml(t);
  return renderMarkdown(t);
}

// --- Module: sidebar/sidebar.js ---
/**
 * Sidebar AI Assistant & Settings Modal Controller
 */




let activeTab = null;
let domain = '';
let pageText = '';
let providers = [];
let activeProviderId = '';
let translationAi = { providerId: '', model: '' };
let tools = [];
let historyKey = '';
let history = [];
let adblockConfig = null;
let adblockStats = null;
let adblockDiag = null;

const $ = (id) => document.getElementById(id);
const send = (message) => chrome.runtime.sendMessage(message);

function setStatus(text, error = false) {
  const nodes = [$('sidebar-status'), $('modal-status')].filter(Boolean);
  nodes.forEach((node) => {
    node.textContent = text;
    node.style.color = error ? '#ff8d9c' : '#27c8ba';
  });
  setTimeout(() => {
    nodes.forEach((node) => {
      if (node.textContent === text) node.textContent = '';
    });
  }, 4000);
}

/* Chat rendering */
function renderHistory() {
  const chat = $('chat');
  chat.replaceChildren();
  if (!history.length) {
    const welcome = document.createElement('div');
    welcome.className = 'welcome';
    welcome.innerHTML = '<span class="welcome-icon">✦</span><strong>درباره این صفحه هر سوالی دارید بپرسید</strong><p>خلاصه‌سازی، ترجمه متون، یا اجرای پرسش‌های هوشمند از محتوای صفحه.</p>';
    chat.append(welcome);
    return;
  }
  history.forEach((item) => {
    const node = document.createElement('div');
    node.className = `message ${item.role}`;
    const label = document.createElement('span');
    label.className = 'message-label';
    label.textContent = item.role === 'user' ? 'شما' : 'EasyWeb AI';
    if (item.role === 'assistant') {
      node.innerHTML = '';
      node.append(label);
      node.insertAdjacentHTML('beforeend', assistantBody(item.text));
    } else {
      node.append(label, document.createTextNode(item.text));
    }
    chat.append(node);
  });
  chat.scrollTop = chat.scrollHeight;
}

async function saveHistory() {
  if (!historyKey) return;
  try {
    const store = await chrome.storage.local.get({ chatHistory: {} });
    const chatHistory = store.chatHistory || {};
    chatHistory[historyKey] = history.slice(-40);
    await chrome.storage.local.set({ chatHistory });
  } catch (err) {
    console.error('[EasyWeb Chat History Save Error]:', err);
  }
}

async function clearChat() {
  history = [];
  renderHistory();
  if (historyKey) {
    try {
      const store = await chrome.storage.local.get({ chatHistory: {} });
      const chatHistory = store.chatHistory || {};
      delete chatHistory[historyKey];
      await chrome.storage.local.set({ chatHistory });
      setStatus('✓ تاریخچه گفتگو پاک شد');
    } catch (err) {
      console.error('[EasyWeb Clear Chat Error]:', err);
    }
  }
}

function renderActiveProviderLine() {
  const provider = providers.find((p) => p.id === activeProviderId) || providers[0];
  const line = $('active-provider');
  if (provider) {
    const model = provider.selectedModel || provider.defaultModel || 'پیش‌فرض';
    line.innerHTML = `مدل فعال: <b>${escapeHtml(provider.label)}</b> · <span style="color:#27c8ba">${escapeHtml(model)}</span>`;
  } else {
    line.textContent = 'حالت تست · ارائه‌دهنده را انتخاب کنید';
  }
}

async function persistProviders() {
  await chrome.storage.local.set({ providers, activeProviderId, translationAi });
  renderActiveProviderLine();
  renderTranslationTab();
}

/* Render saved providers in settings modal */
function renderProvidersList() {
  const list = $('saved-providers-list');
  list.replaceChildren();

  if (!providers.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'هیچ سرویس‌دهنده‌ای ذخیره نشده است. با فرم بالا اولین کلید را اضافه کنید.';
    list.append(empty);
    return;
  }

  providers.forEach((provider) => {
    const card = document.createElement('div');
    const isActive = provider.id === activeProviderId;
    card.className = `provider-card ${isActive ? 'active' : ''}`;

    // Header
    const head = document.createElement('div');
    head.className = 'provider-header';

    const radioLabel = document.createElement('label');
    radioLabel.className = 'provider-radio-label';
    radioLabel.title = 'انتخاب به عنوان سرویس‌دهنده فعال';

    const pRadio = document.createElement('input');
    pRadio.type = 'radio';
    pRadio.name = 'active-provider-radio';
    pRadio.className = 'provider-radio';
    pRadio.checked = isActive;
    pRadio.onchange = async () => {
      activeProviderId = provider.id;
      await persistProviders();
      renderProvidersList();
      setStatus(`✓ سرویس‌دهنده ${provider.label} فعال شد`);
    };

    const titleSpan = document.createElement('span');
    titleSpan.className = 'provider-name';
    titleSpan.innerHTML = `<span>${escapeHtml(provider.label)}</span> <span style="font-size:9px;color:#8f93b3">(${escapeHtml(provider.type)})</span>`;

    radioLabel.append(pRadio, titleSpan);

    const actions = document.createElement('div');
    actions.className = 'provider-actions';

    const useBtn = document.createElement('button');
    useBtn.className = `btn-use ${isActive ? 'active' : ''}`;
    useBtn.textContent = isActive ? '✓ فعال (پیش‌فرض)' : 'انتخاب پیش‌فرض';
    useBtn.onclick = async (e) => {
      e.stopPropagation();
      activeProviderId = provider.id;
      await persistProviders();
      renderProvidersList();
      setStatus(`✓ سرویس‌دهنده ${provider.label} به عنوان فعال انتخاب شد`);
    };

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-del';
    delBtn.textContent = '✕ حذف';
    delBtn.onclick = async (e) => {
      e.stopPropagation();
      providers = providers.filter((p) => p.id !== provider.id);
      if (activeProviderId === provider.id) activeProviderId = providers[0]?.id || '';
      await persistProviders();
      renderProvidersList();
      setStatus('✓ سرویس‌دهنده حذف شد');
    };

    actions.append(useBtn, delBtn);
    head.append(radioLabel, actions);
    card.append(head);

    // Model browser
    const filterBar = document.createElement('div');
    filterBar.className = 'model-filter-bar';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = '🔍 جستجوی مدل...';

    const freeFilterLabel = document.createElement('label');
    freeFilterLabel.className = 'free-filter-label';
    const freeCheck = document.createElement('input');
    freeCheck.type = 'checkbox';
    freeFilterLabel.append(freeCheck, document.createTextNode(' فقط رایگان (Free)'));

    filterBar.append(searchInput, freeFilterLabel);
    card.append(filterBar);

    // Models container
    const modelsBox = document.createElement('div');
    modelsBox.className = 'models-sublist';

    function renderModelsSublist() {
      modelsBox.replaceChildren();
      const query = searchInput.value.toLowerCase().trim();
      const onlyFree = freeCheck.checked;
      const allModels = provider.models || [];

      const filtered = allModels.filter((m) => {
        if (onlyFree && !m.isFree) return false;
        if (query && !m.name?.toLowerCase().includes(query) && !m.id?.toLowerCase().includes(query)) return false;
        return true;
      });

      if (!filtered.length) {
        const noM = document.createElement('span');
        noM.style.fontSize = '9px';
        noM.style.color = '#8f93b3';
        noM.textContent = 'مدلی یافت نشد.';
        modelsBox.append(noM);
        return;
      }

      filtered.forEach((m) => {
        const item = document.createElement('div');
        const isSelected = (provider.selectedModel || provider.defaultModel) === m.id;
        item.className = `model-item ${isSelected ? 'selected' : ''}`;
        item.title = `کلیک برای انتخاب مدل ${m.name || m.id}`;

        const leftDiv = document.createElement('div');
        leftDiv.style.display = 'flex';
        leftDiv.style.alignItems = 'center';
        leftDiv.style.gap = '6px';
        leftDiv.style.flex = '1';
        leftDiv.style.overflow = 'hidden';

        const mRadio = document.createElement('input');
        mRadio.type = 'radio';
        mRadio.name = `model-radio-${provider.id}`;
        mRadio.className = 'model-radio';
        mRadio.checked = isSelected;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'model-name';
        nameSpan.textContent = m.name || m.id;

        leftDiv.append(mRadio, nameSpan);

        const rightSpan = document.createElement('span');
        rightSpan.style.display = 'flex';
        rightSpan.style.gap = '4px';
        rightSpan.style.alignItems = 'center';

        if (m.isFree) {
          const freeBadge = document.createElement('span');
          freeBadge.className = 'badge-free';
          freeBadge.textContent = 'FREE';
          rightSpan.append(freeBadge);
        }

        if (isSelected && isActive) {
          const activeBadge = document.createElement('span');
          activeBadge.className = 'badge-active-model';
          activeBadge.textContent = '✓ فعال';
          rightSpan.append(activeBadge);
        }

        item.append(leftDiv, rightSpan);

        const selectModel = async (e) => {
          if (e) e.stopPropagation();
          provider.selectedModel = m.id;
          activeProviderId = provider.id;
          await persistProviders();
          renderProvidersList();
          setStatus(`✓ مدل ${m.name || m.id} انتخاب و فعال شد`);
        };

        item.onclick = selectModel;
        mRadio.onchange = selectModel;
        modelsBox.append(item);
      });
    }

    searchInput.oninput = renderModelsSublist;
    freeCheck.onchange = renderModelsSublist;
    renderModelsSublist();

    card.append(modelsBox);
    list.append(card);
  });
}

function renderTranslationTab() {
  const pSelect = $('ai-trans-provider');
  const mSelect = $('ai-trans-model');
  if (!pSelect || !mSelect) return;

  pSelect.innerHTML = '';
  providers.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.label} (${p.type})`;
    pSelect.append(opt);
  });

  pSelect.value = translationAi.providerId || activeProviderId || (providers[0]?.id || '');

  function updateModels() {
    mSelect.innerHTML = '';
    const currentP = providers.find((p) => p.id === pSelect.value);
    const models = currentP?.models || [];
    models.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `${m.name || m.id}${m.isFree ? ' · [FREE]' : ''}`;
      mSelect.append(opt);
    });
    mSelect.value = translationAi.model || currentP?.selectedModel || (models[0]?.id || '');
  }

  pSelect.onchange = updateModels;
  updateModels();

  if ($('ai-trans-tone')) {
    $('ai-trans-tone').value = translationAi.tone || 'standard';
  }
  if ($('ai-trans-prompt')) {
    $('ai-trans-prompt').value = translationAi.customPrompt || '';
  }
}

function renderTools() {
  const list = $('custom-tools-list');
  if (!list) return;
  list.replaceChildren();
  tools.forEach((tool, index) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';
    row.style.background = 'var(--surface-2)';
    row.style.padding = '6px 10px';
    row.style.borderRadius = '6px';
    row.style.marginBottom = '4px';

    const info = document.createElement('div');
    info.innerHTML = `<strong>${escapeHtml(tool.name)}</strong><p style="margin:2px 0 0;font-size:9px;color:var(--muted)">${escapeHtml(tool.prompt)}</p>`;

    const del = document.createElement('button');
    del.className = 'btn-del';
    del.textContent = '✕';
    del.onclick = async () => {
      tools.splice(index, 1);
      await chrome.storage.local.set({ customTools: tools });
      renderTools();
    };

    row.append(info, del);
    list.append(row);
  });
}

/* ---------------- Ad blocker settings ---------------- */

function parseLines(text = '') {
  return [...new Set(
    String(text || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  )];
}

async function loadAdblock() {
  const [status, diag] = await Promise.all([
    send({ type: 'ADBLOCK_STATUS' }),
    send({ type: 'ADBLOCK_DIAGNOSTICS' })
  ]);
  if (status?.ok) {
    adblockConfig = status.global;
    adblockStats = status.stats;
  }
  if (diag?.ok) adblockDiag = diag;
  return status;
}

async function patchAdblock(patch, message) {
  const res = await send({ type: 'ADBLOCK_UPDATE_GLOBAL', patch });
  if (res?.ok) {
    adblockConfig = res.config;
    if (message) setStatus(message);
  } else {
    setStatus('خطا در ذخیره تنظیمات ادبلاکر', true);
  }
  renderAdblockTab();
}

function renderGlobalToggles() {
  const grid = $('ab-global-toggles');
  if (!grid || !adblockConfig) return;
  grid.replaceChildren();

  TOGGLE_KEYS.forEach((key) => {
    const meta = TOGGLE_META[key];
    const card = document.createElement('div');
    card.className = 'ab-toggle-card';

    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(adblockConfig.toggles?.[key]);
    input.onchange = () => {
      const toggles = { ...(adblockConfig.toggles || {}), [key]: input.checked };
      patchAdblock({ mode: 'custom', toggles }, '✓ تنظیمات ادبلاکر ذخیره شد');
    };

    const span = document.createElement('span');
    span.textContent = meta.name;
    label.append(input, span);

    const small = document.createElement('small');
    small.textContent = meta.hint;

    card.append(label, small);
    grid.append(card);
  });
}

function renderDomainList(containerId, list, listName) {
  const container = $(containerId);
  if (!container) return;
  container.replaceChildren();

  const entries = (list || []).slice().sort();
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'ab-empty';
    empty.textContent = listName === 'whitelist'
      ? 'هنوز سایتی به لیست سفید اضافه نشده است.'
      : 'هنوز دامنه‌ای به لیست سیاه اضافه نشده است.';
    container.append(empty);
    return;
  }

  entries.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'ab-domain-row';

    const name = document.createElement('span');
    name.className = 'ab-domain-name';
    name.textContent = entry;

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.alignItems = 'center';
    right.style.gap = '8px';

    const hits = adblockStats?.perDomain?.[entry];
    if (hits) {
      const count = document.createElement('span');
      count.className = 'ab-domain-count';
      count.textContent = `${formatCount(hits)} مورد`;
      right.append(count);
    }

    const del = document.createElement('button');
    del.className = 'btn-del';
    del.textContent = '✕';
    del.title = 'حذف از لیست';
    del.onclick = async () => {
      const res = await send({ type: 'ADBLOCK_SET_LIST', list: listName, domain: entry, present: false });
      if (res?.ok) {
        adblockConfig = res.config;
        renderAdblockTab();
        setStatus('✓ از لیست حذف شد');
      }
    };

    right.append(del);
    row.append(name, right);
    container.append(row);
  });
}

function renderAdblockStats() {
  const box = $('ab-stats');
  if (!box) return;
  const s = adblockStats || {};

  const cells = [
    ['تبلیغات و درخواست‌های شبکه‌ای', formatCount(s.total || 0), false],
    ['پاپ‌آپ و تب بسته‌شده', formatCount(s.popups || 0), false],
    ['عنصر تبلیغاتی پنهان‌شده', formatCount(s.cosmetic || 0), false],
    ['دامنه‌های دارای فعالیت', String(Object.keys(s.perDomain || {}).length), false]
  ];

  box.replaceChildren();
  cells.forEach(([label, value, wide]) => {
    const cell = document.createElement('div');
    cell.className = wide ? 'ab-stat wide' : 'ab-stat';
    const span = document.createElement('span');
    span.textContent = label;
    const strong = document.createElement('b');
    strong.textContent = value;
    cell.append(span, strong);
    box.append(cell);
  });

  if (adblockDiag) {
    const diag = document.createElement('div');
    diag.className = 'ab-stat wide ab-diag';
    const since = s.since ? new Date(s.since).toLocaleString('fa-IR') : '—';
    diag.textContent = `session-rules: ${adblockDiag.sessionRuleCount ?? '—'} · tracked-gestures: ${adblockDiag.guard?.trackedGestures ?? 0} · pending-targets: ${adblockDiag.guard?.pendingSuspects ?? 0} · since: ${since}`;
    box.append(diag);
  }
}

function renderAdblockTab() {
  if (!adblockConfig) return;

  const enabled = $('ab-global-enabled');
  if (enabled) enabled.checked = Boolean(adblockConfig.enabled);

  const mode = $('ab-global-mode');
  if (mode) mode.value = adblockConfig.mode || 'default';

  const badge = $('ab-show-badge');
  if (badge) badge.checked = adblockConfig.showBadge !== false;

  const guard = adblockConfig.popupGuard || {};
  if ($('ab-guard-enabled')) $('ab-guard-enabled').checked = guard.enabled !== false;
  if ($('ab-guard-nogesture')) $('ab-guard-nogesture').checked = guard.blockWithoutGesture !== false;
  if ($('ab-guard-thirdparty')) $('ab-guard-thirdparty').checked = guard.blockThirdPartyPopup !== false;
  if ($('ab-guard-media')) $('ab-guard-media').checked = guard.blockFromMedia !== false;
  if ($('ab-guard-allowed') && document.activeElement !== $('ab-guard-allowed')) {
    $('ab-guard-allowed').value = (guard.allowedHosts || []).join('\n');
  }

  const cosmetic = adblockConfig.cosmetic || {};
  if ($('ab-cos-frames')) $('ab-cos-frames').checked = cosmetic.hideAdFrames !== false;
  if ($('ab-cos-collapse')) $('ab-cos-collapse').checked = cosmetic.collapseEmptySlots !== false;
  if ($('ab-cos-antiadblock')) $('ab-cos-antiadblock').checked = cosmetic.neutralizeAntiAdblock !== false;

  if ($('ab-scriptlets')) $('ab-scriptlets').checked = adblockConfig.scriptlets !== false;

  if ($('ab-selectors') && document.activeElement !== $('ab-selectors')) {
    $('ab-selectors').value = (adblockConfig.customSelectors || []).join('\n');
  }
  if ($('ab-custom-rules') && document.activeElement !== $('ab-custom-rules')) {
    $('ab-custom-rules').value = (adblockConfig.customRules || []).join('\n');
  }

  renderGlobalToggles();
  renderDomainList('ab-whitelist-list', adblockConfig.whitelist, 'whitelist');
  renderDomainList('ab-blacklist-list', adblockConfig.blacklist, 'blacklist');
  renderAdblockStats();
}

async function addDomainToList(listName, input) {
  const value = input?.value?.trim();
  if (!value) return setStatus('دامنه را وارد کنید', true);
  const res = await send({ type: 'ADBLOCK_SET_LIST', list: listName, domain: value, present: true });
  if (res?.ok) {
    adblockConfig = res.config;
    input.value = '';
    renderAdblockTab();
    setStatus(listName === 'whitelist' ? '✓ به لیست سفید اضافه شد' : '✓ به لیست سیاه اضافه شد');
  } else {
    setStatus('دامنه نامعتبر است', true);
  }
}

function bindAdblockTab() {
  if (!$('ab-global-enabled')) return;

  $('ab-global-enabled').onchange = () => {
    patchAdblock({ enabled: $('ab-global-enabled').checked }, '✓ ذخیره شد');
  };

  $('ab-global-mode').onchange = () => {
    const mode = $('ab-global-mode').value;
    const patch = { mode };
    if (mode !== 'custom') patch.toggles = { ...(MODE_PRESETS[mode] || MODE_PRESETS.default) };
    patchAdblock(patch, '✓ حالت مسدودسازی ذخیره شد');
  };

  $('ab-show-badge').onchange = () => {
    patchAdblock({ showBadge: $('ab-show-badge').checked });
  };

  $('ab-scriptlets').onchange = () => {
    patchAdblock({ scriptlets: $('ab-scriptlets').checked }, '✓ ذخیره شد');
  };

  $('ab-save-guard').onclick = () => {
    patchAdblock({
      popupGuard: {
        ...(adblockConfig.popupGuard || {}),
        enabled: $('ab-guard-enabled').checked,
        blockWithoutGesture: $('ab-guard-nogesture').checked,
        blockThirdPartyPopup: $('ab-guard-thirdparty').checked,
        blockFromMedia: $('ab-guard-media').checked,
        allowedHosts: parseLines($('ab-guard-allowed').value)
      }
    }, '✓ تنظیمات محافظ پاپ‌آپ ذخیره شد');
  };

  $('ab-save-cosmetic').onclick = () => {
    patchAdblock({
      cosmetic: {
        ...(adblockConfig.cosmetic || {}),
        hideAdFrames: $('ab-cos-frames').checked,
        collapseEmptySlots: $('ab-cos-collapse').checked,
        neutralizeAntiAdblock: $('ab-cos-antiadblock').checked
      },
      customSelectors: parseLines($('ab-selectors').value)
    }, '✓ تنظیمات پاک‌سازی بصری ذخیره شد');
  };

  $('ab-save-rules').onclick = () => {
    patchAdblock({ customRules: parseLines($('ab-custom-rules').value) }, '✓ فیلترهای سفارشی ذخیره شد');
  };

  $('ab-whitelist-add').onclick = () => addDomainToList('whitelist', $('ab-whitelist-input'));
  $('ab-blacklist-add').onclick = () => addDomainToList('blacklist', $('ab-blacklist-input'));
  $('ab-whitelist-input').onkeydown = (e) => { if (e.key === 'Enter') $('ab-whitelist-add').click(); };
  $('ab-blacklist-input').onkeydown = (e) => { if (e.key === 'Enter') $('ab-blacklist-add').click(); };

  $('ab-refresh-stats').onclick = async () => {
    await loadAdblock();
    renderAdblockTab();
    setStatus('✓ آمار بروزرسانی شد');
  };

  $('ab-reset-stats').onclick = async () => {
    const res = await send({ type: 'ADBLOCK_RESET_STATS' });
    if (res?.ok) {
      adblockStats = res.stats;
      renderAdblockTab();
      setStatus('✓ آمار صفر شد');
    }
  };
}

/* Chat Prompt Submission */
async function submit(prompt) {
  const clean = prompt?.trim();
  if (!clean) return;
  if (!pageText) await refreshContext();

  history.push({ role: 'user', text: clean });
  renderHistory();
  $('prompt').value = '';

  // Live "thinking / typing" bubble while the model responds
  const chat = $('chat');
  const pending = document.createElement('div');
  pending.className = 'message assistant';
  const pendingBody = document.createElement('div');
  pendingBody.className = 'typing';
  pendingBody.innerHTML =
    '<span class="typing-dots"><i></i><i></i><i></i></span>' +
    '<span class="typing-text">در حال فکر کردن...</span>';
  pending.append(pendingBody);
  chat.append(pending);
  chat.scrollTop = chat.scrollHeight;

  // cycle the status label so it feels alive
  const steps = ['در حال فکر کردن...', 'در حال خواندن صفحه...', 'در حال نوشتن پاسخ...'];
  let step = 0;
  const statusTimer = setInterval(() => {
    const t = pendingBody.querySelector('.typing-text');
    if (t) t.textContent = steps[step % steps.length];
    step++;
  }, 2200);

  const provider = providers.find((p) => p.id === activeProviderId) || providers[0];
  const result = await send({
    type: 'AI_REQUEST',
    providerId: provider?.id,
    model: provider?.selectedModel,
    prompt: clean,
    pageText
  });

  clearInterval(statusTimer);
  pending.remove();

  history.push({
    role: 'assistant',
    text: result?.text || result?.error || 'خطا در ارتباط با مدل هوش مصنوعی.'
  });
  renderHistory();
  await saveHistory();
  if (!result?.ok) setStatus(result?.error || 'خطا', true);
  else setStatus('✓ پاسخ دریافت شد');
}

async function refreshContext() {
  $('context-status').textContent = 'در حال خواندن محتوای صفحه...';
  const context = await send({ type: 'GET_ACTIVE_CONTEXT' });
  if (context?.ok) {
    activeTab = context.tab;
    domain = context.domain || '';
    $('page-name').textContent = domain || 'صفحه فعال';
    historyKey = domain ? `domain:${domain}` : (activeTab ? `tab:${activeTab.id}` : '');

    const page = await send({ type: 'PAGE_ACTION' });
    pageText = page?.text || '';

    const store = await chrome.storage.local.get({
      providers: [],
      activeProviderId: '',
      translationAi: {},
      customTools: [],
      chatHistory: {}
    });

    providers = store.providers || [];
    activeProviderId = store.activeProviderId || (providers[0]?.id || '');
    translationAi = store.translationAi || {};
    tools = store.customTools || [];
    history = (historyKey && store.chatHistory) ? (store.chatHistory[historyKey] || []) : [];

    $('context-status').textContent = `${pageText.length.toLocaleString('fa-IR')} کاراکتر از صفحه بارگذاری شد`;
    renderActiveProviderLine();
    renderHistory();
    await loadAdblock();
    renderAdblockTab();
  } else {
    $('context-status').textContent = 'یک تب وب استاندارد را باز کنید';
  }
}

let openSettingsModal = null;

function bindModal() {
  const modal = $('settings-modal');

  function activateTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabId));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.toggle('active', c.id === `tab-${tabId}`));
  }

  openSettingsModal = async (tabId) => {
    modal.classList.remove('hidden');
    renderProvidersList();
    renderTranslationTab();
    renderTools();
    await loadAdblock();
    renderAdblockTab();
    if (tabId) activateTab(tabId);
  };

  $('open-settings').onclick = () => openSettingsModal();
  $('open-settings-inline').onclick = () => openSettingsModal();
  $('close-settings').onclick = () => modal.classList.add('hidden');

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.onclick = () => activateTab(btn.dataset.tab);
  });

  // Provider Type change -> toggle base URL input
  $('provider-type').onchange = () => {
    const isCustom = $('provider-type').value === 'custom';
    $('base-url-container').classList.toggle('hidden', !isCustom);
  };

  // Test & Save Provider
  $('test-save-provider').onclick = async () => {
    const type = $('provider-type').value;
    const label = $('provider-label').value.trim() || AI_PROVIDERS_CONFIG[type]?.name || type;
    const secret = $('provider-secret').value.trim();
    const baseUrl = $('provider-base-url')?.value.trim() || '';

    if (!secret && type !== 'custom') {
      return setStatus('لطفاً کلید API را وارد کنید.', true);
    }

    setStatus('در حال تست اتصال و دریافت مدل‌ها...');
    const result = await send({ type: 'FETCH_MODELS', providerType: type, apiKey: secret, baseUrl });

    const models = result?.ok && result.models?.length ? result.models : AI_PROVIDERS_CONFIG[type]?.defaultModels || [];
    const newProvider = {
      id: crypto.randomUUID(),
      type,
      label,
      secret,
      baseUrl,
      models,
      selectedModel: models[0]?.id || '',
      createdAt: Date.now()
    };

    providers.push(newProvider);
    if (!activeProviderId) activeProviderId = newProvider.id;

    await persistProviders();
    $('provider-secret').value = '';
    $('provider-label').value = '';
    renderProvidersList();
    setStatus(`✓ اتصال به ${label} برقرار شد و ${models.length} مدل لود شدند.`);
  };

  // Save Translation Config
  $('save-trans-config').onclick = async () => {
    translationAi = {
      providerId: $('ai-trans-provider').value,
      model: $('ai-trans-model').value,
      tone: $('ai-trans-tone')?.value || 'standard',
      customPrompt: $('ai-trans-prompt')?.value || ''
    };
    await persistProviders();
    setStatus('✓ تنظیمات ترجمه هوش مصنوعی ذخیره شد.');
  };

  // Add Tool
  $('add-tool-btn').onclick = async () => {
    const name = window.prompt('نام ابزار:');
    if (!name?.trim()) return;
    const prompt = window.prompt('پرامپتی که می‌خواهید با کانتکست صفحه اجرا شود:');
    if (!prompt?.trim()) return;
    tools.push({ id: crypto.randomUUID(), name: name.trim(), prompt: prompt.trim() });
    await chrome.storage.local.set({ customTools: tools });
    renderTools();
  };

  // Export Backup
  $('export-backup-btn').onclick = async () => {
    try {
      const data = await chrome.storage.local.get(null);
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `easyweb-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('✓ فایل پشتیبان دانلود شد');
    } catch (err) {
      console.error('[EasyWeb Export Error]:', err);
      setStatus('خطا در خروجی: ' + (err.message || ''), true);
    }
  };

  // Import Backup
  $('import-backup-file').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (typeof data !== 'object' || data === null) {
        throw new Error('فرمت فایل پشتیبان نامعتبر است.');
      }
      await chrome.storage.local.set(data);
      setStatus('✓ تمامی اطلاعات و تنظیمات با موفقیت بازیابی شدند.');
      await refreshContext();
      renderProvidersList();
      renderTranslationTab();
      renderTools();
    } catch (err) {
      console.error('[EasyWeb Import Error]:', err);
      setStatus('خطا در بازیابی فایل: ' + (err.message || ''), true);
    }
    e.target.value = '';
  };

  // Clear All Stored Data
  const clearBtn = $('clear-all-data-btn');
  if (clearBtn) {
    clearBtn.onclick = async () => {
      const ok = confirm('هشدار: آیا مطمئن هستید؟ تمامی داده‌های ذخیره‌شده توسط مرورگر (تنظیمات سایت‌ها، فونت‌های آپلودشده، اتصالات هوش مصنوعی، تاریخچه گفتگوها و آمار) به طور کامل پاک خواهند شد.');
      if (!ok) return;
      try {
        await chrome.storage.local.clear();
        await chrome.storage.local.set(DEFAULTS);
        setStatus('✓ تمام داده‌های مرورگر پاک شدند و افزونه به حالت پیش‌فرض بازگشت.');
        await refreshContext();
        renderProvidersList();
        renderTranslationTab();
        renderTools();
        await renderAdblockTab();
      } catch (err) {
        console.error('[EasyWeb Clear Error]:', err);
        setStatus('خطا در پاک‌سازی داده‌ها: ' + (err.message || ''), true);
      }
    };
  }
}

function bind() {
  bindModal();
  bindAdblockTab();

  $('composer').onsubmit = (e) => {
    e.preventDefault();
    submit($('prompt').value);
  };

  document.querySelectorAll('[data-action]').forEach((btn) => {
    btn.onclick = () => {
      const prompts = {
        summarize: 'این صفحه را به صورت خلاصه، شفاف و با ساختار بولت‌پوینت‌های کاربردی به فارسی توضیح بده.',
        translate: 'محتوای اصلی و متن‌های مهم این صفحه را با ترجمه‌ای روان، دقیق و خوانا به فارسی بازنویسی کن.',
        extract: 'نکات کلیدی، داده‌ها، اسامی، تاریخ‌ها و حقایق مهم این صفحه را استخراج کن.'
      };
      submit(prompts[btn.dataset.action]);
    };
  });

  $('refresh-context').onclick = refreshContext;
  $('clear-chat-btn').onclick = clearChat;
}

bind();
refreshContext();

/**
 * The popup's "advanced settings" link deep-links straight to the blocker tab.
 * Handled both on load (panel was closed) and through a storage change (panel
 * was already open, so the script would not run again).
 */
async function openRequestedTab(tabId) {
  if (!tabId || !openSettingsModal) return;
  try {
    await chrome.storage.local.remove('sidebarTab');
  } catch (_) {}
  await openSettingsModal(tabId);
}

(async () => {
  try {
    const store = await chrome.storage.local.get({ sidebarTab: '' });
    await openRequestedTab(store.sidebarTab);
  } catch (_) {}
})();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.sidebarTab?.newValue) openRequestedTab(changes.sidebarTab.newValue);
});
})();
