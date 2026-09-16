/**
 * Site Model, State Synchronization and Migration Helpers
 */
import { DEFAULT_SITE } from './defaults.js';
import { DEFAULT_BLOCKER, normalizePickedRules } from './adblock.js';

export function mergeSite(value = {}) {
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
export function mergeBlocker(value) {
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

export function migrateSite(value) {
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

export function syncSiteEnabled(site) {
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
