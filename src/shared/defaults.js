/**
 * Shared Default Configurations and Font Definitions
 */
import { DEFAULT_BLOCKER, DEFAULT_ADBLOCK } from './adblock.js';

export const DEFAULT_SITE = {
  enabled: false,
  direction: {
    enabled: false,
    value: 'rtl',
    scope: 'page',
    selector: '',
    label: ''
  },
  font: {
    enabled: false,
    scope: 'page',
    selector: '',
    label: '',
    family: "'Vazirmatn', 'Tahoma', sans-serif",
    size: 16,
    unit: 'px',
    lineHeight: '1.6',
    weight: '400',
    align: 'start'
  },
  translate: {
    enabled: false,
    scope: 'page',
    selector: '',
    label: '',
    targetLang: 'fa',
    engine: 'google',
    tone: 'standard',
    customPrompt: ''
  },
  blocker: { ...DEFAULT_BLOCKER },
  targets: []
};

export const TRANSLATION_TONES = [
  { id: 'standard', name: 'روان و طبیعی (پیش‌فرض)' },
  { id: 'formal', name: 'رسمی و تخصصی' },
  { id: 'colloquial', name: 'صمیمی و محاوره‌ای' },
  { id: 'literal', name: 'کلمه‌به‌کلمه و دقیق' },
  { id: 'simplified', name: 'ساده‌سازی شده' },
  { id: 'custom', name: 'پرامپت سفارشی...' }
];

export const SUPPORTED_LANGUAGES = [
  { code: 'fa', name: 'فارسی (Persian)' },
  { code: 'en', name: 'English' },
  { code: 'ar', name: 'العربية (Arabic)' },
  { code: 'fr', name: 'Français (French)' },
  { code: 'de', name: 'Deutsch (German)' },
  { code: 'es', name: 'Español (Spanish)' },
  { code: 'tr', name: 'Türkçe (Turkish)' },
  { code: 'ru', name: 'Русский (Russian)' },
  { code: 'zh', name: '中文 (Chinese)' },
  { code: 'ja', name: '日本語 (Japanese)' },
  { code: 'it', name: 'Italiano (Italian)' }
];

export const DEFAULT_FONTS = [
  { name: 'Vazirmatn (فارسی)', family: "'Vazirmatn', 'Tahoma', sans-serif" },
  { name: 'Estedad (فارسی)', family: "'Estedad', 'Tahoma', sans-serif" },
  { name: 'Sahel (فارسی)', family: "'Sahel', 'Tahoma', sans-serif" },
  { name: 'Lalezar (فارسی)', family: "'Lalezar', 'Tahoma', sans-serif" }
];

export const BUNDLED_FONTS = [
  { name: 'Vazirmatn', family: 'Vazirmatn', file: 'assets/fonts/Vazirmatn-Regular.woff2', format: 'woff2' },
  { name: 'Estedad', family: 'Estedad', file: 'assets/fonts/Estedad-Regular.woff2', format: 'woff2' },
  { name: 'Sahel', family: 'Sahel', file: 'assets/fonts/Sahel-Regular.woff2', format: 'woff2' },
  { name: 'Lalezar', family: 'Lalezar', file: 'assets/fonts/Lalezar-Regular.woff2', format: 'woff2' }
];

export const DEFAULTS = {
  settings: {},
  fonts: [],
  bundledFonts: BUNDLED_FONTS,
  providers: [],
  customTools: [],
  chatHistory: {},
  detect: { threshold: 0.2, extraFonts: [] },
  adblock: DEFAULT_ADBLOCK,
  adblockStats: { total: 0, perDomain: {}, popups: 0, cosmetic: 0, since: 0 }
};
