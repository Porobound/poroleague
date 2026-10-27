import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '#lib/server/db/index.ts';
import { players } from '#lib/server/db/schema.ts';
import { setPlayerRoles } from '#lib/server/discord.ts';
import { erasePlayer } from '#lib/server/players.ts';
import {
	addEntry,
	cancelDrop,
	deleteSeason,
	dropPlayer,
	finalizeSeason,
	removeEntry
} from '#lib/server/seasons.ts';
import { seedEntries, seedPlayers, seedSeason } from '#lib/server/test/seed.ts';
import { finishCut } from '#lib/server/topCut.ts';

vi.mock('#lib/server/discord.ts', async (orig) => ({
	...(await orig<typeof import('#lib/server/discord.ts')>()),
	setPlayerRoles: vi.fn(async () => {})
}));
const calls = () => vi.mocked(setPlayerRoles).mock.calls.map(([changes]) => changes);

// p1..p3 have Discord ids d1..d3; p4 was erased (no Discord id).
function seed(status: 'signup' | 'play' | 'finished' = 'signup') {
	const ids = seedPlayers(4);
	ids.slice(0, 3).forEach((id, i) =>
		db
			.update(players)
			.set({ discordId: `d${i + 1}` })
			.where(eq(players.id, id))
			.run()
	);
	return seedSeason({ status });
}

describe('player role sync', () => {
	beforeEach(() => vi.mocked(setPlayerRoles).mockClear());

	it('signup adds the role, withdraw and removal take it away', () => {
		const s = seed();
		addEntry(s.id, 'p1');
		removeEntry(s.id, 'p1');
		expect(calls()).toEqual([[['d1', true]], [['d1', false]]]);
	});

	it('drop takes it away, cancelling the drop gives it back', () => {
		const s = seed('play');
		seedEntries(s.id, ['p1', 'p2']);
		dropPlayer(s.id, 'p2', 'p1');
		cancelDrop(s.id, 'p2', 'p1');
		expect(calls()).toEqual([[['d2', false]], [['d2', true]]]);
	});

	it('finishing the season takes it from every entrant with a Discord id', () => {
		const s = seed('play');
		seedEntries(s.id, ['p1', 'p2', 'p4']);
		finalizeSeason(s.id, 'p1', false);
		expect(calls()).toEqual([
			[
				['d1', false],
				['d2', false]
			]
		]);
	});

	it('entering the top cut keeps it; the champion ends the season', () => {
		const s = seed('play');
		seedEntries(s.id, ['p1', 'p2']);
		finalizeSeason(s.id, 'p1', true);
		expect(calls()).toEqual([]);
		finishCut({ ...s, status: 'topcut' }, 'p1', 'p1');
		expect(calls()).toEqual([
			[
				['d1', false],
				['d2', false]
			]
		]);
	});

	it('deleting a season takes it from its entrants', () => {
		const s = seed();
		seedEntries(s.id, ['p3']);
		deleteSeason(s, 'p1');
		expect(calls()).toEqual([[['d3', false]]]);
	});

	// Regression: deleting an old season stripped the role from its players signed up for the new one.
	it('deleting a finished season keeps it for players in the running one', () => {
		const old = seed('finished');
		const next = seedSeason({ slug: 's2', name: 'Season 2', status: 'signup' });
		seedEntries(old.id, ['p1', 'p2']);
		seedEntries(next.id, ['p1']);
		deleteSeason(old, 'p3');
		expect(calls()).toEqual([
			[
				['d1', true],
				['d2', false]
			]
		]);
	});

	it('erasure takes it away once the erasure is saved', () => {
		seed();
		erasePlayer('p3', 'p1');
		expect(calls()).toEqual([[['d3', false]]]);
	});

	// Regression: the role went before the erasure transaction, even when it then rolled back.
	it('a failed erasure leaves the role alone', () => {
		seed();
		vi.spyOn(db, 'transaction').mockImplementationOnce(() => {
			throw new Error('boom');
		});
		expect(() => erasePlayer('p3', 'p1')).toThrow('boom');
		expect(calls()).toEqual([]);
	});

	it('skips players without a Discord id', () => {
		const s = seed();
		addEntry(s.id, 'p4');
		expect(calls()).toEqual([]);
	});
});
