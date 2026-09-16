# EasyWeb — Layout, Fonts, AI & Ad Blocker 🌐

[English](#english) | [فارسی](#persian)

---

<a id="english"></a>
## English

**EasyWeb** is a powerful Chrome extension that personalizes website direction (RTL/LTR) and typography (Persian fonts & custom font uploads) with full per-segment targeting, an integrated AI assistant and a complete ad blocker.

### ✨ Features
*   **Ad Blocker:** Blocks image, video and text ads, trackers and popup tabs, with per-site control, trusted/untrusted lists and live statistics.
*   **Manual ad picking:** Pick any section of a page with the mouse and have it hidden or deleted automatically on every future visit to that site.
*   **Popup & Tab Guard:** Stops the "click a video and an advertising tab opens" hijack, pop-unders, invisible hijack links and transparent overlays sitting on top of video players.
*   **Typography Control:** Customize fonts with built-in Persian fonts or upload your own custom fonts.
*   **Layout & Direction:** Instantly switch page direction (RTL/LTR) – perfect for reading content in different languages.
*   **Per-Segment Targeting:** Apply changes to the entire page or select specific sections using an interactive element picker.
*   **AI Chat Integration:** Chat directly with the content of the current webpage using your preferred AI provider right from the extension's side panel.
*   **Smart Detection:** Automatically detects Persian language content and suggests appropriate typography settings.

### 🛡 Ad Blocker

The blocker is built on three independent layers, so a failure in one never leaves you unprotected.

**1. Network layer — `declarativeNetRequest`**

Four static rule-sets are compiled from readable filter catalogues at build time:

| Rule-set | Rules | Purpose |
| --- | --- | --- |
| `easyweb_ads` | 207 | Ad networks, exchanges, SSPs, video/native advertising, link shorteners |
| `easyweb_trackers` | 156 | Analytics, session replay, data brokers, social pixels, push SDKs |
| `easyweb_popups` | 101 | Pop-unders, forced redirects, fake-download scams, crypto miners (blocks the top document) |
| `easyweb_annoyances` | 65 | Anti-adblock walls, cookie banners, chat/survey overlays (off by default) |

User-managed rules live in `declarativeNetRequest` **session rules**:

*   **Whitelist / per-site "off"** → a priority-1000 `allowAllRequests` rule for that domain.
*   **Blacklist** → a priority-900 `block` rule for the domain and every subdomain.
*   **Per-site "strict"** → priority-800 rules scoped with `initiatorDomains`, so hardening one site never leaks to another. This includes blocking *every third-party frame* on that site, which is what removes ad overlays from video players.
*   **Custom filters** → priority-700 (and 950 for `@@` exceptions) rules parsed from Adblock/uBlock syntax: `||domain^`, `@@||domain^`, plain substrings and `/regex/`.

Session rules are rebuilt from scratch whenever settings change and re-applied every time the service worker boots (session rules do not survive a browser restart).

**2. Interaction layer — `guard.js` at `document_start`, in every frame**

Runs before the page's own scripts, so the popup machinery can be neutralised before the site captures references to it:

*   `window.open` is wrapped. Pop-unders (a window opened while the page is unloading), known advertising hosts, and calls made with **no user activation at all** are refused. The caller receives a harmless stub window instead of an exception, so the page does not break.
*   Capture-phase `click` / `auxclick` guard blocks **invisible hijack links** (zero-sized, off-screen, `opacity: 0`, `pointer-events: none`) — a link nobody could physically have clicked — and visible links pointing at advertising hosts.
*   **Player-control hardening:** `pointerdown`, touch, mouse and keyboard gestures are classified as media/player interactions through the `<video>/<audio>` path, `elementsFromPoint`, and a wrapper that actually contains media. If seek, fullscreen, play/pause or volume control is wrapped in a third-party `<a>` (the classic malicious-player pattern), its external navigation is stopped *before* the site handler sees it. The synchronous `window.open` wrapper also blocks unknown external destinations during the next 1.8 seconds — user activation does not bypass this rule.
*   **Video overlay neutralisation:** when a click lands on a transparent layer stacked on top of a `<video>` (verified through `document.elementsFromPoint`), the layer is switched to `pointer-events: none` and the click is re-dispatched to the player underneath. The ad overlay dies, the video still plays.
*   Every genuine gesture is described to the service worker (which link it hit, whether it was a real anchor, whether it hit an overlay or a player).

**3. Decision layer — `popup-guard.js` in the service worker**

`webNavigation.onCreatedNavigationTarget` fires for `window.open`, `target="_blank"` and pop-unders. Each new navigation target is judged against the source site's settings and the gesture that preceded it:

| Situation | Result |
| --- | --- |
| No gesture within 1.5s of the new tab | **Blocked** (auto-popup) |
| Click on a video/overlay produced a third-party tab | **Blocked** (synthetic popup) |
| Player-control gesture produced any external tab, even through a matching `<a href>` | **Blocked** (media popup) |
| Target host is a known advertising network | **Blocked** |
| Gesture pointed at that very link | Allowed — unless it was a player-control interaction |
| Same site, or a sign-in / payment / captcha host | Allowed |
| `about:`, `blob:`, `data:` URLs | Allowed |

A second path catches pages that open a blank tab and navigate it later (`tabs.onCreated` → `tabs.onUpdated`). Blocked tabs are closed immediately and the page shows a small "tab blocked" notice.

**4. Cosmetic layer — `cosmetic.js`**

A `display: none !important` stylesheet built from a curated selector catalogue plus your own selectors, injected at `document_start` so ads never flash on first paint. A debounced DOM sweep then handles inline `display` overrides and scripts that re-insert ad nodes, and advertising `<iframe>` / `<ins>` elements are removed outright.

### 🧩 The popup stays out of the way

Each card in the popup collapses to **just its title and its switch** while that feature is switched off for the current site. The controls — scope tabs, dropdowns, advanced panels — only appear once you actually turn the feature on. A site where you only want RTL shows one expanded card instead of four.

The one exception is deliberate: if the blocker is off because the site is on the whitelist or the global switch is disabled, that reason appears as a small badge next to the **AD BLOCKER** title. Otherwise a whitelisted site would look like a switch that simply does nothing.

### 🎯 Block a section by hand

Some sites serve ads the filter lists have never seen. For those, pick the section with the mouse:

1. Open the popup, expand the **AD BLOCKER** card and click **🎯 انتخاب بخش**.
2. The popup closes and an in-page banner appears. Click the offending section.
3. It disappears immediately, is saved to that domain, and is blocked automatically on every future visit.

Two modes, selectable before picking and switchable per rule afterwards:

| Mode | What happens |
| --- | --- |
| **مخفی شود** (hide, default) | The section is hidden with `display: none !important` — the layout keeps its space. |
| **کامل حذف شود** (remove) | The element is deleted from the DOM, and deleted again if the page puts it back. |

Each rule stores two selectors, because ad containers are often rebuilt from scratch on every load:

* **Precise** — an id, or a class path such as `div.ad-slot > ins.adsbygoogle`.
* **Broad** — a single class such as `.ad-container`, chosen by scanning the element and its ancestors for a class that either reads as advertising (`ad`, `advert*`, `banner`, `sponsor*`, `promo*`, `gpt`, `dfp`, `taboola`, `outbrain`, `mgid`, `native-ad`, `interstitial`) or is simply the rarest one on the page. When a broad selector is available a **گسترده** button appears on the rule — use it when the precise selector stops matching after a reload.

Rules can be turned off, re-pointed at the other mode, or deleted individually from the same card. **Everything is reversible:** hiding records each element's original `style` attribute, and deleting keeps the detached node together with its position — so deleting or disabling a rule (or turning cosmetic filtering off) puts the page back exactly as it was. Deleting `<html>`, `<head>` or `<body>` is refused no matter what was picked, so a mis-click can never blank a page. Picking a section also switches the site to a custom mode with cosmetic filtering on, since the rule could not apply otherwise.

Each rule shows a live match badge so a rule that has stopped working is visible rather than silent:

| Badge | Meaning |
| --- | --- |
| **N مورد** | The selector matches N elements on the page right now. |
| **پیدا نشد** | The selector matches nothing — try the **گسترده** button, or re-pick the section. |
| **سلکتور نامعتبر** | The browser cannot parse the selector. |

When a section is picked, the generated selector is verified against the clicked element. If the precise selector does not resolve to it (framework-rendered class names change between loads), the broader one is used instead and the in-page confirmation says so.

The popup panel is live: it subscribes to `chrome.storage.onChanged`, so a rule added from the in-page picker or deleted from the panel is reflected immediately — there is no need to close and reopen it. It also paints its shell before any message round-trip, so a slow or restarting service worker can never leave the panel stuck on placeholders with empty dropdowns.

### ⚡ Real-time application

**No feature needs a page refresh.** Every change is applied to open pages immediately, through three cooperating mechanisms:

1. **Storage fan-out.** Each content script listens on `chrome.storage.onChanged`, so a write from any surface (popup, sidebar, in-page picker) reaches every tab showing that domain — including tabs in other windows.
2. **Explicit push.** The popup and sidebar also push directly to the tab (`APPLY_SETTINGS` for layout/typography, `RESYNC` for the blocker), so the page updates even if a notification is missed. `RESYNC` re-reads storage and re-applies everything, making it correct regardless of delivery order.
3. **Script repair.** Every push goes through a helper that checks whether the content script is alive and **re-injects it when it is not** — which is what happens to every already-open page when the extension is reloaded. The injection gate probes liveness with `chrome.runtime.getURL` rather than trusting a version marker, so a re-injected script always takes over from an orphaned one. The background does the same repair for the active tab after any blocker change.

What is covered, and how:

| Change | Path to the page |
| --- | --- |
| Direction on/off, RTL/LTR | `saveSite` → storage + `APPLY_SETTINGS` |
| Font family, size, weight, alignment | same |
| Custom font upload / delete | `fonts` storage key → content listener → re-apply |
| Segment targeting (picker) | applied in-page at pick time, then persisted |
| Translation run / restore | `EXECUTE_TRANSLATION` / `RESTORE_TRANSLATION` messages |
| Per-site blocker switch, mode, toggles | `ADBLOCK_SET_SITE` → storage + `RESYNC` |
| Hand-picked ad sections (add / delete / mode) | applied in-page at pick time; deletes restore the DOM |
| Global blocker toggles, popup-guard and cosmetic options | `ADBLOCK_UPDATE_GLOBAL` → storage + `RESYNC` |
| Whitelist / blacklist | `ADBLOCK_SET_LIST` → storage + `RESYNC` |
| Popup panel itself | `chrome.storage.onChanged` → live re-render |

**5. First-party layer — `inject.js` in the page's own JS context**

Everything above works by refusing *requests*. That is useless on YouTube and Spotify, which serve their advertising from their own domains, inside the same API responses and media streams as the real content — there is no third-party host to block. `rovno.xyz`-style popups are one problem; a pre-roll inside a `googlevideo.com` stream is a different one entirely.

So EasyWeb also ships a small scriptlet engine, which is what makes a blocker "professional" rather than a filter list:

* It runs with `"world": "MAIN"` at `document_start`, i.e. inside the page's own JavaScript context — the only place where patching `window.fetch` is visible to the page's code.
* **Response rewriting:** requests to `/youtubei/v1/player` are decoded and the advertising fields (`adPlacements`, `playerAds`, `adSlots`, `adBreakHeartbeatParams`, …) are deleted before the player ever sees them. There is then no advert to schedule. Feed and search responses get the same treatment for promoted cards.
* **Property traps:** `ytInitialPlayerResponse` and `ytInitialData` are assigned by an inline page script, so a setter is installed on `window` to prune them on assignment.
* **Playback fallback:** adverts already stitched into the media stream by server-side insertion cannot be removed from a response, so the player is watched for its ad state — the segment is seeked past, sped up, and the skip button pressed.
* **Spotify:** the advert audio is mixed into the stream server-side. Nothing client-side can remove it; EasyWeb detects the ad from the now-playing label, silences it, and presses skip when the player allows.

The bundle is deliberately scoped to the supported hosts only, never `<all_urls>`, and it is forbidden from touching `chrome.*` — it runs in the page, where those APIs do not exist. Both rules are enforced by the release audit.

> **Honest limits.** This is an arms race, not a one-time fix. YouTube periodically changes the shape of its player response, and when it does the field list here has to be updated. Spotify advert audio genuinely cannot be removed by an extension — silencing it is the ceiling, and the UI says so rather than pretending otherwise. The engine is also skipped entirely on any site you have whitelisted or switched off.

### ⚙️ Per-site control

Every domain gets its own blocker configuration, saved next to its typography settings:

*   **Master switch** — on/off for that site.
*   **Mode** — `inherit` (follow global), `default`, `strict`, `custom`, or `off`.
*   **Five toggles** — ads, trackers, popup guard, cosmetic cleanup, annoyances. Flipping one switches the site to `custom` and seeds the overrides from the current effective values.
*   **Hand-picked sections** — stored under `blocker.picked`, each with its own mode, precise/broad selector choice and on/off state.
*   **Whitelist / blacklist** — one click from the popup; a domain can never be on both lists.

Global settings, list managers, custom selectors, custom filters, guard tuning and statistics live in the sidebar's **ادبلاکر و لیستها** tab. The guard has a dedicated default-on option for **player controls**; turn it off only for a site whose legitimate player intentionally opens a third-party window.

### Incognito windows

Chrome does not let an extension enable itself in Incognito mode. To protect a private window, open `chrome://extensions` → EasyWeb → **Details** → enable **Allow in Incognito**. Without that browser-level switch, no content script, popup guard or network rule from EasyWeb can run in the Incognito tab; the behavior in a normal window cannot be used to infer that the private window is protected.

### 📦 Installation
1. Download or clone this repository.
2. Build the extension (see [Development](#-development--build)).
3. Open Google Chrome and go to `chrome://extensions/`.
4. Enable **Developer mode** (top right corner).
5. Click **Load unpacked** and select the `dist/` folder.

---

<a id="persian"></a>
<div dir="rtl">

## فارسی

**EasyWeb (ایزی‌وب)** یک افزونه‌ی کاربردی برای مرورگر کروم است که به شما امکان می‌دهد جهت متن (راست‌چین/چپ‌چین) و تایپوگرافی (فونت‌های فارسی یا فونت‌های دلخواه) سایت‌ها را شخصی‌سازی کنید. این افزونه یک دستیار هوش مصنوعی یکپارچه و یک ادبلاکر کامل نیز دارد.

### ✨ ویژگی‌ها
*   **ادبلاکر حرفه‌ای:** مسدودسازی تبلیغات تصویری، ویدیویی و متنی، ردیاب‌ها و تب‌های تبلیغاتی — همراه با کنترل اختصاصی برای هر سایت، لیست سفید/سیاه و آمار زنده.
*   **انتخاب دستی تبلیغ:** هر بخشی از صفحه را با موس انتخاب کنید تا از این پس در آن سایت خودکار مخفی یا حذف شود.
*   **محافظ تب و پاپ‌آپ:** جلوگیری از باز شدن خودکار تب تبلیغاتی هنگام کلیک روی ویدیو، پاپ‌آندرها، لینک‌های مخفی و لایه‌های شفاف روی پخش‌کننده ویدیو.
*   **کنترل تایپوگرافی:** استفاده از فونت‌های پیش‌فرض فارسی یا آپلود فونت‌های دلخواه (custom fonts).
*   **چیدمان و جهت متن:** تغییر سریع جهت صفحه (RTL/LTR) – ایده‌آل برای مطالعه محتوای فارسی و عربی.
*   **اعمال روی بخش‌های خاص:** می‌توانید تغییرات را روی کل صفحه اعمال کنید یا با استفاده از ابزار انتخابگر (Picker)، فقط بخش‌های خاصی از صفحه را تغییر دهید.
*   **چت با هوش مصنوعی:** از طریق پنل کناری (Side Panel) مستقیماً با محتوای صفحه‌ی فعلی گفتگو کنید.
*   **تشخیص هوشمند:** تشخیص خودکار زبان فارسی در صفحات وب و پیشنهاد تنظیمات تایپوگرافی مناسب.

### 🛡 ادبلاکر — چطور کار می‌کند؟

ادبلاکر روی سه لایه‌ی مستقل ساخته شده تا از کار افتادن یک لایه، شما را بی‌محافظت نگذارد:

**۱. لایه‌ی شبکه (declarativeNetRequest)**
چهار مجموعه‌قانون از فهرست‌های خوانا در زمان بیلد ساخته می‌شوند:

| مجموعه | تعداد قاعده | کاربرد |
| --- | --- | --- |
| `easyweb_ads` | ۲۰۷ | شبکه‌های تبلیغاتی، صرافی‌ها، تبلیغات ویدیویی و متنی، کوتاه‌کننده‌های لینک |
| `easyweb_trackers` | ۱۵۶ | تحلیل‌گرها، ضبط جلسه، کارگزاران داده، پیکسل‌های شبکه اجتماعی |
| `easyweb_popups` | ۱۰۱ | پاپ‌آندر، ریدایرکت اجباری، کلاهبرداری دانلود جعلی، ماینرهای رمزارز |
| `easyweb_annoyances` | ۶۵ | پیام «ادبلاکر را خاموش کنید»، بنر کوکی، ویجت چت و نظرسنجی (پیش‌فرض خاموش) |

قواعدی که خودتان مدیریت می‌کنید به‌صورت **session rule** ساخته می‌شوند:
*   **لیست سفید / خاموش برای یک سایت** ← قاعده‌ی `allowAllRequests` با اولویت ۱۰۰۰
*   **لیست سیاه** ← قاعده‌ی `block` با اولویت ۹۰۰ برای دامنه و همه‌ی زیردامنه‌ها
*   **حالت سخت‌گیرانه برای یک سایت** ← قواعد با اولویت ۸۰۰ که با `initiatorDomains` محدود شده‌اند؛ یعنی سخت‌گیری روی یک سایت هرگز به سایت دیگر سرایت نمی‌کند. این حالت **همه‌ی آی‌فریم‌های شخص ثالث** را مسدود می‌کند که همان چیزی است که لایه‌های تبلیغاتی روی ویدیو را حذف می‌کند.
*   **فیلترهای سفارشی** ← با اولویت ۷۰۰ (و ۹۵۰ برای استثناهای `@@`) و با پشتیبانی از دستور Adblock/uBlock: `||domain^`، `@@||domain^`، متن ساده و `/regex/`

**۲. لایه‌ی تعامل (guard.js در document_start، در همه‌ی فریم‌ها)**
این اسکریپت پیش از اسکریپت‌های خود سایت اجرا می‌شود:
*   `window.open` بازنویسی می‌شود؛ پاپ‌آندرها، دامنه‌های تبلیغاتی شناخته‌شده و فراخوانی‌های بدون هیچ تعامل کاربری مسدود می‌شوند و به‌جای خطا، یک پنجره‌ی بی‌اثر برگردانده می‌شود تا سایت خراب نشود.
*   محافظ کلیک، **لینک‌های مخفی** (بدون ابعاد، بیرون از صفحه، با شفافیت صفر یا `pointer-events: none`) و لینک‌های منتهی به دامنه‌های تبلیغاتی را می‌بندد.
*   **سخت‌سازی کنترل‌های پلیر:** تعامل‌های `pointerdown`، لمس، ماوس و کیبورد از روی مسیر `<video>/<audio>`، `elementsFromPoint` و ظرفی که واقعاً مدیا دارد تشخیص داده می‌شوند. اگر دکمه‌ی عقب/جلو، تمام‌صفحه، پخش/توقف یا صدا داخل یک `<a>` شخص ثالث پیچیده شده باشد (ترفند رایج پلیرهای مخرب)، ناوبری خارجی **پیش از رسیدن به هندلر سایت** قطع می‌شود. Wrapper هم تا ۱٫۸ ثانیه بعد از تعامل پلیر، هر `window.open` خارجی ناشناس را می‌بندد — فعال‌بودن تعامل کاربر این قانون را دور نمی‌زند.
*   **خنثی‌سازی لایه‌ی روی ویدیو:** وقتی کلیک روی یک لایه‌ی شفاف روی پخش‌کننده فرود بیاید، آن لایه `pointer-events: none` می‌شود و کلیک به خود ویدیو فرستاده می‌شود. یعنی تبلیغ می‌رود و ویدیو هنوز پخش می‌شود.

**۳. لایه‌ی تصمیم‌گیری (popup-guard.js در پس‌زمینه)**
هر تب جدید با توجه به تنظیمات همان سایت و تعامل کاربری که پیش از آن رخ داده، ارزیابی می‌شود:

| وضعیت | نتیجه |
| --- | --- |
| هیچ کلیکی در ۱٫۵ ثانیه‌ی اخیر نبوده | **مسدود** (پاپ‌آپ خودکار) |
| کلیک روی ویدیو/لایه باعث باز شدن تب شخص ثالث شده | **مسدود** (پاپ‌آپ جعلی) |
| تعامل با کنترل پلیر باعث باز شدن هر تب خارجی شده، حتی از طریق `<a href>` مطابق | **مسدود** (پاپ‌آپ پلیر) |
| مقصد یکی از شبکه‌های تبلیغاتی شناخته‌شده است | **مسدود** |
| کلیک واقعاً روی همان لینک بوده | مجاز — مگر اینکه تعامل با کنترل پلیر بوده باشد |
| همان سایت، یا دامنه‌های ورود/پرداخت/کپچا | مجاز |
| آدرس‌های `about:`، `blob:`، `data:` | مجاز |

**۴. لایه‌ی پاک‌سازی بصری (cosmetic.js)**
یک شیوه‌نامه‌ی `display: none !important` که از فهرست سلکتورهای منتخب به‌همراه سلکتورهای خودتان ساخته می‌شود و در `document_start` تزریق می‌شود تا تبلیغات اصلاً فرصت نمایش پیدا نکنند. سپس یک پویش DOM، عناصری که دوباره اضافه می‌شوند را پنهان و آی‌فریم‌های تبلیغاتی را حذف می‌کند.

### 🧩 پاپ‌آپ شلوغ نمی‌شود

هر کارت در پاپ‌آپ تا وقتی آن قابلیت برای سایت فعلی خاموش است، فقط **عنوان و کلید روشن/خاموش** را نشان می‌دهد. تب‌های دامنه (کل صفحه / بخش‌های انتخابی)، منوها و تنظیمات پیشرفته تنها بعد از روشن کردن قابلیت ظاهر می‌شوند. سایتی که فقط می‌خواهید راست‌چین شود، یک کارت باز دارد نه چهار کارت.

یک استثنا عمدی است: اگر ادبلاکر به‌خاطر بودن سایت در لیست سفید یا خاموش بودن کلید سراسری غیرفعال باشد، دلیلش به‌صورت یک نشانگر کوچک کنار عنوان **AD BLOCKER** دیده می‌شود. وگرنه سایت لیست‌سفیدشده شبیه کلیدی به‌نظر می‌رسید که هیچ کاری نمی‌کند.

### 🎯 بلاک کردن دستی یک بخش

بعضی سایت‌ها تبلیغاتی نشان می‌دهند که در هیچ لیستی نیست. برای همین می‌توانید بخش مورد نظر را با موس انتخاب کنید:

۱. پاپ‌آپ را باز کنید، کارت **AD BLOCKER** را باز کنید و روی **🎯 انتخاب بخش** بزنید.
۲. پاپ‌آپ بسته می‌شود و یک نوار راهنما در صفحه ظاهر می‌شود. روی بخش تبلیغاتی کلیک کنید.
۳. همان لحظه ناپدید می‌شود، برای همان دامنه ذخیره می‌شود و از این پس در هر بازدید خودکار بلاک می‌گردد.

دو حالت وجود دارد که هم قبل از انتخاب و هم بعد از آن برای هر قانون قابل تغییر است:

| حالت | نتیجه |
| --- | --- |
| **مخفی شود** (پیش‌فرض) | بخش با `display: none !important` پنهان می‌شود و جای آن در صفحه حفظ می‌گردد. |
| **کامل حذف شود** | عنصر از ساختار صفحه پاک می‌شود و اگر سایت دوباره بسازدش، باز حذف می‌گردد. |

هر قانون دو سلکتور ذخیره می‌کند، چون ظرف تبلیغاتی معمولاً در هر بارگذاری از نو ساخته می‌شود:

* **دقیق** — شناسه، یا مسیری مثل `div.ad-slot > ins.adsbygoogle`
* **گسترده** — یک کلاس مانند `.ad-container` که با بررسی خود عنصر و والدینش پیدا می‌شود: کلاسی که یا خودش بوی تبلیغات می‌دهد (`ad`، `advert*`، `banner`، `sponsor*`، `promo*`، `gpt`، `dfp`، `taboola`، `outbrain`، `mgid`، `native-ad`، `interstitial`) یا کمیاب‌ترین کلاس صفحه است. اگر سلکتور گسترده موجود باشد، دکمه‌ی **گسترده** روی همان قانون ظاهر می‌شود — وقتی سلکتور دقیق بعد از رفرش دیگر مطابقت نمی‌کند از آن استفاده کنید.

هر قانون را می‌توان خاموش کرد، حالتش را عوض کرد یا حذف کرد. **همه‌چیز برگشت‌پذیر است:** هنگام مخفی‌سازی، `style` اصلی هر عنصر ذخیره می‌شود و هنگام حذف، خودِ گره به‌همراه جایگاهش نگه داشته می‌شود — پس با حذف یا غیرفعال کردن یک قانون (یا خاموش کردن پاک‌سازی بصری) صفحه دقیقاً به حالت اول برمی‌گردد. حذف `<html>`، `<head>` و `<body>` در هر شرایطی رد می‌شود تا یک کلیک اشتباه هرگز صفحه را سفید نکند. انتخاب یک بخش، سایت را به حالت سفارشی با پاک‌سازی بصری روشن می‌برد، چون در غیر این صورت قانون اعمال نمی‌شد.

هر قانون یک نشانگر زنده دارد تا قانونی که از کار افتاده دیده شود، نه اینکه بی‌صدا بی‌اثر بماند:

| نشانگر | معنی |
| --- | --- |
| **N مورد** | این سلکتور همین حالا N عنصر در صفحه پیدا می‌کند. |
| **پیدا نشد** | سلکتور چیزی پیدا نمی‌کند — دکمه‌ی **گسترده** را امتحان کنید یا بخش را دوباره انتخاب کنید. |
| **سلکتور نامعتبر** | مرورگر نمی‌تواند این سلکتور را بخواند. |

هنگام انتخاب یک بخش، سلکتور ساخته‌شده با همان عنصر کلیک‌شده بررسی می‌شود. اگر سلکتور دقیق به آن نرسد (کلاس‌های تولیدشده‌ی فریم‌ورک‌ها در هر بارگذاری عوض می‌شوند)، سلکتور گسترده جایگزین می‌شود و پیام تأیید در صفحه همین را اطلاع می‌دهد.

پنل پاپ‌آپ زنده است: به `chrome.storage.onChanged` گوش می‌دهد، پس قانونی که از انتخاب‌گر درون صفحه اضافه شود یا از پنل حذف شود، بلافاصله در لیست دیده می‌شود و نیازی به بستن و باز کردن پنل نیست. همچنین اسکلت پنل پیش از هر رفت‌وبرگشت پیام کشیده می‌شود، بنابراین کندی یا ری‌استارت شدن سرویس‌ورکر هرگز پنل را در حالت «در حال بارگذاری» با منوهای خالی رها نمی‌کند.

### ⚡ اعمال لحظه‌ای (Real-time)

**هیچ بخشی به رفرش صفحه نیاز ندارد.** هر تغییر بلافاصله روی صفحات باز اعمال می‌شود، از طریق سه سازوکار که با هم کار می‌کنند:

۱. **پخش از طریق حافظه.** هر کانتنت‌اسکریپت به `chrome.storage.onChanged` گوش می‌دهد، پس نوشتن از هر سطحی (پاپ‌آپ، پنل کناری، انتخاب‌گر درون صفحه) به همه‌ی تب‌های همان دامنه می‌رسد — حتی تب‌های پنجره‌های دیگر.
۲. **فشار مستقیم.** پاپ‌آپ و پنل کناری علاوه بر آن، مستقیم به تب پیام می‌فرستند (`APPLY_SETTINGS` برای چیدمان و تایپوگرافی، `RESYNC` برای ادبلاکر)، تا حتی اگر اعلان حافظه گم شود صفحه به‌روز شود. `RESYNC` حافظه را از نو می‌خواند و همه‌چیز را دوباره اعمال می‌کند، پس مستقل از ترتیب رسیدن پیام‌ها درست کار می‌کند.
۳. **ترمیم اسکریپت.** هر فشار از یک هلپر عبور می‌کند که بررسی می‌کند کانتنت‌اسکریپت زنده است یا نه و **در صورت نبودن، آن را دوباره تزریق می‌کند** — دقیقاً همان چیزی که برای همه‌ی صفحات باز پس از ریلود شدن افزونه لازم است. دروازه‌ی تزریق، زنده‌بودن را با `chrome.runtime.getURL` می‌سنجد نه با یک نشانه‌ی نسخه، پس اسکریپت تزریق‌شده همیشه از یک نمونه‌ی مرده تحویل می‌گیرد. پس‌زمینه هم همین ترمیم را برای تب فعال بعد از هر تغییر ادبلاکر انجام می‌دهد.

پوشش کامل:

| تغییر | مسیر رسیدن به صفحه |
| --- | --- |
| روشن/خاموش جهت، RTL/LTR | `saveSite` → حافظه + `APPLY_SETTINGS` |
| فونت، اندازه، وزن، تراز | همان |
| آپلود یا حذف فونت سفارشی | کلید `fonts` → لیسنر کانتنت → اعمال مجدد |
| هدف‌گیری بخش‌ها (انتخاب‌گر) | همان لحظه در صفحه اعمال و بعد ذخیره می‌شود |
| اجرا یا بازگردانی ترجمه | پیام‌های `EXECUTE_TRANSLATION` / `RESTORE_TRANSLATION` |
| کلید، حالت و تنظیمات ادبلاکر هر سایت | `ADBLOCK_SET_SITE` → حافظه + `RESYNC` |
| بخش‌های تبلیغاتی انتخاب‌شده (افزودن/حذف/حالت) | همان لحظه اعمال؛ حذف، DOM را بازمی‌گرداند |
| تنظیمات سراسری ادبلاکر، محافظ پاپ‌آپ و پاک‌سازی بصری | `ADBLOCK_UPDATE_GLOBAL` → حافظه + `RESYNC` |
| لیست سفید / سیاه | `ADBLOCK_SET_LIST` → حافظه + `RESYNC` |
| خودِ پنل پاپ‌آپ | `chrome.storage.onChanged` → رندر زنده |

**۵. لایه‌ی تبلیغات شخص اول (inject.js در خودِ محیط جاوااسکریپت صفحه)**

همه‌ی لایه‌های قبلی با «رد کردن درخواست» کار می‌کنند. این روش روی یوتیوب و اسپاتیفای بی‌فایده است، چون آن‌ها تبلیغاتشان را از دامنه‌ی خودشان و داخل همان پاسخ‌های API و استریم مدیا می‌فرستند — دامنه‌ی شخص ثالثی وجود ندارد که بلاک شود. یک پاپ‌آپ از نوع `rovno.xyz` یک مسئله است و یک پیش‌رول داخل استریم `googlevideo.com` مسئله‌ای کاملاً دیگر.

برای همین EasyWeb یک موتور اسکریپت کوچک هم دارد؛ همان چیزی که یک ادبلاکر را «حرفه‌ای» می‌کند و نه فقط یک لیست فیلتر:

* با `"world": "MAIN"` و در `document_start` اجرا می‌شود، یعنی داخل محیط جاوااسکریپت خود صفحه — تنها جایی که بازنویسی `window.fetch` برای کد صفحه قابل دیدن است.
* **بازنویسی پاسخ:** درخواست‌های `/youtubei/v1/player` رمزگشایی و فیلدهای تبلیغاتی (`adPlacements`، `playerAds`، `adSlots`، `adBreakHeartbeatParams` و…) پیش از رسیدن به پخش‌کننده حذف می‌شوند. آن‌وقت تبلیغی برای زمان‌بندی وجود ندارد. پاسخ‌های فید و جستجو هم برای کارت‌های تبلیغاتی همین‌طور پاک می‌شوند.
* **تله‌ی پراپرتی:** مقادیر `ytInitialPlayerResponse` و `ytInitialData` توسط یک اسکریپت درون‌صفحه‌ای ست می‌شوند، پس یک setter روی `window` نصب می‌شود تا هنگام تخصیص پاک‌سازی شوند.
* **پشتیبان سطح پخش:** تبلیغاتی که با درج سمت‌سرور داخل استریم دوخته شده‌اند از پاسخ API قابل حذف نیستند، پس وضعیت تبلیغ پخش‌کننده رصد می‌شود — از سگمنت رد می‌شویم، سرعت را بالا می‌بریم و دکمه‌ی رد کردن را می‌زنیم.
* **اسپاتیفای:** صدای تبلیغ سمت سرور داخل استریم مخلوط می‌شود و هیچ ابزار سمت‌کلاینتی نمی‌تواند حذفش کند؛ EasyWeb تبلیغ را از روی برچسب «در حال پخش» تشخیص می‌دهد، بی‌صدایش می‌کند و در صورت امکان از آن رد می‌شود.

این باندل عمداً فقط روی میزبان‌های پشتیبانی‌شده اجرا می‌شود، هرگز `<all_urls>`، و اجازه ندارد به `chrome.*` دست بزند — چون در محیط صفحه این APIها وجود ندارند. هر دو قاعده در ممیزی ریلیز اجباری شده‌اند.

> **محدودیت‌ها، صادقانه.** این یک نبرد تسلیحاتی است، نه یک راه‌حل یک‌باره. یوتیوب هر چند وقت شکل پاسخ پخش‌کننده‌اش را عوض می‌کند و آن‌وقت فهرست فیلدها اینجا باید به‌روز شود. صدای تبلیغ اسپاتیفای واقعاً با افزونه حذف‌شدنی نیست — سقف کار بی‌صدا کردن است و رابط کاربری همین را می‌گوید، نه چیز دیگر. این موتور روی سایت‌های لیست‌سفیدشده یا خاموش هم اصلاً اجرا نمی‌شود.

### ⚙️ کنترل اختصاصی هر سایت

هر دامنه تنظیمات ادبلاکر خودش را در کنار تنظیمات تایپوگرافی‌اش ذخیره می‌کند:
*   **کلید اصلی** — روشن/خاموش برای همان سایت
*   **حالت** — ارث‌بری از تنظیمات کلی، استاندارد، سخت‌گیرانه، سفارشی یا غیرفعال
*   **پنج کلید** — تبلیغات، ردیاب‌ها، محافظ پاپ‌آپ، پاک‌سازی بصری و مزاحمت‌ها
*   **لیست سفید / سیاه** — با یک کلیک از پاپ‌آپ؛ یک دامنه هرگز نمی‌تواند در هر دو لیست باشد

تنظیمات سراسری، مدیریت لیست‌ها، سلکتورها، فیلترهای سفارشی و آمار در تب **«ادبلاکر و لیست‌ها»** در پنل کناری قرار دارد. گزینه‌ی پیش‌فرض‌روشنِ **محافظ کنترل‌های ویدیو** هم در همان‌جا است؛ فقط در سایتی خاموشش کنید که پلیر معتبرش عمداً باید پنجره‌ای در دامنه‌ی دیگر باز کند.

### حالت ناشناس (Incognito)

کروم اجازه نمی‌دهد افزونه خودش را در حالت ناشناس فعال کند. برای محافظت از تب خصوصی، به `chrome://extensions` → EasyWeb → **Details** بروید و **Allow in Incognito** را روشن کنید. بدون این کلید سطح مرورگر، هیچ کانتنت‌اسکریپت، محافظ پاپ‌آپ یا قانون شبکه‌ای از EasyWeb در تب ناشناس اجرا نمی‌شود؛ رفتار افزونه در پنجره‌ی معمولی به معنی محافظت‌شدن پنجره‌ی خصوصی نیست.

### 📦 راهنمای نصب
۱. این مخزن (Repository) را دانلود یا کلون کنید.
۲. افزونه را بیلد کنید (به بخش [Development](#-development--build) مراجعه کنید).
۳. مرورگر کروم را باز کرده و به آدرس `chrome://extensions/` بروید.
۴. حالت توسعه‌دهنده (**Developer mode**) را از گوشه بالا سمت راست فعال کنید.
۵. روی **Load unpacked** کلیک کنید و پوشه‌ی `dist/` را انتخاب نمایید.

</div>

---

## 🏗 Project Architecture

```text
EasyWeb/
├── package.json               # NPM scripts ("build", "watch", "test", "audit", "release", "verify")
├── build.js                   # Fast, zero-dependency ES module compiler + rule-set compiler
├── scripts/
│   └── audit-dist.mjs         # Release audit: verifies the packaged dist/ is loadable
├── tests/                     # Node test suites for the ad blocker core
│   ├── run.mjs                # Test runner
│   ├── adblock-core.test.mjs  # Domain matching, toggles, filter parsing, site model
│   ├── picked-rules.test.mjs  # Hand-picked ad rules, selector sanitising, CSS output
│   ├── cosmetic-restore.test.mjs # Reversibility of hiding / deleting picked sections
│   ├── popup-lifecycle.test.mjs  # Popup renders even when the worker is unreachable; live updates
│   ├── scriptlets.test.mjs    # Site profiles, endpoint matching, JSON ad-field pruning
│   ├── ad-selectors.test.mjs  # Advertising class heuristics used by the picker
│   ├── popup-guard.test.mjs   # Popup / tab interception decision tree
│   └── session-rules.test.mjs # declarativeNetRequest session-rule generation
├── src/                       # Complete Modular Source Code
│   ├── manifest.json          # Manifest V3 configuration
│   ├── assets/                # Fonts (.woff2) and icons
│   ├── rules/                 # Ad-blocker filter catalogues (source of truth)
│   │   ├── lists.js           # ads / trackers / popups / annoyances filter entries
│   │   ├── strict.js          # Per-site "strict" filters + session-rule id ranges
│   │   └── noop.js            # Redirect target for anti-adblock bait scripts
│   ├── shared/                # Code shared across modules
│   │   ├── constants.js       # App constants, STORAGE_KEY, VERSION, guard flags
│   │   ├── adblock.js         # Blocker core: presets, toggles, domain lists, cosmetic catalogue
│   │   ├── inject-profiles.js # Site profiles: endpoints, ad fields, handlers, selectors
│   │   ├── defaults.js        # Default settings models & bundled fonts
│   │   ├── domain.js          # Domain & URL parsing utilities
│   │   └── models.js          # Settings migration & state synchronization
│   ├── background/            # Service Worker
│   │   ├── index.js           # Background message dispatcher
│   │   ├── adblock.js         # Rule-set / session-rule engine, statistics, badge
│   │   ├── popup-guard.js     # Popup & tab interception decision logic
│   │   ├── tab-context.js     # Active tab context & domain resolution
│   │   └── picker-bridge.js   # Element picker state relay
│   ├── inject/                # MAIN-world scriptlet engine (first-party ads)
│   │   └── index.js           # fetch/XHR response rewriting + playback handlers
│   ├── content/               # Content Script Engine
│   │   ├── guard.js           # document_start guard (cosmetic CSS + interaction guard)
│   │   ├── index.js           # Content script entry & message router
│   │   ├── core/
│   │   │   ├── context.js     # Context validation & reload guard
│   │   │   └── style-engine.js# Runtime <style> management & @font-face rules
│   │   ├── features/
│   │   │   ├── popup-guard.js # window.open wrapper, click guard, overlay neutralisation
│   │   │   ├── cosmetic.js    # Cosmetic stylesheet, DOM sweep, ad-frame removal
│   │   │   ├── direction.js   # RTL/LTR direction application & clean restoration
│   │   │   ├── typography.js  # Font application, text protection & CSS rules
│   │   │   ├── detection.js   # Persian language & font suitability analyzer
│   │   │   └── picker.js      # Element picker: segment targeting + ad-section picking
│   │   └── observer.js        # Dynamic SPA MutationObserver & DOM re-application
│   ├── popup/                 # Extension Popup UI
│   │   ├── popup.html         # Accessible popup markup
│   │   ├── popup.css          # Modern dark theme styles with Vazirmatn font
│   │   ├── popup.js           # Main popup entry point
│   │   ├── state.js           # Reactive popup state manager
│   │   └── components/        # Isolated UI components
│   │       ├── scope-tabs.js  # Scope switcher (Entire Page vs Selected Sections)
│   │       ├── targets-list.js# Interactive segment management list
│   │       ├── layout-card.js # Direction card controller
│   │       ├── type-card.js   # Typography & font upload controller
│   │       ├── adblock-card.js# Ad blocker card controller
│   │       └── persian-hint.js# Persian detection notification banner
│   └── sidebar/               # AI Side Panel + advanced settings
│       ├── sidebar.html       # Sidebar UI & settings modal (incl. blocker tab)
│       ├── sidebar.css        # Sidebar styles
│       └── sidebar.js         # Sidebar chat, provider & blocker settings manager
└── dist/                      # Production Output (Load unpacked extension from here)
    └── rules/                 # Compiled declarativeNetRequest rule-sets
```

## 🚀 Development & Build

### 1. Build Extension
To compile all modules from `src/` to `dist/`:
```bash
npm run build
```
*(Runs in ~2s using pure Node.js without needing external bundlers. It also compiles the ad-blocker filter catalogues in `src/rules/lists.js` into valid `declarativeNetRequest` rule-sets under `dist/rules/`.)*

### 2. Live Watch Mode
To automatically recompile whenever any file in `src/` is edited:
```bash
npm run watch
```

### 3. Tests
The ad-blocker core is covered by Node test suites that need no browser:
```bash
npm test
```
*(Covers domain matching, toggle resolution, custom-filter parsing, the popup-guard decision tree, filter-list compilation and session-rule generation.)*

### 4. Release build
```bash
npm run release
```
Builds `dist/`, then audits the package: every file the manifest points at exists, every rule-set is valid JSON with rules in it, every HTML/CSS asset reference resolves, every bundle parses, and no module syntax was left behind. Exits non-zero on any problem, so it doubles as a pre-flight check.

`npm run verify` runs the tests first and then the release build — use it before loading the extension.

### 5. After changing the manifest
If you edit `permissions` or `declarative_net_request`, Chrome will show the extension as needing attention — click **Reload** on `chrome://extensions/`. Blocked-request counters rely on the `activeTab` grant, so they populate after you open the popup on a page.
