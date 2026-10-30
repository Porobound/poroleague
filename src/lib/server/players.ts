import { randomBytes } from 'node:crypto';
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { escapeMd } from '#lib/discord.ts';
import { cutFinish } from '#lib/league/bracket.ts';
import { ratings } from '#lib/league/rating.ts';
import { db } from '#lib/server/db/index.ts';
import { setPlayerRoles } from '#lib/server/discord.ts';
import {
	audit,
	entries,
	former,
	matches,
	players,
	seasons,
	sessions
} from '#lib/server/db/schema.ts';
import { dropPlayer, groupStandings, seasonEntries } from '#lib/server/seasons.ts';
import { cutState } from '#lib/server/topCut.ts';

export const newPlayerId = () => randomBytes(8).toString('hex');

// Embed text per player: a Discord mention, or the plain name once erased (or never linked).
export function discordMentions(ids: string[]) {
	const rows = db.select().from(players).where(inArray(players.id, ids)).all();
	const by = new Map(
		rows.map((p) => [p.id, p.discordId ? `<@${p.discordId}>` : escapeMd(p.displayName)])
	);
	return (id: string) => by.get(id) ?? 'Unknown';
}

// GDPR erasure: the player stays as "Former player 3f9a" so results and standings don't change,
// but their Discord link, name, avatar, logins and flag reasons go. One audit row per season.
export function erasePlayer(playerId: string, actorId: string) {
	const { discordId, ...erased } = db.transaction((tx) => {
		const p = tx.select().from(players).where(eq(players.id, playerId)).get();
		if (!p || p.erasedAt) throw new Error(`No player ${playerId} to erase`);
		// A random suffix tells former players apart without depending on the order of erasures.
		let name: string;
		do name = `Former player ${randomBytes(2).toString('hex')}`;
		while (tx.select().from(players).where(eq(players.displayName, name)).get());
		tx.update(players)
			.set({ displayName: name, avatar: null, discordId: null, erasedAt: new Date() })
			.where(eq(players.id, playerId))
			.run();
		tx.delete(sessions).where(eq(sessions.playerId, playerId)).run();
		tx.update(matches).set({ flagReason: null }).where(eq(matches.flaggedBy, playerId)).run();
		tx.update(audit)
			.set({ after: sql`json_remove(${audit.after}, '$.flagReason')` })
			.where(and(eq(audit.actorId, playerId), eq(audit.action, 'flag')))
			.run();
		// They can't play on: off the list before groups are locked, dropped (matches void) in play.
		// In the top cut a drop would rewrite the seeding standings, so they stay: they can't qualify,
		// and once the bracket is out an organizer walks their match over.
		const theirs = tx
			.select({
				id: seasons.id,
				name: seasons.name,
				slug: seasons.slug,
				status: seasons.status,
				dropped: entries.dropped,
				slot: entries.slot
			})
			.from(entries)
			.innerJoin(seasons, eq(entries.seasonId, seasons.id))
			.where(and(eq(entries.playerId, playerId), isNull(seasons.deletedAt)))
			.all();
		// Seasons in play they were dropped from, for the organizers' Discord notice.
		const dropped: { name: string; slug: string }[] = [];
		// Top cuts with a published bracket they're in: organizers walk their open match over.
		const walkovers: { name: string; slug: string }[] = [];
		for (const s of theirs) {
			const entry = and(eq(entries.seasonId, s.id), eq(entries.playerId, playerId));
			if (s.status === 'signup' || s.status === 'groups') {
				tx.delete(entries).where(entry).run();
				continue;
			}
			if (s.status === 'play' && !s.dropped) {
				dropPlayer(s.id, playerId, actorId, tx);
				dropped.push({ name: s.name, slug: s.slug });
			}
			if (s.status === 'topcut' && s.slot !== null) walkovers.push({ name: s.name, slug: s.slug });
			tx.insert(audit)
				.values({ seasonId: s.id, actorId, action: 'erase', after: { erased: playerId } })
				.run();
		}
		return { name, dropped, walkovers, discordId: p.discordId };
	});
	// Only once the erasure is saved: the Discord id is gone from the DB by now.
	if (discordId) void setPlayerRoles([[discordId, false]]);
	return erased;
}

