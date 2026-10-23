import { describe, expect, it } from 'vitest';
import rules from '../../docs/rules.md?raw';
import { renderRules } from '#lib/rules.ts';

describe('renderRules', () => {
	const html = renderRules(rules);

	it('gives every heading an id to link to', () => {
		expect(html).toContain('<h2 id="5-reporting-results">5. Reporting results</h2>');
		expect(html).toContain('<h1 id="poroleague-rules">Poroleague Rules</h1>');
	});

	it('leaves out the ideas and open questions', () => {
		expect(html).toContain('id="9-conduct"');
		expect(html).not.toContain('Ideas for future seasons');
		expect(html).not.toContain('Open questions');
	});

	it('renders inline markdown', () => {
		expect(renderRules('- **A saved report is final:** yes')).toBe(
			'<ul>\n<li><strong>A saved report is final:</strong> yes</li>\n</ul>\n'
		);
	});
});
