/**
 * Regression tests for the cosmetic engine's reversibility.
 *
 * The bug this guards against: hiding applied an inline `display:none !important`
 * and deleting detached the node, but nothing ever undid either — so removing or
 * disabling a picked rule left the section hidden (or deleted) forever.
 *
 * A minimal DOM shim stands in for the browser. Its `querySelectorAll` only
 * understands the selectors the test registers; anything else throws, which is
 * exactly how the real engine treats an unparseable selector (it is dropped).
 * The test classes are deliberately NOT part of the built-in catalogue, so only
 * the picked rules under test can match them.
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
/* Minimal DOM                                                         */
/* ------------------------------------------------------------------ */

const allElements = [];
const matchers = new Map();

class Style {
  constructor(element) {
    this.element = element;
    this.props = new Map();
  }
  setProperty(name, value) {
    this.props.set(name, String(value));
    this.sync();
  }
  removeProperty(name) {
    this.props.delete(name);
    this.sync();
  }
  getPropertyValue(name) {
    return this.props.has(name) ? this.props.get(name) : '';
  }
  /** Mirror the inline styles back onto the style attribute, like a browser. */
  sync() {
    const text = [...this.props].map(([k, v]) => `${k}: ${v}`).join('; ');
    this.element.attributes.set('style', text);
  }
  load(text) {
    this.props.clear();
    for (const part of String(text).split(';')) {
      const index = part.indexOf(':');
      if (index > 0) {
        this.props.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
      }
    }
  }
}

class Element {
  constructor(tag, opts = {}) {
    this.tagName = tag.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.style = new Style(this);
    this.classList = opts.classList ? [...opts.classList] : [];
    this.id = opts.id || '';
    this._text = '';
    if (this.id) this.attributes.set('id', this.id);
    allElements.push(this);
  }
  get nextSibling() {
    if (!this.parentNode) return null;
    const index = this.parentNode.children.indexOf(this);
    return this.parentNode.children[index + 1] || null;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'id') this.id = String(value);
    if (name === 'style') this.style.load(value);
  }
  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'id') this.id = '';
    if (name === 'style') this.style.props.clear();
  }
  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }
  insertBefore(node, reference) {
    if (node.parentNode) node.parentNode.removeChild(node);
    const index = reference ? this.children.indexOf(reference) : -1;
    if (index >= 0) this.children.splice(index, 0, node);
    else this.children.push(node);
    node.parentNode = this;
    return node;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  get textContent() { return this._text; }
  set textContent(value) { this._text = String(value); }
}

const documentElement = new Element('html');
const head = new Element('head');
const body = new Element('body');
documentElement.appendChild(head);
documentElement.appendChild(body);

const document = {
  documentElement,
  head,
  body,
  getElementById(id) { return allElements.find((el) => el.id === id) || null; },
  createElement(tag) { return new Element(tag); },
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
  querySelectorAll(selector) {
    const parts = String(selector).split(',').map((s) => s.trim()).filter(Boolean);
    const out = [];
    for (const part of parts) {
      const match = matchers.get(part);
      if (!match) throw new Error(`unsupported selector: ${part}`);
      for (const el of allElements) {
        if (el.parentNode === null) continue;
        if (match(el) && !out.includes(el)) out.push(el);
      }
    }
    return out;
  }
};

matchers.set('.ew-hide', (el) => el.classList.includes('ew-hide'));
matchers.set('.ew-remove', (el) => el.classList.includes('ew-remove'));
matchers.set('[data-easyweb-adblock="hidden"]', (el) => el.getAttribute('data-easyweb-adblock') === 'hidden');

globalThis.document = document;
globalThis.location = { hostname: 'example.com', href: 'https://example.com/' };
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};

const {
  startCosmeticEngine,
  stopCosmeticEngine,
  injectCosmeticCss,
  restoreCosmetic,
  sweepNow
} = await import('../src/content/features/cosmetic.js');

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const FLAG = 'data-easyweb-adblock';
const PREV = 'data-easyweb-adblock-style';

