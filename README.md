# EasyWeb — Layout, Fonts & AI 🌐

[English](#english) | [فارسی](#persian)

---

<a id="english"></a>
## English

**EasyWeb** is a powerful Chrome extension that personalizes website direction (RTL/LTR) and typography (Persian fonts & custom font uploads) with full per-segment targeting and an integrated AI assistant.

### ✨ Features
*   **Typography Control:** Customize fonts with built-in Persian fonts or upload your own custom fonts.
*   **Layout & Direction:** Instantly switch page direction (RTL/LTR) – perfect for reading content in different languages.
*   **Per-Segment Targeting:** Apply changes to the entire page or select specific sections using an interactive element picker.
*   **AI Chat Integration:** Chat directly with the content of the current webpage using your preferred AI provider right from the extension's side panel.
*   **Smart Detection:** Automatically detects Persian language content and suggests appropriate typography settings.

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

**EasyWeb (ایزی‌وب)** یک افزونه‌ی کاربردی برای مرورگر کروم است که به شما امکان می‌دهد جهت متن (راست‌چین/چپ‌چین) و تایپوگرافی (فونت‌های فارسی یا فونت‌های دلخواه) سایت‌ها را شخصی‌سازی کنید. همچنین دارای یک دستیار هوش مصنوعی یکپارچه در پنل کناری است.

### ✨ ویژگی‌ها
*   **کنترل تایپوگرافی:** استفاده از فونت‌های پیش‌فرض فارسی یا آپلود فونت‌های دلخواه (custom fonts).
*   **چیدمان و جهت متن:** تغییر سریع جهت صفحه (RTL/LTR) – ایده‌آل برای مطالعه محتوای فارسی و عربی.
*   **اعمال روی بخش‌های خاص:** می‌توانید تغییرات را روی کل صفحه اعمال کنید یا با استفاده از ابزار انتخابگر (Picker)، فقط بخش‌های خاصی از صفحه را تغییر دهید.
*   **چت با هوش مصنوعی:** از طریق پنل کناری (Side Panel) مستقیماً با محتوای صفحه‌ی فعلی گفتگو کنید.
*   **تشخیص هوشمند:** تشخیص خودکار زبان فارسی در صفحات وب و پیشنهاد تنظیمات تایپوگرافی مناسب.

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
├── package.json               # NPM scripts ("build", "watch")
├── build.js                   # Fast, zero-dependency ES module compiler
├── src/                       # Complete Modular Source Code
│   ├── manifest.json          # Manifest V3 configuration
│   ├── assets/                # Fonts (.woff2) and icons
│   ├── shared/                # Code shared across modules
│   │   ├── constants.js       # App constants, STORAGE_KEY, VERSION
│   │   ├── defaults.js        # Default settings models & bundled fonts
│   │   ├── domain.js          # Domain & URL parsing utilities
│   │   └── models.js          # Settings migration & state synchronization
│   ├── background/            # Service Worker
│   │   ├── index.js           # Background message dispatcher
│   │   ├── tab-context.js     # Active tab context & domain resolution
│   │   └── picker-bridge.js   # Element picker state relay
│   ├── content/               # Content Script Engine
│   │   ├── index.js           # Content script entry & message router
│   │   ├── core/
│   │   │   ├── context.js     # Context validation & reload guard
│   │   │   └── style-engine.js# Runtime <style> management & @font-face rules
│   │   ├── features/
│   │   │   ├── direction.js   # RTL/LTR direction application & clean restoration
│   │   │   ├── typography.js  # Font application, text protection & CSS rules
│   │   │   ├── detection.js   # Persian language & font suitability analyzer
│   │   │   └── picker.js      # Interactive element picker & DOM highlighter
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
│   │       └── persian-hint.js# Persian detection notification banner
│   └── sidebar/               # AI Side Panel
│       ├── sidebar.html       # Sidebar UI
│       ├── sidebar.css        # Sidebar styles
│       └── sidebar.js         # Sidebar chat & provider manager
└── dist/                      # Production Output (Load unpacked extension from here)
```

## 🚀 Development & Build

### 1. Build Extension
To compile all modules from `src/` to `dist/`:
```bash
npm run build
```
*(Runs in ~20ms using pure Node.js without needing external bundlers)*

### 2. Live Watch Mode
To automatically recompile whenever any file in `src/` is edited:
```bash
npm run watch
```
