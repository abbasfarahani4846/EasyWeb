/**
 * EasyWeb Ad Blocker — no-op script.
 *
 * Anti-adblock detectors probe bait files such as `/ads.js` and check whether
 * the request succeeds. The `annoyances` rule-set redirects those probes here
 * instead of blocking them, so the detector sees a successful (empty) script
 * and never shows its "please disable your ad blocker" wall.
 */
(function () {
  'use strict';
  /* intentionally empty */
})();
