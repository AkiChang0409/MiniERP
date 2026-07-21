/**
 * Minimal, safe Markdown renderer for agent answer bubbles (P5).
 *
 * Deliberately dependency-free and XSS-safe: it **escapes all HTML first**, then
 * applies a small set of inline/block transforms. Because escaping happens
 * before any tag is emitted, no attacker-supplied markup can survive — the only
 * tags in the output are the ones this function itself inserts.
 *
 * Supports: bold `**x**`, inline code `` `x` ``, unordered lists (`- ` / `* `),
 * ordered lists (`1. `), blank-line paragraphs, single-newline `<br>`. Anything
 * else renders as escaped text. Good enough for short assistant replies.
 */

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/** Inline transforms applied to already-escaped text. */
function inline(escaped: string): string {
	return escaped
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

/** Uniform block: `items` are list entries (ul/ol) or paragraph lines (p). */
interface Block {
	type: 'ul' | 'ol' | 'p';
	items: string[];
}

export function renderMarkdownLite(text: string): string {
	const escaped = escapeHtml(text ?? '');
	const lines = escaped.split(/\r?\n/);

	const blocks: Block[] = [];
	for (const raw of lines) {
		const line = raw.trimEnd();
		const ul = /^\s*[-*]\s+(.*)$/.exec(line);
		const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
		const last = blocks[blocks.length - 1];

		if (ul) {
			if (last?.type === 'ul') last.items.push(ul[1]);
			else blocks.push({ type: 'ul', items: [ul[1]] });
		} else if (ol) {
			if (last?.type === 'ol') last.items.push(ol[1]);
			else blocks.push({ type: 'ol', items: [ol[1]] });
		} else if (line.trim() === '') {
			// Blank line breaks the current paragraph (start a fresh one on next text).
			if (last?.type === 'p' && last.items.length > 0) blocks.push({ type: 'p', items: [] });
		} else if (last?.type === 'p') {
			last.items.push(line);
		} else {
			blocks.push({ type: 'p', items: [line] });
		}
	}

	return blocks
		.filter((b) => b.items.length > 0)
		.map((b) => {
			if (b.type === 'ul') return `<ul>${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`;
			if (b.type === 'ol') return `<ol>${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</ol>`;
			return `<p>${b.items.map(inline).join('<br>')}</p>`;
		})
		.join('');
}
