/**
 * EasyWeb Ad Blocker — Filter list compiler
 *
 * Turns the readable catalogues in `lists.js` into valid declarativeNetRequest
 * rule-set arrays. Pure and dependency-free so it can be unit tested.
 *
 * Accepted entry shapes:
 *   "||ads.example.com^"                                  -> block
 *   "@@||trusted.example^"                                -> allow
 *   "/banner\\d+/"                                         -> block by regex
 *   { f: "||ads.example.com^", t: ["script"], p: 2 }      -> per-entry overrides
 *   { r: "^https?://x/ads\\.js$", t: ["script"], redirect: "noop" }
 */

/**
 * Compile one filter list into an array of declarativeNetRequest rules.
 * @param {{resourceTypes: string[], filters: Array<string|object>}} list
 * @returns {Array<object>} rules
 */
export function compileList(list) {
  const rules = [];
  const seen = new Set();
  let id = 1;

  for (const entry of list.filters || []) {
    const isObject = entry && typeof entry === 'object';

    // `f` is the urlFilter form, `r` the regex form. A plain string entry is a
    // urlFilter. Treating these separately matters: reading `entry.f` from a
    // regex-only entry used to yield the string "undefined", which collapsed
    // every regex rule into a single de-duplicated rule.
    let filter = String((isObject ? entry.f : entry) || '').trim();
    let regex = String((isObject ? entry.r : '') || '').trim();

    // Convenience: a plain string wrapped in slashes is a regex filter.
    if (!regex && filter.startsWith('/') && filter.endsWith('/') && filter.length > 2) {
      regex = filter.slice(1, -1);
      filter = '';
    }

    if (!filter && !regex) continue;

    const resourceTypes = (isObject && entry.t) || list.resourceTypes;
    const priority = (isObject && entry.p) || 1;

    let action = 'block';
    if (filter.startsWith('@@')) {
      action = 'allow';
      filter = filter.slice(2).trim();
    }
    if (!filter && !regex) continue;

    const signature = `${action}|${resourceTypes.join(',')}|${regex || filter}`;
    if (seen.has(signature)) continue;
    seen.add(signature);

    const condition = { resourceTypes };
    if (regex) {
      try {
        new RegExp(regex);
      } catch (_) {
        continue;
      }
      condition.regexFilter = regex;
    } else {
      condition.urlFilter = filter;
    }

    const ruleAction = (isObject && entry.redirect)
      ? { type: 'redirect', redirect: { extensionPath: `/rules/${entry.redirect}.js` } }
      : { type: action };

    rules.push({ id: id++, priority, action: ruleAction, condition });
  }

  return rules;
}

/**
 * Compile every list in a FILTER_LISTS map.
 * @returns {{files: Record<string, Array<object>>, summary: string}}
 */
export function compileAll(filterLists) {
  const files = {};
  const summary = [];

  for (const [name, list] of Object.entries(filterLists)) {
    const rules = compileList(list);
    files[list.file] = rules;
    summary.push(`${name}=${rules.length}`);
  }

  return { files, summary: summary.join(', ') };
}
