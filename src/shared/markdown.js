/**
 * Minimal, dependency-free Markdown -> HTML renderer for AI answers.
 * Covers what LLMs commonly emit (code fences, headings, lists, inline code,
 * bold/italic, links, blockquotes, hr). Everything is HTML-escaped first, so
 * no user or LLM text can become executable markup. Not a complete spec — it
 * is tuned for chat messages, not document interchange.
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderMarkdown(md) {
  const esc = escapeHtml;
  return esc(md ?? '')
    .replace(/\r\n/g, '\n')
    // fenced code blocks first (optional language tag)
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
      `<pre><code>${code.replace(/\n$/, '')}</code></pre>`)
    // headings
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    // blockquote + hr
    .replace(/^&gt; (.*)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^---$/gm, '<hr>')
    // lists
    .replace(/^\s*[-*] (.*)$/gm, '<li>$1</li>')
    .replace(/^\s*\d+[.)] (.*)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>')
    // paragraphs: wrap non-block plain lines in <p>
    .replace(/\n{2,}/g, '\n')
    .split('\n')
    .map((line) => {
      const t = line.trim();
      if (!t) return '';
      if (/^(<h\d>|<ul>|<li>|<pre>|<blockquote>|<hr>)/.test(t) || /^<\/?/.test(t) || /^\s*<t/.test(t)) return t;
      return `<p>${formatInline(t)}</p>`;
    })
    .join('\n');

  function formatInline(text) {
    const safeHref = (url) => {
      const u = String(url ?? '').trim();
      // only safe schemes; block javascript:/data: etc. (blocking XSS via links)
      return /^(https?:|mailto:)/i.test(u) ? u : '#';
    };
    return text
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) =>
        `<a href="${safeHref(url)}" target="_blank" rel="noopener">${label}</a>`);
  }
}

/** Render one assistant message's text. Plain one-liners stay plain text. */
export function assistantBody(text) {
  const t = String(text ?? '').trim();
  if (!t) return escapeHtml(text ?? '');
  if (!/[#*`>\[]/.test(t) && !t.includes('\n')) return escapeHtml(t);
  return renderMarkdown(t);
}
