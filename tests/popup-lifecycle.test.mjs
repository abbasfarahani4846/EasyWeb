/**
 * Popup lifecycle tests.
 *
 * Two failures are guarded against here, both reported from real use:
 *
 *  1. The panel opened stuck on «در حال بارگذاری…» with empty dropdowns, and
 *     only worked after closing and reopening it. Cause: `init()` awaited
 *     `chrome.runtime.sendMessage` unguarded, so a rejection while the service
 *     worker was still starting aborted the whole function and `render()` never
 *     ran. Reopening retried and succeeded, which is exactly the "sometimes it
 *     works" symptom.
 *
 *  2. The list was not live: deleting a rule persisted, but the panel kept
 *     showing the old list until it was reopened.
 *
 * The test drives the real `src/popup/popup.js` against a stub DOM built from
 * popup.html and a stub `chrome` API.
 */

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; return; }
  fail++;
  console.log(`FAIL ${label}\n   expected ${e}\n   actual   ${a}`);
}

/* ------------------------------------------------------------------ */
/* Stub DOM, built from the real popup.html                            */
/* ------------------------------------------------------------------ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ADBLOCK, resolveToggles, hostInList } from '../src/shared/adblock.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const popupHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'popup', 'popup.html'), 'utf8');

/** Ids declared in popup.html — anything the popup looks up must exist here. */
const htmlIds = new Set();
for (const match of popupHtml.matchAll(/\bid="([^"]+)"/g)) htmlIds.add(match[1]);

/** The placeholder the panel shows before the first render. */
const LOADING_TEXT = 'در حال بارگذاری…';

function makeElement(tag = 'div', id = '') {
  const el = {
    tagName: tag.toUpperCase(),
    id,
    children: [],
    dataset: {},
    style: { setProperty() {}, removeProperty() {}, getPropertyValue: () => '' },
    classList: {
      _set: new Set(),
      add(...c) { c.forEach((x) => this._set.add(x)); },
      remove(...c) { c.forEach((x) => this._set.delete(x)); },
      toggle(c, on) { if (on === undefined) this._set.has(c) ? this._set.delete(c) : this._set.add(c); else on ? this._set.add(c) : this._set.delete(c); },
      contains(c) { return this._set.has(c); }
    },
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    hidden: false,
    title: '',
    className: '',
    append(...kids) { el.children.push(...kids); },
    appendChild(kid) { el.children.push(kid); return kid; },
    replaceChildren(...kids) { el.children = kids; },
    insertBefore(kid) { el.children.push(kid); return kid; },
    removeChild(kid) { el.children = el.children.filter((c) => c !== kid); return kid; },
    remove() {},
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {}, hasAttribute() { return false; },
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    focus() {},
    onclick: null, onchange: null, oninput: null
  };
  return el;
}

function createEnv() {
  const elements = new Map();
  for (const id of htmlIds) elements.set(id, makeElement('div', id));
  // Seed the placeholder the real HTML ships with.
  if (elements.has('adblock-status')) elements.get('adblock-status').innerHTML = LOADING_TEXT;

  const storage = {};
  const changeListeners = [];

  const chrome = {
    runtime: {
      id: 'test-extension',
      sendMessage: async () => ({ ok: false, error: 'not stubbed' }),
      onMessage: { addListener() {} }
    },
    storage: {
      local: {
        async get(defaults) {
          if (!defaults || typeof defaults !== 'object') return { ...storage };
          const out = {};
          for (const [key, value] of Object.entries(defaults)) {
            out[key] = Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : value;
          }
          return out;
        },
        async set(patch) { Object.assign(storage, patch); },
        async remove(key) { delete storage[key]; }
      },
      onChanged: {
        addListener(fn) { changeListeners.push(fn); }
      }
    },
    tabs: {
      async sendMessage() { throw new Error('no content script'); },
      async get() { return { id: 1, url: 'https://example.com/' }; }
    },
    scripting: { async executeScript() { throw new Error('not allowed'); } },
    sidePanel: { async open() { throw new Error('not allowed'); } }
  };

  const document = {
    activeElement: null,
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => makeElement(tag),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    documentElement: makeElement('html'),
    head: makeElement('head'),
    body: makeElement('body')
  };

  const window = {
    addEventListener() {},
    close() {},
    setTimeout,
    clearTimeout
  };

  return {
    chrome,
    document,
    window,
    elements,
    storage,
    emitChange(changes) {
      for (const fn of changeListeners) fn(changes, 'local');
    }
  };
}

