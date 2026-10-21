import { desc } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { seasons } from '#lib/server/db/schema.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
	season:
		db
			.select({ name: seasons.name, status: seasons.status })
			.from(seasons)
			.orderBy(desc(seasons.id))
			.limit(1)
			.get() ?? null
});
