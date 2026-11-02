// Awards what existing results have earned (the app also does this on every start). Idempotent.
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { backfillAchievements } from '#lib/server/achievements.ts';
import * as schema from '#lib/server/db/schema.ts';

process.loadEnvFile();
const client = new Database(process.env.DATABASE_URL!);
const db = drizzle(client, { schema });
const count = () =>
	(client.prepare('select count(*) n from player_achievements').get() as { n: number }).n;
const before = count();
backfillAchievements(db);
console.log(`Awarded ${count() - before} achievements (${count()} in all).`);
