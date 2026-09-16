/**
 * EasyWeb — dist integrity audit
 *
 * Verifies that the packaged extension in dist/ is actually loadable: every file
 * the manifest points at exists, every declarativeNetRequest rule-set is valid
 * JSON with rules in it, every HTML/CSS asset reference resolves, and every
 * bundle parses. Run after a build; exits non-zero on any problem.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');

const errors = [];
const notes = [];

const exists = (rel) => fs.existsSync(path.join(DIST, rel));
const read = (rel) => fs.readFileSync(path.join(DIST, rel), 'utf8');

if (!fs.existsSync(DIST)) {
  console.error('✗ dist/ does not exist — run `npm run build` first.');
  process.exit(1);
}

/* ---------------- manifest ---------------- */

let manifest;
try {
  manifest = JSON.parse(read('manifest.json'));
} catch (err) {
  console.error(`✗ manifest.json is not valid JSON: ${err.message}`);
  process.exit(1);
}

notes.push(`manifest: ${manifest.name} v${manifest.version} (MV${manifest.manifest_version})`);

if (!manifest.background?.service_worker || !exists(manifest.background.service_worker)) {
  errors.push(`missing service worker: ${manifest.background?.service_worker}`);
}
if (manifest.action?.default_popup && !exists(manifest.action.default_popup)) {
  errors.push(`missing popup: ${manifest.action.default_popup}`);
}
for (const [size, icon] of Object.entries(manifest.action?.default_icon || {})) {
  if (!exists(icon)) errors.push(`missing icon ${size}: ${icon}`);
}
if (manifest.side_panel?.default_path && !exists(manifest.side_panel.default_path)) {
  errors.push(`missing side panel: ${manifest.side_panel.default_path}`);
}
if (manifest.options_page && !exists(manifest.options_page)) {
  errors.push(`missing options page: ${manifest.options_page}`);
}

(manifest.content_scripts || []).forEach((entry, index) => {
  for (const file of entry.js || []) {
    if (!exists(file)) errors.push(`missing content script [${index}]: ${file}`);
  }
  if (!entry.matches?.length) errors.push(`content script [${index}] has no matches`);
  if (!entry.run_at) errors.push(`content script [${index}] has no run_at`);
});

/* ---------------- declarativeNetRequest rule-sets ---------------- */

const ruleSets = manifest.declarative_net_request?.rule_resources || [];
if (!ruleSets.length) errors.push('no declarativeNetRequest rule-sets declared');

