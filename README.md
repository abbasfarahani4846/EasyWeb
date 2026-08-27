# EasyWeb Chrome Extension

> **EasyWeb** is a Chrome extension that personalizes website direction (RTL/LTR) and typography (Persian fonts & custom font uploads) with full per-segment targeting and an integrated AI assistant.

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

---

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

### 3. Load into Google Chrome
1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right switch).
3. Click **Load unpacked**.
4. Select the `dist/` folder inside this repository: `d:\Projects\EasyWeb\dist`.
