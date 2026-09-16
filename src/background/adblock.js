/**
 * EasyWeb Ad Blocker — Background Engine
 *
 * Owns the declarativeNetRequest side of the blocker:
 *   • enables / disables the static filter rule-sets from the global toggles
 *   • keeps a live set of session rules for whitelist, blacklist, per-site
 *     "strict" hardening and user-written custom filters
 *   • maintains blocking statistics and the toolbar badge
 */

import {
  DEFAULT_ADBLOCK,
  ADBLOCK_STORAGE_KEY,
  ADBLOCK_STATS_KEY,
  RULESET_IDS,
  resolveToggles,
  parseCustomRule,
  normalizeHost,
  hostInList,
  mergeStats,
  formatCount,
  NETWORK_RESOURCE_TYPES
} from '../shared/adblock.js';
import { STORAGE_KEY } from '../shared/constants.js';
import { STRICT_SITE_FILTERS, SESSION_RULE_RANGES } from '../rules/strict.js';

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

export async function readState() {
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

export function getConfig() {
  return cachedConfig;
}

/** Synchronous toggle lookup for the popup guard (state is refreshed on boot). */
export function togglesForDomain(domain) {
  const host = normalizeHost(domain);
  const site = cachedSites[host] || null;
  return resolveToggles(cachedConfig, site, host);
}

export function popupGuardSettings() {
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
export function buildSessionRules(config = cachedConfig, sites = cachedSites) {
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

export async function getStats() {
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
export async function recordStats(patch = {}, domain = '') {
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

export async function resetStats() {
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
export async function getTabBlockedCount(tabId) {
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

export async function updateBadge(tabId) {
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
export function scheduleRefresh(delay = 120) {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    refresh().catch((err) => console.warn('[EasyWeb Adblock] refresh failed:', err));
  }, delay);
}

export async function refresh() {
  await readState();
  await applyStaticRulesets();
  await applySessionRules();
  return { ok: true, enabled: cachedConfig.enabled, toggles: cachedConfig.toggles };
}

/** Everything the popup / sidebar needs to render the blocker UI. */
export async function getStatus(tab) {
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

export const getAdblockStatus = getStatus;

/** Patch the global configuration and re-apply. */
export async function updateGlobal(patch = {}) {
  const store = await chrome.storage.local.get({ [ADBLOCK_STORAGE_KEY]: DEFAULT_ADBLOCK });
  const next = normalizeConfig({ ...(store[ADBLOCK_STORAGE_KEY] || {}), ...patch });
  await chrome.storage.local.set({ [ADBLOCK_STORAGE_KEY]: next });
  await refresh();
  return next;
}

export const updateAdblockGlobal = updateGlobal;

/** Add / remove a domain from the whitelist or blacklist. */
export async function setDomainList(listName, domain, present) {
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
export async function updateSiteBlocker(domain, blocker) {
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

export async function toggleSiteMode(domain, mode) {
  return updateSiteBlocker(domain, { mode });
}

/** Attach the badge + storage listeners. Called once from the service worker. */
export function installAdblockListeners() {
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
