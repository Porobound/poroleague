import { isRedirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
	actions as careerActions,
	load as careerPage
} from '../../routes/players/[id]/+page.server.ts';
import { load as seasonPlayerPage } from '../../routes/seasons/[slug]/players/[id]/+page.server.ts';
import { ACHIEVEMENTS } from '#lib/league/achievements.ts';
import { db } from '#lib/server/db/index.ts';
import { playerAchievements, players } from '#lib/server/db/schema.ts';
import { equip, ownedAchievements } from '#lib/server/cosmetics.ts';
import { seedEntries, seedPlayers, seedSeason } from '#lib/server/test/seed.ts';

const earn = (playerId: string, ids: string[]) =>
	db
		.insert(playerAchievements)
		.values(
			ids.map((achievementId) => ({
				playerId,
				achievementId,
				unlockedAt: new Date(),
				seasonId: null
			}))
		)
		.run();
const slots = (id: string) => {
	const p = db.select().from(players).where(eq(players.id, id)).get()!;
	return [p.titleAchievement, p.badgeAchievement, p.frameAchievement];
};

describe('equip', () => {
	it('saves owned achievements in all three slots', () => {
		seedPlayers(2);
		earn('p1', ['first-blood', 'legend-ahri-master']);
		expect(ownedAchievements('p1')).toEqual(new Set(['first-blood', 'legend-ahri-master']));
		expect(
			equip('p1', {
				title: 'legend-ahri-master',
				badge: 'first-blood',
				frame: 'legend-ahri-master'
			})
		).toBeNull();
		expect(slots('p1')).toEqual(['legend-ahri-master', 'first-blood', 'legend-ahri-master']);
		expect(slots('p2')).toEqual([null, null, null]);
	});

	it('refuses an achievement the player does not own, saving nothing', () => {
		seedPlayers(2);
		earn('p1', ['first-blood']);
		earn('p2', ['champion']);
		expect(equip('p1', { title: 'first-blood', badge: 'champion', frame: null })).toBe('badge');
		expect(slots('p1')).toEqual([null, null, null]);
	});

	it('refuses a frame without a tier, and unknown ids', () => {
		seedPlayers(1);
		earn('p1', ['first-blood', 'legend-renamed-player']);
		expect(equip('p1', { title: null, badge: null, frame: 'first-blood' })).toBe('frame');
		expect(equip('p1', { title: 'legend-renamed-player', badge: null, frame: null })).toBe('title');
	});

	it('clears a slot', () => {
		seedPlayers(1);
		earn('p1', ['first-blood']);
		equip('p1', { title: 'first-blood', badge: 'first-blood', frame: null });
		expect(equip('p1', { title: null, badge: 'first-blood', frame: null })).toBeNull();
		expect(slots('p1')).toEqual([null, 'first-blood', null]);
	});
});

type User = NonNullable<App.Locals['user']>;
const as = (id: string): User => ({ id, displayName: id, avatar: null, isOrganizer: false });
const event = (id: string, user: User | null, form: Record<string, string> = {}) => {
	const url = new URL(`http://localhost/players/${id}`);
	const body = new FormData();
	for (const [k, v] of Object.entries(form)) body.set(k, v);
	return {
		params: { id },
		url,
		locals: { user, session: user && { id: 'sess', accessToken: 'tok' } },
		request: new Request(url, { method: 'POST', body })
	} as never;
};
const customize = (id: string, user: User | null, form: Record<string, string>) =>
	careerActions.customize!(event(id, user, form));
const career = async (id: string, user: User | null) =>
	(await careerPage(event(id, user))) as Exclude<Awaited<ReturnType<typeof careerPage>>, void>;
const inSeason = () => {
	seedPlayers(2);
	seedEntries(seedSeason({ status: 'play' }).id, ['p1', 'p2'], 1);
	earn('p1', ['first-blood', 'legend-ahri-master']);
};

describe('career page', () => {
	it('the owner equips, and everyone sees the look', async () => {
		inSeason();
		expect(
			await customize('p1', as('p1'), {
				title: 'legend-ahri-master',
				badge: 'first-blood',
				frame: 'legend-ahri-master'
			})
		).toEqual({ message: 'Profile updated.' });
		const d = await career('p1', null);
		expect(d.cosmetics).toEqual({
			title: { text: 'Ahri Master', tier: 'gold' },
			badge: { name: 'First Blood', icon: '/achievements/items/first-blood.png', tier: null },
			frame: 'gold'
		});
		expect(d.customize).toBeNull();
	});

	it('only the owner gets the Customize form, with their earned choices', async () => {
		inSeason();
		expect((await career('p1', as('p2'))).customize).toBeNull();
		const mine = (await career('p1', as('p1'))).customize!;
		expect(mine.choices.frames.map((o: { id: string }) => o.id)).toEqual(['legend-ahri-master']);
		expect(mine.equipped).toEqual({ title: null, badge: null, frame: null });
		expect(mine.left).toBe(ACHIEVEMENTS.length - 2);
	});

	it("refuses another player's profile and logged-out visitors", async () => {
		inSeason();
		earn('p2', ['first-blood']);
		const r = (await customize('p1', as('p2'), { title: 'first-blood', badge: '', frame: '' })) as {
			status: number;
		};
		expect(r.status).toBe(403);
		expect(slots('p1')).toEqual([null, null, null]);
		try {
			await customize('p1', null, { title: 'first-blood' });
			throw new Error('expected a redirect');
		} catch (e) {
			expect(isRedirect(e) && e.location).toMatch(/^\/auth\/login/);
		}
	});

	it('refuses an unearned achievement with a message, and clears with empty values', async () => {
		inSeason();
		const r = (await customize('p1', as('p1'), { title: 'champion', badge: '', frame: '' })) as {
			status: number;
			data: { message: string };
		};
		expect(r.status).toBe(400);
		expect(r.data.message).toBe('You haven’t earned that title.');
		await customize('p1', as('p1'), { title: 'first-blood', badge: '', frame: '' });
		await customize('p1', as('p1'), { title: '', badge: '', frame: '' });
		expect(slots('p1')).toEqual([null, null, null]);
	});
});

it('the season player page shows the same look', async () => {
	inSeason();
	equip('p1', { title: 'first-blood', badge: null, frame: 'legend-ahri-master' });
	const d = (await seasonPlayerPage({
		params: { slug: 's1', id: 'p1' },
		locals: { user: null, session: null },
		url: new URL('http://localhost/x')
	} as never)) as { cosmetics: unknown };
	expect(d.cosmetics).toEqual({
		title: { text: 'First Blood', tier: null },
		badge: null,
		frame: 'gold'
	});
});
