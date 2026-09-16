/**
 * EasyWeb Ad Blocker — document_start Guard
 *
 * Injected into every frame before the page's own scripts run. Writes the
 * cosmetic stylesheet so ads never flash on first paint, and installs the popup /
 * click-hijack protections.
 *
 * All of the logic lives in `features/guard-boot.js` so that `content.js` can run
 * the exact same bootstrap when it is re-injected into an already-open page —
 * which is how the guard comes back to life after the extension is reloaded.
 */

import { bootGuard } from './features/guard-boot.js';

bootGuard();
