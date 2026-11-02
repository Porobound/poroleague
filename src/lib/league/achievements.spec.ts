import { describe, expect, it } from 'vitest';
import { LEGENDS } from '#lib/legends.ts';
import { ACHIEVEMENTS, achievementById, champion, key } from '#lib/league/achievements.ts';

describe('definitions', () => {
	it('has unique ids: three tiers per legend, Variety, Dice and seven one-offs', () => {
		expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
		expect(ACHIEVEMENTS).toHaveLength(LEGENDS.length * 3 + 6 + 7);
	});

	it('gives every legend a Player/Expert/Master track at 3/10/25', () => {
		for (const l of LEGENDS)
			expect(
				ACHIEVEMENTS.filter((a) => a.legend === l).map((a) => [a.id, a.tier, a.name, a.need])
			).toEqual([
				[`legend-${key(l)}-player`, 'bronze', `${l} Player`, 3],
				[`legend-${key(l)}-expert`, 'silver', `${l} Expert`, 10],
				[`legend-${key(l)}-master`, 'gold', `${l} Master`, 25]
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
		expect(achievementById.get('legend-master-yi-xp-gold')).toBeUndefined();
		expect(achievementById.get('legend-master-yi-xp-master')!.icon).toBe(
			'/achievements/champions/master-yi.png'
		);
	});

	it('lists the league tracks and one-offs', () => {
		const pick = (ids: string[]) =>
			ids.map((id) => {
				const a = achievementById.get(id)!;
				return [a.track, a.tier, a.name, a.need];
			});
		expect(pick(['variety-player', 'variety-expert', 'variety-master'])).toEqual([
			['variety', 'bronze', 'Variety Player', 3],
			['variety', 'silver', 'Variety Expert', 5],
			['variety', 'gold', 'Variety Master', 10]
		]);
		expect(pick(['dice-player', 'dice-expert', 'dice-master']).map((x) => x[3])).toEqual([
			3, 6, 20
		]);
		const flat = ACHIEVEMENTS.filter((a) => !a.tier).map((a) => [a.id, a.need]);
		expect(flat).toEqual([
			['first-blood', 1],
			['veteran-3', 3],
			['veteran-10', 10],
			['perfect-group', 1],
			['comeback', 1],
			['top-cut', 1],
			['champion', 1]
		]);
		for (const a of ACHIEVEMENTS) expect(a.title).toBe(a.name);
	});
});
