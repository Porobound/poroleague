import api from '../../../docs/api.md?raw';
import { renderDoc } from '#lib/rules.ts';
import type { PageServerLoad } from './$types';

// Inlined at build time, so the image doesn't need docs/.
const html = renderDoc(api);

export const load: PageServerLoad = () => ({ html });