/** Mirrors what content/index.js does for a given rule set. */
function apply({ cosmetic = true, picked = [] } = {}) {
  const toggles = { cosmetic };
  const config = {};
  restoreCosmetic();
  injectCosmeticCss({ toggles, config, customRules: [], picked });
  if (cosmetic) {
    startCosmeticEngine({ toggles, config, customRules: [], picked });
    sweepNow();
  } else {
    stopCosmeticEngine();
  }
}

function clearBody() {
  while (body.children.length) body.removeChild(body.children[0]);
}

function makeAd(classes, styleAttr) {
  const el = new Element('div', { classList: classes });
  if (styleAttr !== undefined) el.setAttribute('style', styleAttr);
  body.appendChild(el);
  return el;
}

const HIDE = (enabled = true) => [{ selector: '.ew-hide', mode: 'hide', enabled }];
const REMOVE = (enabled = true) => [{ selector: '.ew-remove', mode: 'remove', enabled }];

function isHidden(el) {
  return el.getAttribute(FLAG) === 'hidden'
    && el.style.getPropertyValue('display') === 'none'
    && el.style.getPropertyValue('pointer-events') === 'none';
}

/* ------------------------------------------------------------------ */
/* 1. Hiding is applied and recorded                                   */
/* ------------------------------------------------------------------ */

clearBody();
const ad1 = makeAd(['ew-hide']);
apply({ picked: HIDE() });
check('rule hides the element', isHidden(ad1), true);
check('element still attached', ad1.parentNode === body, true);
check('original style recorded as empty', ad1.getAttribute(PREV), '');

/* ------------------------------------------------------------------ */
/* 2. Deleting the rule un-hides it — the reported bug                 */
/* ------------------------------------------------------------------ */

apply({ picked: [] });
check('deleting the rule un-hides the element', isHidden(ad1), false);
check('flag cleared', ad1.hasAttribute(FLAG), false);
check('recorded style cleared', ad1.hasAttribute(PREV), false);
check('style attribute removed', ad1.getAttribute('style'), null);
check('element still attached after un-hide', ad1.parentNode === body, true);

/* ------------------------------------------------------------------ */
/* 3. Disabling a rule un-hides it                                     */
/* ------------------------------------------------------------------ */

apply({ picked: HIDE() });
check('enabled rule hides again', isHidden(ad1), true);
apply({ picked: HIDE(false) });
check('disabled rule un-hides', isHidden(ad1), false);

/* ------------------------------------------------------------------ */
/* 4. hide <-> remove transitions                                      */
/* ------------------------------------------------------------------ */

clearBody();
const ad2 = makeAd(['ew-hide']);
apply({ picked: [{ selector: '.ew-hide', mode: 'remove', enabled: true }] });
check('remove mode detaches the element', ad2.parentNode, null);
apply({ picked: HIDE() });
check('switching back to hide re-attaches it', ad2.parentNode === body, true);
check('and hides it', isHidden(ad2), true);
apply({ picked: [] });
check('then un-hides it', isHidden(ad2), false);

/* ------------------------------------------------------------------ */
/* 5. Removed nodes come back in the right place                       */
/* ------------------------------------------------------------------ */

clearBody();
const first = makeAd(['ew-hide']);
const target = makeAd(['ew-remove']);
const last = makeAd(['ew-hide']);
check('three siblings in place', body.children.length, 3);

apply({ picked: REMOVE() });
check('middle sibling removed', target.parentNode, null);
check('body now has two children', body.children.length, 2);

apply({ picked: [] });
check('middle sibling restored', target.parentNode === body, true);
check('body back to three children', body.children.length, 3);
check('restored in the original position', body.children.indexOf(target), 1);
check('first sibling unmoved', body.children[0] === first, true);
check('last sibling unmoved', body.children[2] === last, true);

/* ------------------------------------------------------------------ */
/* 6. Original inline styles are restored verbatim                     */
/* ------------------------------------------------------------------ */

