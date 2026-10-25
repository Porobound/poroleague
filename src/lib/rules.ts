import { Marked } from 'marked';
import { slugify } from '#lib/season.ts';

// Headings get ids from their text, so the site can link to a rule: "5. Reporting results" → #5-reporting-results.
const marked = new Marked({
	renderer: {
		heading({ tokens, depth, text }) {
			return `<h${depth} id="${slugify(text)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
		}
	}
});

// Our own markdown (docs/), rendered on the server.
export const renderDoc = (md: string) => marked.parse(md, { async: false });

// docs/rules.md as HTML, up to the ideas and open questions, which aren't rules yet.
export const renderRules = (md: string) => renderDoc(md.split(/^## Ideas for future seasons/m)[0]);
