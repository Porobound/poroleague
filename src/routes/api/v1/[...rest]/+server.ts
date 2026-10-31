import { notFound } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

// Unknown API paths answer in JSON, not with the HTML error page.
export const GET: RequestHandler = () => notFound('Not found');