let totalRules = 0;
for (const resource of ruleSets) {
  if (!exists(resource.path)) {
    errors.push(`missing ruleset file: ${resource.path}`);
    continue;
  }
  let rules;
  try {
    rules = JSON.parse(read(resource.path));
  } catch (err) {
    errors.push(`invalid JSON in ${resource.path}: ${err.message}`);
    continue;
  }
  if (!Array.isArray(rules) || !rules.length) {
    errors.push(`empty ruleset: ${resource.path}`);
    continue;
  }

  const ids = new Set();
  for (const rule of rules) {
    if (typeof rule.id !== 'number') errors.push(`${resource.path}: rule without a numeric id`);
    else if (ids.has(rule.id)) errors.push(`${resource.path}: duplicate rule id ${rule.id}`);
    ids.add(rule.id);

    if (!rule.action?.type) errors.push(`${resource.path}: rule ${rule.id} has no action type`);
    if (!rule.condition?.resourceTypes?.length) {
      errors.push(`${resource.path}: rule ${rule.id} has no resourceTypes`);
    }
    const condition = rule.condition || {};
    if (!condition.urlFilter && !condition.regexFilter && !condition.domainType) {
      errors.push(`${resource.path}: rule ${rule.id} has neither a pattern nor domainType`);
    }
    if (condition.regexFilter) {
      try {
        new RegExp(condition.regexFilter);
      } catch (_) {
        errors.push(`${resource.path}: rule ${rule.id} has an invalid regex`);
      }
    }
    if (rule.action.type === 'redirect') {
      const target = rule.action.redirect?.extensionPath;
      if (!target) errors.push(`${resource.path}: rule ${rule.id} redirects nowhere`);
      else if (!exists(target.replace(/^\//, ''))) {
        errors.push(`${resource.path}: rule ${rule.id} redirects to missing file ${target}`);
      }
    }
  }

  totalRules += rules.length;
  notes.push(`ruleset ${resource.id.padEnd(20)} ${resource.path.padEnd(20)} ${String(rules.length).padStart(4)} rules  enabled=${resource.enabled}`);
}

if (totalRules > 30000) errors.push(`static rule count ${totalRules} exceeds the guaranteed Chrome budget of 30000`);

/* ---------------- web accessible resources ---------------- */

for (const entry of manifest.web_accessible_resources || []) {
  if (!entry.matches?.length) errors.push('web_accessible_resources entry has no matches');
  for (const pattern of entry.resources || []) {
    if (pattern.endsWith('/*')) {
      if (!fs.existsSync(path.join(DIST, pattern.replace(/\/\*$/, '')))) {
        errors.push(`web_accessible_resources directory missing: ${pattern}`);
      }
    } else if (!exists(pattern)) {
      errors.push(`web_accessible_resources file missing: ${pattern}`);
    }
  }
}

/* ---------------- HTML / CSS asset references ---------------- */

for (const html of ['popup.html', 'sidebar.html']) {
  if (!exists(html)) {
    errors.push(`missing ${html}`);
    continue;
  }
  const source = read(html);
  for (const match of source.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const ref = match[1];
    if (/^(https?:|data:|#)/.test(ref)) continue;
    if (!exists(ref)) errors.push(`${html} references a missing file: ${ref}`);
  }
}

for (const css of ['popup.css', 'sidebar.css']) {
  if (!exists(css)) {
    errors.push(`missing ${css}`);
    continue;
  }
  const source = read(css);
  for (const match of source.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)) {
    const ref = match[1];
    if (/^(https?:|data:)/.test(ref)) continue;
    if (!exists(ref)) errors.push(`${css} references a missing file: ${ref}`);
  }
}

/* ---------------- bundles parse ---------------- */

for (const file of ['background.js', 'content.js', 'guard.js', 'inject.js', 'popup.js', 'sidebar.js']) {
  if (!exists(file)) {
    errors.push(`missing bundle: ${file}`);
    continue;
  }
  try {
    new vm.Script(read(file), { filename: file });
  } catch (err) {
    errors.push(`syntax error in ${file}: ${err.message}`);
  }
}

/* ---------------- no leftover module syntax ---------------- */

for (const file of ['background.js', 'content.js', 'guard.js', 'inject.js', 'popup.js', 'sidebar.js']) {
  if (!exists(file)) continue;
  if (/^\s*(?:import|export)\s/m.test(read(file))) {
    errors.push(`${file} still contains import/export statements — the bundler did not strip them`);
  }
}

/* ---------------- MAIN-world bundle must not touch chrome.* ---------------- */

// inject.js runs in the page's own JavaScript context, where no chrome.* API
// exists. A single reference would throw and silently disable the whole engine.
if (exists('inject.js')) {
  const source = read('inject.js');
  const chromeUse = source.match(/\bchrome\.(?:runtime|storage|tabs|scripting|declarativeNetRequest|webNavigation|sidePanel)\b/);
  if (chromeUse) {
    errors.push(`inject.js runs in the MAIN world but references ${chromeUse[0]}, which does not exist there`);
  }
  if (!/postMessage/.test(source)) {
    errors.push('inject.js does not read its configuration over postMessage');
  }
}

/* ---------------- MAIN-world manifest entry ---------------- */

const mainWorld = (manifest.content_scripts || []).find((entry) => entry.world === 'MAIN');
if (!mainWorld) {
  errors.push('no MAIN-world content script is declared — first-party ad removal cannot work');
} else {
  if (!mainWorld.js?.includes('inject.js')) errors.push('the MAIN-world entry does not load inject.js');
  if (mainWorld.run_at !== 'document_start') {
    errors.push('the MAIN-world entry must run at document_start so it patches the page before the player reads anything');
  }
  if (!mainWorld.matches?.length) errors.push('the MAIN-world entry has no matches');
  // It must never be injected into every page: patching fetch globally is both a
  // performance cost and a compatibility risk.
  if (mainWorld.matches?.some((pattern) => pattern === '<all_urls>')) {
    errors.push('the MAIN-world entry must be scoped to specific sites, not <all_urls>');
  }
}

/* ---------------- report ---------------- */

console.log('🔎 dist integrity audit');
for (const note of notes) console.log(`   ${note}`);
console.log(`   total static rules: ${totalRules}`);
console.log('');

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s) found:`);
  for (const error of errors) console.error(`   - ${error}`);
  process.exitCode = 1;
} else {
  console.log('✓ Extension package is complete and loadable.');
}
