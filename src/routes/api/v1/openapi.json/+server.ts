import { json } from '@sveltejs/kit';
import spec from '#lib/server/openapi.json';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => json(spec);