function installGlobals(env) {
  globalThis.chrome = env.chrome;
  globalThis.document = env.document;
  globalThis.window = env.window;
}

const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A status response the popup can render from, derived from live storage. */
function adblockStatus(env, domain, site) {
  const global = { ...DEFAULT_ADBLOCK, ...(env.storage.adblock || {}) };
  const toggles = resolveToggles(global, site, domain);
  return {
    ok: true,
    domain,
    global,
    site,
    toggles,
    stats: { total: 0, popups: 0, cosmetic: 0, perDomain: {} },
    tabCount: 0,
    whitelisted: hostInList(domain, global.whitelist),
    blacklisted: hostInList(domain, global.blacklist)
  };
}

/* ------------------------------------------------------------------ */
/* Scenario 1 — the service worker is unreachable                      */
/* ------------------------------------------------------------------ */

{
  const env = createEnv();
  env.chrome.runtime.sendMessage = async (message) => {
    if (message.type === 'GET_ACTIVE_CONTEXT') {
      throw new Error('Could not establish connection. Receiving end does not exist.');
    }
    return { ok: false, error: 'unreachable' };
  };
  installGlobals(env);

  await import('../src/popup/popup.js?scenario=unreachable');
  await settle(800);

  const el = (id) => env.elements.get(id);
  check('shell still painted: translate languages', el('translate-target-lang').children.length > 0, true);
  check('shell still painted: adblock modes', el('adblock-mode').children.length > 0, true);
  check('loading placeholder replaced', el('adblock-status').innerHTML !== LOADING_TEXT, true);
  check('direction select rendered', el('direction-value').value, 'rtl');
}

/* ------------------------------------------------------------------ */
/* Scenario 2 — normal open, then a live storage change                */
/* ------------------------------------------------------------------ */

{
  const env = createEnv();
  const picked = [{ id: 'p1', selector: '.ew-ad', label: 'ew-ad', mode: 'hide', enabled: true }];
  env.storage.settings = {
    'example.com': { blocker: { enabled: true, mode: 'inherit', toggles: null, picked } }
  };

  env.chrome.runtime.sendMessage = async (message) => {
    if (message.type === 'GET_ACTIVE_CONTEXT') {
      return { ok: true, tab: { id: 1 }, domain: 'example.com', settings: env.storage.settings['example.com'] };
    }
    if (message.type === 'GET_PICKER_RESULT') return { ok: true, result: null };
    if (message.type === 'ADBLOCK_STATUS') {
      return adblockStatus(env, "example.com", env.storage.settings["example.com"]);
    }
    return { ok: true };
  };
  installGlobals(env);

  await import('../src/popup/popup.js?scenario=live');
  await settle(800);

  const el = (id) => env.elements.get(id);
  check('domain shown', el('domain').textContent, 'example.com');
  check('picked rule listed', el('adblock-picked-list').children.length, 1);
  check('picked list visible', el('adblock-picked-list').classList.contains('hidden'), false);

  /* The user deletes the rule. The panel must follow without being reopened. */
  env.storage.settings = {
    'example.com': { blocker: { enabled: true, mode: 'inherit', toggles: null, picked: [] } }
  };
  env.emitChange({ settings: { newValue: env.storage.settings, oldValue: null } });
  await settle(500);

  check('list cleared live after deletion', el('adblock-picked-list').children.length, 0);
  check('picked list hidden when empty', el('adblock-picked-list').classList.contains('hidden'), true);

  /* Adding a rule back from the in-page picker must also show up live. */
  env.storage.settings = {
    'example.com': {
      blocker: {
        enabled: true,
        mode: 'inherit',
        toggles: null,
        picked: [...picked, { id: 'p2', selector: '.ew-ad2', label: 'ew-ad2', mode: 'remove', enabled: true }]
      }
    }
  };
  env.emitChange({ settings: { newValue: env.storage.settings, oldValue: null } });
  await settle(500);

  check('list grows live after a pick', el('adblock-picked-list').children.length, 2);

  /* A global-config change must repaint too. */
  env.storage.adblock = { ...DEFAULT_ADBLOCK, enabled: false };
  env.emitChange({ adblock: { newValue: env.storage.adblock, oldValue: null } });
  await settle(500);

  check('global off reflected in status', el('adblock-status').innerHTML.includes('خاموش'), true);
}

/* ------------------------------------------------------------------ */
/* Scenario 3 — a failed write still refreshes the list                */
/* ------------------------------------------------------------------ */

