import { and, eq, isNotNull } from 'drizzle-orm';
import {
	bracket,
	bracketSize,
	drawBracket,
	MAX_CUT,
	seedLabel,
	type Slot
} from '#lib/league/bracket.ts';
import { groupName } from '#lib/season.ts';
import { db } from '#lib/server/db/index.ts';
import { audit, entries, matches, seasons } from '#lib/server/db/schema.ts';
import type { Match, Tx } from '#lib/server/matches.ts';
import { groupStandings, seasonEntries, type Season } from '#lib/server/seasons.ts';

type Db = typeof db | Tx;

// Each group's top N by the final standings (tiebreaks settled at finalize), dropped players skipped.
function qualifiers(season: Season) {
	const list = seasonEntries(season.id);
	const out = new Set(list.filter((e) => e.dropped).map((e) => e.playerId));
	const per = season.topCutSize ?? 0;
	const groups = groupStandings(season, list).map((g) =>
		g.rows.filter((r) => !out.has(r.playerId)).slice(0, per)
	);
	return { per, groups, list };
}

export function cutPreview(season: Season) {
	const { per, groups, list } = qualifiers(season);
	const total = per * groups.length;
	const short = groups.findIndex((g) => g.length < per);
	const problem =
		total < 2
			? 'The top cut needs at least 2 players. Set the top cut per group on Season.'
			: total > MAX_CUT
				? `${total} players is more than the ${MAX_CUT} a bracket takes. Lower the top cut per group on Season.`
				: short >= 0
					? `${groupName(short + 1)} has only ${groups[short].length} players who can qualify.`
					: null;
	const size = { per, total, bracket: bracketSize(total), byes: bracketSize(total) - total };
	if (problem) return { problem, size, firstRound: [] };
	const slots = drawBracket(groups.map((g) => g.map((r) => r.playerId)));
	const seedOf = new Map(
		groups[0].flatMap((_, r) =>
			groups.map((g, i) => [g[r].playerId, r * groups.length + i + 1] as const)
		)
	);
	const name = (id: string | null) => {
		if (!id) return null;
		const e = list.find((x) => x.playerId === id)!;
		return { id, name: e.displayName, label: seedLabel(seedOf.get(id)!, groups.length) };
	};
	return {
		problem,
		size,
		slots,
		seedOf,
		firstRound: Array.from({ length: slots.length / 2 }, (_, i) => ({
			p1: name(slots[2 * i]),
			p2: name(slots[2 * i + 1])
		}))
	};
}

// The published bracket: layout from entries.slot, seeds from entries.seed.
function cutEntries(tx: Db, seasonId: number) {
	const rows = tx
		.select({ playerId: entries.playerId, seed: entries.seed, slot: entries.slot })
		.from(entries)
		.where(and(eq(entries.seasonId, seasonId), isNotNull(entries.slot)))
		.all();
	const layout: (string | null)[] = Array(rows.length ? bracketSize(rows.length) : 0).fill(null);
	for (const r of rows) layout[r.slot!] = r.playerId;
	const seeds = new Map(rows.map((r) => [r.playerId, r.seed!]));
	return { layout, seedOf: (id: string) => seeds.get(id) ?? Infinity, seeds };
}

const cutRows = (tx: Db, seasonId: number) =>
	tx
		.select()
		.from(matches)
		.where(and(eq(matches.seasonId, seasonId), eq(matches.stage, 'playoff')))
		.all();

export const cutRounds = (seasonId: number) => {
	const n = cutEntries(db, seasonId).layout.length;
	return n ? Math.log2(n) : 0;
};

export function cutState(season: Season, tx: Db = db) {
	const { layout, seedOf, seeds } = cutEntries(tx, season.id);
	const rounds: Slot<Match>[][] = layout.length
		? bracket(layout, cutRows(tx, season.id), seedOf)
		: [];
	const groupCount = new Set(
		seasonEntries(season.id)
			.map((e) => e.group)
			.filter(Boolean)
	).size;
	const final = rounds.at(-1)?.[0];
	return {
		published: layout.length > 0,
		rounds,
		seeds,
		label: (id: string) => seedLabel(seeds.get(id)!, groupCount),
		champion: final?.winner ?? null
	};
}

// The one writer of playoff rows: inserts a match once both players are known, and repoints an
// unreported match after an upstream edit. ponytail: re-reads after each fix; at most 31 matches.
export function syncBracket(tx: Tx, season: { id: number }) {
	for (;;) {
		const { layout, seedOf } = cutEntries(tx, season.id);
		if (!layout.length) return;
		const rows = cutRows(tx, season.id);
		const stale = bracket(layout, rows, seedOf)
			.flat()
			.find((s) => !s.bye && s.p1 && s.p2 && !s.match);
		if (!stale) return;
		const row = rows.find((m) => m.round === stale.round && m.slot === stale.slot);
		if (row)
			tx.update(matches)
				.set({ p1Id: stale.p1!, p2Id: stale.p2! })
				.where(eq(matches.id, row.id))
				.run();
		else
			tx.insert(matches)
				.values({
					seasonId: season.id,
					stage: 'playoff',
					round: stale.round,
					slot: stale.slot,
					p1Id: stale.p1!,
					p2Id: stale.p2!
				})
				.run();
	}
}

export function publishCut(season: Season, date: string | null, actorId: string) {
	const p = cutPreview(season);
	if (p.problem || !p.slots) throw new Error(p.problem ?? 'Nothing to publish');
	db.transaction((tx) => {
		if (cutEntries(tx, season.id).layout.length)
			throw new Error('The top cut is already published');
		p.slots!.forEach((playerId, slot) => {
			if (playerId)
				tx.update(entries)
					.set({ seed: p.seedOf!.get(playerId)!, slot })
					.where(and(eq(entries.seasonId, season.id), eq(entries.playerId, playerId)))
					.run();
		});
		tx.update(seasons).set({ topCutDate: date }).where(eq(seasons.id, season.id)).run();
		tx.insert(audit)
			.values({
				seasonId: season.id,
				actorId,
				action: 'topcut',
				after: { size: p.size.total, date }
			})
			.run();
		syncBracket(tx, season);
	});
}

// An edit is allowed only while the winner's next match is unreported (fixes go latest first).
export function nextPlayed(season: Season, m: Match) {
	const { rounds } = cutState(season);
	const next = rounds[m.round]?.[(m.slot ?? 0) >> 1]?.match;
	return !!next && (!!next.reportedBy || !!next.walkoverId);
}

export function walkover(season: Season, m: Match, winnerId: string, actorId: string) {
	db.transaction((tx) => {
		tx.update(matches).set({ walkoverId: winnerId }).where(eq(matches.id, m.id)).run();
		tx.insert(audit)
			.values({
				seasonId: season.id,
				matchId: m.id,
				actorId,
				action: 'walkover',
				after: { winner: winnerId }
			})
			.run();
		syncBracket(tx, season);
	});
}

export function finishCut(season: Season, championId: string, actorId: string) {
	db.transaction((tx) => {
		tx.update(seasons).set({ status: 'finished' }).where(eq(seasons.id, season.id)).run();
		tx.insert(audit)
			.values({ seasonId: season.id, actorId, action: 'champion', after: { champion: championId } })
			.run();
	});
}
