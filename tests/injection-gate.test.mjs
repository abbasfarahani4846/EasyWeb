/**
 * Content-script injection gate tests.
 *
 * The bug this guards against: the gate used to be a bare version string
 * (`window.__easywebInjected === VERSION`). After the extension is reloaded the
 * old content script is orphaned but that marker survives, so a re-injected
 * script saw "already running", bailed out, and left the page with no content
 * script at all — every setting change then needed a manual page refresh.
 *
 * The gate now probes liveness: `chrome.runtime.getURL` throws once the context
 * is invalidated, which is the only reliable way to tell a live instance from a
 * dead one.
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
/* Stubs                                                               */
/* ------------------------------------------------------------------ */

function makeElement() {
  return {
    style: { removeProperty() {}, setProperty() {} },
    removeAttribute() {}, setAttribute() {}, getAttribute() { return null; },
    remove() {}, replaceChild() {}, parentNode: null
  };
}

globalThis.document = {
  getElementById: () => null,
  querySelectorAll: () => [],
  createTextNode: () => ({}),
  documentElement: makeElement(),
  body: makeElement()
};
globalThis.window = {};

let contextValid = true;
globalThis.chrome = {
  runtime: {
    get id() { return contextValid ? 'test-extension' : undefined; },
    getURL(url) {
      if (!contextValid) throw new Error('Extension context invalidated.');
      return `chrome-extension://test-extension/${url}`;
    }
  }
};

const {
  cleanupStaleInjections,
  isInstanceAlive,
  claimInstance,
  makeLivenessProbe,
  INSTANCE_KEY
} = await import('../src/content/core/context.js');
const { VERSION } = await import('../src/shared/constants.js');

/* ------------------------------------------------------------------ */
/* isInstanceAlive                                                     */
/* ------------------------------------------------------------------ */

check('no instance', isInstanceAlive(null), false);
check('undefined instance', isInstanceAlive(undefined), false);
check('wrong version', isInstanceAlive({ version: 'old', isAlive: () => true }), false);
check('live instance', isInstanceAlive({ version: VERSION, isAlive: () => true }, VERSION), true);
check('probe throws', isInstanceAlive({ version: VERSION, isAlive() { throw new Error('dead'); } }, VERSION), false);
check('probe returns false', isInstanceAlive({ version: VERSION, isAlive: () => false }, VERSION), false);
check('probe missing', isInstanceAlive({ version: VERSION }, VERSION), false);
check('probe not a function', isInstanceAlive({ version: VERSION, isAlive: true }, VERSION), false);

/* ------------------------------------------------------------------ */
/* The liveness probe itself                                           */
/* ------------------------------------------------------------------ */

const probe = makeLivenessProbe();
check('probe true while valid', probe(), true);

contextValid = false;
let threw = false;
try { probe(); } catch (_) { threw = true; }
check('probe throws once invalidated', threw, true);
contextValid = true;
check('probe recovers when valid again', probe(), true);

/* ------------------------------------------------------------------ */
/* The gate                                                            */
/* ------------------------------------------------------------------ */

delete globalThis.window[INSTANCE_KEY];

check('fresh page installs', cleanupStaleInjections(), true);
check('double injection is refused while alive', cleanupStaleInjections(), false);
check('still refused on a third call', cleanupStaleInjections(), false);
check('slot holds the version', globalThis.window[INSTANCE_KEY].version, VERSION);

/* The extension gets reloaded: the old instance is orphaned. */
contextValid = false;
check('re-injection allowed after an extension reload', cleanupStaleInjections(), true);

contextValid = true;
check('new instance then blocks duplicates', cleanupStaleInjections(), false);

/* A version bump replaces the previous instance even while it is alive. */
globalThis.window[INSTANCE_KEY] = { version: '9', isAlive: () => true };
check('older version is replaced', cleanupStaleInjections(), true);
check('slot now holds the current version', globalThis.window[INSTANCE_KEY].version, VERSION);

/* ------------------------------------------------------------------ */
/* claimInstance (also used by the document_start guard)               */
/* ------------------------------------------------------------------ */

delete globalThis.window.__testGuard;
check('guard claims a free slot', claimInstance('__testGuard'), true);
check('guard is not duplicated', claimInstance('__testGuard'), false);

contextValid = false;
check('guard slot is reclaimed after a reload', claimInstance('__testGuard'), true);
contextValid = true;

check('independent slots do not clash', claimInstance('__otherSlot'), true);
check('first slot still held', claimInstance('__testGuard'), false);

/* ------------------------------------------------------------------ */
/* The guard and content script must not fight over one slot           */
/* ------------------------------------------------------------------ */

delete globalThis.window[INSTANCE_KEY];
check('content script claims its own slot', claimInstance(INSTANCE_KEY), true);
check('guard slot is separate', claimInstance('__testGuard'), false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
