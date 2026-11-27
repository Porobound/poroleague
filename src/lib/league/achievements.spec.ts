import { describe, expect, it } from 'vitest';
import { LEGENDS } from '#lib/legends.ts';
import { ACHIEVEMENTS, achievementById, champion, key } from '#lib/league/achievements.ts';

describe('definitions', () => {
	it('has unique ids: three tiers per legend and league track, and four one-offs', () => {
		expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
		expect(ACHIEVEMENTS).toHaveLength(LEGENDS.length * 3 + 4 * 3 + 4);
	});

	it('gives every legend a Player/Expert/Master track at 3/10/25', () => {
		for (const l of LEGENDS)
			expect(
				ACHIEVEMENTS.filter((a) => a.legend === l).map((a) => [a.id, a.tier, a.name, a.need])
			).toEqual([
				[`legend-${key(l)}-bronze`, 'bronze', `${l} Player`, 3],
				[`legend-${key(l)}-silver`, 'silver', `${l} Expert`, 10],
				[`legend-${key(l)}-gold`, 'gold', `${l} Master`, 25]
			]);
	});

	it('keys legends for ids and icons', () => {
		expect(["K'Sante", 'Jarvan IV', 'Master Yi (PG)', 'Renata Glasc'].map(key)).toEqual([
			'ksante',
			'jarvan-iv',
			'master-yi-pg',
			'renata-glasc'
		]);
		expect(champion('Master Yi (XP)')).toBe('Master Yi');
		expect(achievementById.get('legend-master-yi-xp-gold')!.icon).toBe(
			'/achievements/champions/master-yi.png'
		);
	});

	it('names the tiers of Seasons and Comeback on their own', () => {
		const rows = (track: string) =>
			ACHIEVEMENTS.filter((a) => a.track === track).map((a) => [a.id, a.name, a.need]);
		expect(rows('seasons')).toEqual([
			['seasons-bronze', 'Veteran', 2],
			['seasons-silver', 'Old Guard', 5],
			['seasons-gold', 'Elder', 10]
		]);
		expect(rows('comeback')).toEqual([
			['comeback-bronze', 'Comeback Kid', 1],
			['comeback-silver', 'Comeback King', 5],
			['comeback-gold', 'Comeback Emperor', 15]
		]);
		expect(achievementById.get('comeback-bronze')!.description).toBe(
			'Win a match after losing game 1.'
		);
		expect(achievementById.get('comeback-gold')!.description).toBe(
			'Win 15 matches after losing game 1.'
		);
	});

	it('lists the league tracks and one-offs', () => {
		const pick = (ids: string[]) =>
			ids.map((id) => {
				const a = achievementById.get(id)!;
				return [a.track, a.tier, a.name, a.need];
			});
		expect(pick(['variety-bronze', 'variety-silver', 'variety-gold'])).toEqual([
			['variety', 'bronze', 'Variety Player', 3],
			['variety', 'silver', 'Variety Expert', 5],
			['variety', 'gold', 'Variety Master', 10]
		]);
		expect(pick(['dice-bronze', 'dice-silver', 'dice-gold']).map((x) => x[3])).toEqual([3, 6, 20]);
		const flat = ACHIEVEMENTS.filter((a) => !a.tier).map((a) => [a.id, a.need]);
		expect(flat).toEqual([
			['first-blood', 1],
			['perfect-group', 1],
			['top-cut', 1],
			['champion', 1]
		]);
		for (const a of ACHIEVEMENTS) expect(a.title).toBe(a.name);
	});
});