// Lower is better: top-cut finishes, then group places.
const CUT_RANK: Record<string, number> = {
	Champion: 0,
	'Runner-up': 1,
	Semifinal: 2,
	Quarterfinal: 3
};
const cutRank = (label: string) => CUT_RANK[label] ?? Math.log2(Number(label.split(' ').at(-1)));

// Every player of every live season past groups, ranked by Elo over all counted matches: reported,
// not a walkover, in a live season. Matches with a since-dropped player still count, unlike in the
// group standings. Computed per request.
// ponytail: standings per season, like playerSeasons; fine for a handful of seasons a year.
export function leaderboard() {
	const live = and(
		isNull(seasons.deletedAt),
		inArray(seasons.status, ['play', 'topcut', 'finished'])
	);
	const counted = db
		.select({
			p1: matches.p1Id,
			p2: matches.p2Id,
			p1Games: sql<number>`${matches.p1Games}`,
			p2Games: sql<number>`${matches.p2Games}`
		})
		.from(matches)
		.innerJoin(seasons, eq(matches.seasonId, seasons.id))
		.where(
			and(
				live,
				isNotNull(matches.reportedBy),
				isNotNull(matches.p1Games),
				isNotNull(matches.p2Games),
				isNull(matches.walkoverId)
			)
		)
		.orderBy(asc(matches.reportedAt), asc(matches.id))
		.all();
	const rating = ratings(counted);

	const rows = new Map(
		db
			.select({ playerId: players.id, displayName: players.displayName, former: former() })
			.from(players)
			.where(
				inArray(
					players.id,
					db
						.select({ id: entries.playerId })
						.from(entries)
						.innerJoin(seasons, eq(entries.seasonId, seasons.id))
						.where(live)
				)
			)
			.all()
			.map((p) => [
				p.playerId,
				{
					...p,
					rating: rating.get(p.playerId) ?? null,
					played: 0,
					wins: 0,
					draws: 0,
					losses: 0,
					gameWins: 0,
					gameLosses: 0,
					seasons: 0,
					best: null as { label: string; rank: number } | null
				}
			])
	);
	for (const m of counted)
		for (const [id, mine, theirs] of [
			[m.p1, m.p1Games, m.p2Games],
			[m.p2, m.p2Games, m.p1Games]
		] as const) {
			const r = rows.get(id)!;
			r.played++;
			r[mine > theirs ? 'wins' : mine < theirs ? 'losses' : 'draws']++;
			r.gameWins += mine;
			r.gameLosses += theirs;
		}

	const best = (id: string, label: string, rank: number) => {
		const r = rows.get(id)!;
		if (!r.best || rank < r.best.rank) r.best = { label, rank };
	};
	for (const season of db.select().from(seasons).where(live).all()) {
		const list = seasonEntries(season.id);
		for (const e of list) rows.get(e.playerId)!.seasons++;
		for (const g of groupStandings(season, list))
			g.rows.forEach((r, i) => {
				if (r.played) best(r.playerId, `#${i + 1} of ${g.size}`, 100 + i);
			});
		if (season.status === 'play') continue;
		const { rounds } = cutState(season);
		for (const e of list) {
			const cut = cutFinish(rounds, e.playerId);
			if (cut) best(e.playerId, cut, cutRank(cut));
		}
	}

	return [...rows.values()]
		.map(({ best, ...r }) => ({
			...r,
			gwp: r.gameWins + r.gameLosses ? r.gameWins / (r.gameWins + r.gameLosses) : null,
			best: best?.label ?? null
		}))
		.sort(
			(a, b) =>
				(b.rating ?? -Infinity) - (a.rating ?? -Infinity) ||
				a.displayName.localeCompare(b.displayName)
		);
}
