/**
 * EasyWeb Zero-Dependency Build Pipeline
 * Bundles ES modules into production Chrome Extension files in dist/
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC_DIR = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dest);
    const files = fs.readdirSync(src);
    for (const file of files) {
      copyRecursive(path.join(src, file), path.join(dest, file));
    }
  } else {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
  }
}

/**
 * Lightweight, zero-dependency ES module bundler.
 * Traverses local imports recursively and produces a single self-contained IIFE/bundle.
 */
function bundleModule(entryFilePath) {
  const visited = new Set();
  const moduleOrder = [];
  const moduleMap = new Map();

  function resolveImportPath(fromFile, importSpecifier) {
    let resolved = path.resolve(path.dirname(fromFile), importSpecifier);
    if (!path.extname(resolved)) {
      if (fs.existsSync(resolved + '.js')) resolved += '.js';
      else if (fs.existsSync(path.join(resolved, 'index.js'))) resolved = path.join(resolved, 'index.js');
    }
    return resolved;
  }

  function collect(filePath) {
    const fullPath = path.resolve(filePath);
    if (visited.has(fullPath)) return;
    visited.add(fullPath);

    const source = fs.readFileSync(fullPath, 'utf8');
    const importRegex = /^\s*import\s+(?:(?:(\w+)\s*,?\s*)?(?:\{([^}]+)\})?(?:\*\s+as\s+(\w+))?\s+from\s+)?['"]([^'"]+)['"];?/gm;
    let match;
    const dependencies = [];

    while ((match = importRegex.exec(source)) !== null) {
      const specifier = match[4];
      if (specifier.startsWith('.')) {
        const depPath = resolveImportPath(fullPath, specifier);
        dependencies.push(depPath);
        collect(depPath);
      }
    }

    moduleOrder.push(fullPath);
    moduleMap.set(fullPath, source);
  }

  collect(entryFilePath);

  // Combine modules: remove import and export statements and wrap in clean scope
  const combinedParts = [];
  for (const modPath of moduleOrder) {
    let code = moduleMap.get(modPath);
    // Strip comments at module boundary if desired, keep internal logic
    // Remove import statements
    code = code.replace(/^\s*import\s+[^;]+;?\s*$/gm, '');
    // Replace export declarations
    code = code.replace(/^\s*export\s+const\s+/gm, 'const ');
    code = code.replace(/^\s*export\s+let\s+/gm, 'let ');
    code = code.replace(/^\s*export\s+var\s+/gm, 'var ');
    code = code.replace(/^\s*export\s+function\s+/gm, 'function ');
    code = code.replace(/^\s*export\s+class\s+/gm, 'class ');
    code = code.replace(/^\s*export\s+async\s+function\s+/gm, 'async function ');
    code = code.replace(/^\s*export\s+default\s+/gm, '');
    code = code.replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, '');

    const relName = path.relative(SRC_DIR, modPath).replace(/\\/g, '/');
    combinedParts.push(`// --- Module: ${relName} ---\n${code.trim()}`);
  }

  return `(() => {\n${combinedParts.join('\n\n')}\n})();\n`;
}

export function build() {
  console.log('📦 Building EasyWeb extension...');
  const startTime = Date.now();

  // 1. Clean dist
  cleanDir(DIST_DIR);

  // 2. Copy manifest
  const manifestSrc = fs.existsSync(path.join(SRC_DIR, 'manifest.json'))
    ? path.join(SRC_DIR, 'manifest.json')
    : path.join(__dirname, 'manifest.json');
  if (fs.existsSync(manifestSrc)) {
    fs.copyFileSync(manifestSrc, path.join(DIST_DIR, 'manifest.json'));
  }

  // 3. Copy assets
  copyRecursive(path.join(SRC_DIR, 'assets'), path.join(DIST_DIR, 'assets'));

  // 4. Bundle content script
  const contentEntry = path.join(SRC_DIR, 'content', 'index.js');
  const contentBundle = bundleModule(contentEntry);
  fs.writeFileSync(path.join(DIST_DIR, 'content.js'), contentBundle, 'utf8');

  // 5. Bundle background script
  const bgEntry = path.join(SRC_DIR, 'background', 'index.js');
  const bgBundle = bundleModule(bgEntry);
  fs.writeFileSync(path.join(DIST_DIR, 'background.js'), bgBundle, 'utf8');

  // 6. Bundle popup script & copy HTML/CSS
  const popupEntry = path.join(SRC_DIR, 'popup', 'popup.js');
  const popupBundle = bundleModule(popupEntry);
  fs.writeFileSync(path.join(DIST_DIR, 'popup.js'), popupBundle, 'utf8');
  fs.copyFileSync(path.join(SRC_DIR, 'popup', 'popup.html'), path.join(DIST_DIR, 'popup.html'));
  fs.copyFileSync(path.join(SRC_DIR, 'popup', 'popup.css'), path.join(DIST_DIR, 'popup.css'));

  // 7. Bundle sidebar script & copy HTML/CSS
  if (fs.existsSync(path.join(SRC_DIR, 'sidebar'))) {
    const sidebarEntry = path.join(SRC_DIR, 'sidebar', 'sidebar.js');
    const sidebarBundle = bundleModule(sidebarEntry);
    fs.writeFileSync(path.join(DIST_DIR, 'sidebar.js'), sidebarBundle, 'utf8');
    fs.copyFileSync(path.join(SRC_DIR, 'sidebar', 'sidebar.html'), path.join(DIST_DIR, 'sidebar.html'));
    fs.copyFileSync(path.join(SRC_DIR, 'sidebar', 'sidebar.css'), path.join(DIST_DIR, 'sidebar.css'));
  }

  const elapsed = Date.now() - startTime;
  console.log(`✅ Build completed successfully in ${elapsed}ms -> dist/`);
}

// Watch mode
if (process.argv.includes('--watch')) {
  build();
  console.log('👀 Watching src/ for changes...');
  fs.watch(SRC_DIR, { recursive: true }, (eventType, filename) => {
    console.log(`🔄 Change detected in ${filename}, rebuilding...`);
    try {
      build();
    } catch (err) {
      console.error('❌ Build error:', err);
    }
  });
} else {
  build();
}
