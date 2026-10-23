import rules from '../../../docs/rules.md?raw';
import { renderRules } from '#lib/rules.ts';
import type { PageServerLoad } from './$types';

// Inlined at build time, so the image doesn't need docs/.
const html = renderRules(rules);

export const load: PageServerLoad = () => ({ html });
