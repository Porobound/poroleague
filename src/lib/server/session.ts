import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { players, sessions } from '#lib/server/db/schema.ts';

export const SESSION_COOKIE = 'session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

// The cookie holds a random token; the DB only stores its hash, so a leaked DB can't be replayed as cookies.
// The Discord access token is stored plain on purpose: read-only scopes (identify, guilds.members.read),
// ~7-day lifetime, no refresh token kept. Encrypt it if wider scopes or refresh tokens ever land.
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export function createSession(
	playerId: string,
	accessToken: string,
	isOrganizer: boolean,
	expiresAt: Date
): string {
	const token = randomBytes(32).toString('base64url');
	db.insert(sessions)
		.values({ id: hash(token), playerId, accessToken, isOrganizer, expiresAt })
		.run();
	return token;
}

export function validateSession(token: string) {
	const row = db
		.select({ session: sessions, player: players })
		.from(sessions)
		.innerJoin(players, eq(sessions.playerId, players.id))
		.where(eq(sessions.id, hash(token)))
		.get();
	if (!row) return null;
	if (row.session.expiresAt < new Date()) {
		deleteSession(row.session.id);
		return null;
	}
	return row;
}

export function deleteSession(id: string) {
	db.delete(sessions).where(eq(sessions.id, id)).run();
}

export function setOrganizer(id: string, isOrganizer: boolean) {
	db.update(sessions).set({ isOrganizer }).where(eq(sessions.id, id)).run();
}
