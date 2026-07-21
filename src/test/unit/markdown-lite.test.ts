import { describe, it, expect } from 'vitest';
import { renderMarkdownLite } from '$app-layer/ai-panel/agent/markdown-lite';

/**
 * P5 answer renderer: safe (escape-first) + a few markdown transforms. The key
 * guarantee is XSS-safety — raw HTML in the input must never reach the output.
 */
describe('renderMarkdownLite', () => {
	it('escapes HTML before formatting (XSS-safe)', () => {
		const out = renderMarkdownLite('<img src=x onerror=alert(1)>');
		expect(out).not.toContain('<img');
		expect(out).toContain('&lt;img');
	});

	it('renders bold and inline code', () => {
		const out = renderMarkdownLite('a **bold** and `code` here');
		expect(out).toContain('<strong>bold</strong>');
		expect(out).toContain('<code>code</code>');
	});

	it('renders unordered and ordered lists', () => {
		expect(renderMarkdownLite('- one\n- two')).toBe('<ul><li>one</li><li>two</li></ul>');
		expect(renderMarkdownLite('1. a\n2. b')).toBe('<ol><li>a</li><li>b</li></ol>');
	});

	it('splits paragraphs on blank lines and <br> within', () => {
		const out = renderMarkdownLite('line1\nline2\n\npara2');
		expect(out).toBe('<p>line1<br>line2</p><p>para2</p>');
	});

	it('handles empty input', () => {
		expect(renderMarkdownLite('')).toBe('');
	});
});
