/**
 * EasyWeb markdown renderer — self-check (Node, no deps).
 * Verifies the AI-answer formatter escapes hostile input and maps the common
 * LLM constructs to the expected markup.
 */
import assert from 'node:assert/strict';
import { renderMarkdown, assistantBody, escapeHtml } from '../src/shared/markdown.js';

let passed = 0;
function check(name, actual, expected) {
  assert.equal(actual, expected, name);
  passed++;
}

// 1. Hostile input is escaped, never executed.
check('escapes <script>', renderMarkdown('<script>alert(1)</script>'),
  '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
check('blocks javascript: link', renderMarkdown('[x](javascript:alert)'),
  '<p><a href="#" target="_blank" rel="noopener">x</a></p>');
check('safe https link', renderMarkdown('[EasyWeb](https://easyweb.dev)'),
  '<p><a href="https://easyweb.dev" target="_blank" rel="noopener">EasyWeb</a></p>');

// 2. Headings
check('h1', renderMarkdown('# Title'), '<h1>Title</h1>');
check('h2', renderMarkdown('## Sub'), '<h2>Sub</h2>');

// 3. Bold / italic / inline code
check('bold+code', renderMarkdown('use **npm** and `x`'),
  '<p>use <strong>npm</strong> and <code>x</code></p>');
check('italic', renderMarkdown('*hi*'), '<p><em>hi</em></p>');

// 4. Lists
check('ul', renderMarkdown('- a\n- b'),
  '<ul><li>a</li>\n<li>b</li></ul>');
check('ol', renderMarkdown('1. one\n2. two'),
  '<ul><li>one</li>\n<li>two</li></ul>');

// 5. Fenced code block survives verbatim, newline-stripped.
check('fence', renderMarkdown('```js\nconst a = 1;\n```'),
  '<pre><code>const a = 1;</code></pre>');

// 6. Blockquote
check('quote', renderMarkdown('> note'), '<blockquote>note</blockquote>');

// 7. assistantBody keeps plain one-liners raw (no <p> wrapper)
check('plain oneliner', assistantBody('سلام'), 'سلام');
check('multiline plain', assistantBody('line1\nline2'),
  '<p>line1</p>\n<p>line2</p>');

// 8. escapeHtml util
check('escape util', escapeHtml('a<b>&c'), 'a&lt;b&gt;&amp;c');

console.log(`markdown.test.mjs: ${passed} passed, 0 failed`);
