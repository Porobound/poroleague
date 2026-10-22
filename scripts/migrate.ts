import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const client = new Database(process.env.DATABASE_URL);
migrate(drizzle(client), { migrationsFolder: 'drizzle' });
client.close();
