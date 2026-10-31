import { json } from '@sveltejs/kit';
import { seasonList } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => json(seasonList());