clearBody();
const styled = makeAd(['ew-hide'], 'margin-top: 4px; color: red;');
apply({ picked: HIDE() });
check('original style captured', styled.getAttribute(PREV), 'margin-top: 4px; color: red;');
apply({ picked: [] });
check('original style restored verbatim', styled.getAttribute('style'), 'margin-top: 4px; color: red;');

/* ------------------------------------------------------------------ */
/* 7. Turning cosmetic filtering off restores everything               */
/* ------------------------------------------------------------------ */

clearBody();
const hiddenOne = makeAd(['ew-hide']);
const removedOne = makeAd(['ew-remove']);
apply({ picked: [...HIDE(), ...REMOVE()] });
check('hide applied', isHidden(hiddenOne), true);
check('remove applied', removedOne.parentNode, null);
apply({ cosmetic: false, picked: [] });
check('turning it off un-hides', isHidden(hiddenOne), false);
check('turning it off re-attaches', removedOne.parentNode === body, true);

/* ------------------------------------------------------------------ */
/* 8. html / head / body are never deleted                             */
/* ------------------------------------------------------------------ */

clearBody();
matchers.set('html', (el) => el.tagName === 'HTML');
matchers.set('body', (el) => el.tagName === 'BODY');
matchers.set('head', (el) => el.tagName === 'HEAD');
apply({
  picked: [
    { selector: 'body', mode: 'remove', enabled: true },
    { selector: 'html', mode: 'remove', enabled: true },
    { selector: 'head', mode: 'remove', enabled: true }
  ]
});
check('body still inside documentElement', documentElement.children.includes(body), true);
check('head still inside documentElement', documentElement.children.includes(head), true);
check('body not flagged as removed', body.getAttribute(FLAG), null);
check('head not flagged as removed', head.getAttribute(FLAG), null);
matchers.delete('html');
matchers.delete('body');
matchers.delete('head');
apply({ picked: [] });

/* ------------------------------------------------------------------ */
/* 9. Repeated application is idempotent                               */
/* ------------------------------------------------------------------ */

clearBody();
const stable = makeAd(['ew-hide']);
apply({ picked: HIDE() });
apply({ picked: HIDE() });
apply({ picked: HIDE() });
check('still hidden after repeated applies', isHidden(stable), true);
check('still attached', stable.parentNode === body, true);
check('style attribute not duplicated', stable.getAttribute('style'), 'display: none; pointer-events: none');

/* ------------------------------------------------------------------ */
/* 10. Unrelated elements are never touched                            */
/* ------------------------------------------------------------------ */

clearBody();
const untouched = makeAd(['ew-other'], 'background: blue;');
apply({ picked: HIDE() });
check('unmatched element keeps its style', untouched.getAttribute('style'), 'background: blue;');
check('unmatched element has no flag', untouched.hasAttribute(FLAG), false);
apply({ picked: [] });
check('unmatched element unaffected by restore', untouched.getAttribute('style'), 'background: blue;');

/* ------------------------------------------------------------------ */
/* 11. A hide rule and a remove rule coexist                           */
/* ------------------------------------------------------------------ */

clearBody();
const keepHidden = makeAd(['ew-hide']);
const getRemoved = makeAd(['ew-remove']);
const plain = makeAd(['ew-other']);
apply({ picked: [...HIDE(), ...REMOVE()] });
check('hide rule applies', isHidden(keepHidden), true);
check('remove rule applies', getRemoved.parentNode, null);
check('plain element untouched', plain.hasAttribute(FLAG), false);
check('plain element attached', plain.parentNode === body, true);

/* Deleting only the remove rule must not un-hide the other one. */
apply({ picked: HIDE() });
check('hide rule still applies', isHidden(keepHidden), true);
check('removed node is back', getRemoved.parentNode === body, true);
check('restored node is not hidden', isHidden(getRemoved), false);

stopCosmeticEngine();

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