{
  const env = createEnv();
  env.storage.settings = {
    'example.com': {
      blocker: { enabled: true, mode: 'inherit', toggles: null, picked: [{ id: 'p1', selector: '.a', label: 'a', mode: 'hide', enabled: true }] }
    }
  };
  let failWrites = false;

  env.chrome.runtime.sendMessage = async (message) => {
    if (message.type === 'GET_ACTIVE_CONTEXT') {
      return { ok: true, tab: { id: 1 }, domain: 'example.com', settings: env.storage.settings['example.com'] };
    }
    if (message.type === 'GET_PICKER_RESULT') return { ok: true, result: null };
    if (message.type === 'ADBLOCK_STATUS') {
      return adblockStatus(env, "example.com", env.storage.settings["example.com"]);
    }
    if (message.type === 'ADBLOCK_SET_SITE') {
      if (failWrites) throw new Error('Could not establish connection.');
      return { ok: true };
    }
    return { ok: true };
  };
  installGlobals(env);

  await import('../src/popup/popup.js?scenario=writefail');
  await settle(800);

  const el = (id) => env.elements.get(id);
  check('rule listed before the write', el('adblock-picked-list').children.length, 1);

  // The background applies the change but the reply never reaches the popup.
  failWrites = true;
  env.storage.settings = {
    'example.com': { blocker: { enabled: true, mode: 'inherit', toggles: null, picked: [] } }
  };
  env.emitChange({ settings: { newValue: env.storage.settings, oldValue: null } });
  await settle(500);

  check('list refreshed even though the write reply failed', el('adblock-picked-list').children.length, 0);
}

/* ------------------------------------------------------------------ */
/* Scenario 4 — a switched-off feature shows only its title and switch */
/* ------------------------------------------------------------------ */

{
  const env = createEnv();
  env.storage.settings = { 'example.com': {} };

  env.chrome.runtime.sendMessage = async (message) => {
    if (message.type === 'GET_ACTIVE_CONTEXT') {
      return { ok: true, tab: { id: 1 }, domain: 'example.com', settings: env.storage.settings['example.com'] };
    }
    if (message.type === 'GET_PICKER_RESULT') return { ok: true, result: null };
    if (message.type === 'ADBLOCK_STATUS') {
      return adblockStatus(env, 'example.com', env.storage.settings['example.com']);
    }
    return { ok: true };
  };
  installGlobals(env);

  await import('../src/popup/popup.js?scenario=collapse');
  await settle(800);

  const el = (id) => env.elements.get(id);
  const collapsed = (id) => el(id).classList.contains('collapsed');

  check('layout collapsed while off', collapsed('layout-card'), true);
  check('type collapsed while off', collapsed('type-card'), true);
  check('translate collapsed while off', collapsed('translate-card'), true);
  check('adblock expanded while on', collapsed('adblock-card'), false);

  /* Turning a feature on must reveal its controls again. */
  env.storage.settings = {
    'example.com': { direction: { enabled: true, scope: 'page', value: 'rtl' } }
  };
  env.emitChange({ settings: { newValue: env.storage.settings, oldValue: null } });
  await settle(500);

  check('layout expands when enabled', collapsed('layout-card'), false);
  check('type stays collapsed', collapsed('type-card'), true);

  /* Turning it back off collapses it again. */
  env.storage.settings = {
    'example.com': { direction: { enabled: false, scope: 'page', value: 'rtl' } }
  };
  env.emitChange({ settings: { newValue: env.storage.settings, oldValue: null } });
  await settle(500);

  check('layout collapses again when disabled', collapsed('layout-card'), true);

  /* A whitelisted site collapses the blocker and explains why in the header,
     because the status line is no longer visible. */
  env.storage.adblock = { ...DEFAULT_ADBLOCK, whitelist: ['example.com'] };
  env.emitChange({ adblock: { newValue: env.storage.adblock, oldValue: null } });
  await settle(500);

  check('adblock collapses when whitelisted', collapsed('adblock-card'), true);
  check('whitelist reason shown in the header', el('adblock-badge').textContent, 'لیست سفید');
  check('header badge visible', el('adblock-badge').classList.contains('hidden'), false);

  /* Removing the whitelist entry brings the card back. */
  env.storage.adblock = { ...DEFAULT_ADBLOCK };
  env.emitChange({ adblock: { newValue: env.storage.adblock, oldValue: null } });
  await settle(500);

  check('adblock expands after leaving the whitelist', collapsed('adblock-card'), false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
