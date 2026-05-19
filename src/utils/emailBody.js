/*
 * Email body display helpers.
 *
 * Some inbound emails (e.g. Perfectstay check-in templates) come through
 * as raw HTML source — full <style> blocks, inline CSS, no plain-text
 * alternative. The poll-gmail parser stores whatever was in the message
 * body as-is. The fix in the parser is non-trivial and risky to
 * retrofit; this is a display-layer safety net.
 *
 * The strategy is conservative — only do something when the content is
 * unambiguously raw HTML/CSS, otherwise leave it alone. False positives
 * here would silently mangle real text, which is much worse than the
 * occasional CSS soup.
 */

/**
 * Returns true if the body looks like raw HTML/CSS source rather than
 * plain text. Conservative: requires multiple HTML/CSS markers.
 */
export function looksLikeRawHtml(body) {
  if (!body || typeof body !== 'string') return false;
  // Strong signal: literal <style> or <script> tag
  if (/<style[\s>]/i.test(body) || /<script[\s>]/i.test(body)) return true;
  // Strong signal: dense CSS — many { ... } blocks with property: value pairs
  const cssBlockMatches = body.match(/\{[^{}]*:[^{}]+\}/g);
  if (cssBlockMatches && cssBlockMatches.length >= 3) return true;
  // Strong signal: leading HTML tag and at least one closing tag
  const trimmed = body.trim();
  if (/^<\w+/.test(trimmed) && /<\/\w+>/.test(trimmed)) return true;
  return false;
}

/**
 * Strip an HTML-ish body down to readable text. Keeps the visible
 * content, drops the markup. Conservative — relies on the browser's
 * own parser via DOMParser when available, falls back to regex
 * stripping otherwise.
 */
export function cleanEmailBody(body) {
  if (!body || typeof body !== 'string') return body;
  if (!looksLikeRawHtml(body)) return body;

  let text = body;

  // Try DOMParser first — most reliable extraction for real HTML
  try {
    if (typeof window !== 'undefined' && window.DOMParser) {
      const doc = new window.DOMParser().parseFromString(body, 'text/html');
      doc.querySelectorAll('style, script, head').forEach(n => n.remove());
      const extracted = doc.body ? (doc.body.textContent || '') : doc.documentElement.textContent || '';
      if (extracted.trim().length > 0) {
        text = extracted;
      }
    } else {
      // SSR fallback
      text = body
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
        .replace(/<[^>]+>/g, ' ');
    }
  } catch (e) {
    return body;
  }

  // After tag stripping, some emails (notably Perfectstay) still have
  // bare CSS in the textContent because the original message stored CSS
  // outside of <style> tags. Strip any run of CSS-like blocks:
  //   selector { property: value; ... }
  // Run iteratively in case there are multiple chained blocks with
  // commentary between them.
  let prev;
  do {
    prev = text;
    // Strip CSS rule blocks: anything-up-to-{ ... }
    // Match: optional leading selectors / @media / commas / colons / spaces / dots /
    //        # / * / [ ] / > / + / ~ / digits / letters / hyphens
    text = text.replace(/[@\w*.#:\-,\s>+~\[\]()'"%]+\{[^{}]*\}/g, ' ');
  } while (text !== prev && text.length > 0);

  // Decode entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Collapse whitespace, preserve paragraph breaks
  text = text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}

// Split plain-text email body into main content and quoted reply chain.
// Returns { main, quoted } where quoted may be empty string.
export function splitQuotedContent(body) {
  if (!body) return { main: '', quoted: '' }
  const lines = body.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // Standard > quoting
    if (/^>/.test(line)) {
      const main = lines.slice(0, i).join('\n').trim()
      const quoted = lines.slice(i).join('\n').trim()
      return { main, quoted }
    }

    // "On [date], [name] wrote:" — may span two lines
    if (/^On .{6,}wrote:$/i.test(line) || (i > 0 && /wrote:$/.test(line) && /^On /i.test(lines[i-1]))) {
      const start = /^On /i.test(line) ? i : i - 1
      const main = lines.slice(0, start).join('\n').trim()
      const quoted = lines.slice(start).join('\n').trim()
      return { main, quoted }
    }

    // Dividers: ---Original Message---, _____, ========
    if (/^[-_=]{3,}/.test(line)) {
      const main = lines.slice(0, i).join('\n').trim()
      const quoted = lines.slice(i).join('\n').trim()
      return { main, quoted }
    }

    // Forwarded message header block (From: / Sent: / To: in sequence)
    if (/^From:\s+/i.test(line) && i > 0) {
      const prev = lines[i - 1].trim()
      if (prev === '' || /^[-_=]{3,}/.test(prev)) {
        const main = lines.slice(0, i).join('\n').trim()
        const quoted = lines.slice(i).join('\n').trim()
        return { main, quoted }
      }
    }
  }

  return { main: body.trim(), quoted: '' }
}
