import privacy from '../../../docs/privacy.md?raw';
import { renderDoc } from '#lib/rules.ts';
import type { PageServerLoad } from './$types';

// Inlined at build time, so the image doesn't need docs/.
const html = renderDoc(privacy);

export const load: PageServerLoad = () => ({ html });
