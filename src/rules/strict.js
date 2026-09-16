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

export const STRICT_SITE_FILTERS = [
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
export const SESSION_RULE_RANGES = {
  allow: { start: 1, size: 900 },
  block: { start: 901, size: 900 },
  strict: { start: 1801, size: 1500 },
  custom: { start: 3301, size: 800 }
};
