import { describe, expect, it } from 'vitest';
import { db } from '#lib/server/db/index.ts';
import { players } from '#lib/server/db/schema.ts';
import { discordMentions } from '#lib/server/players.ts';

describe('discordMentions', () => {
	it('mentions linked players by Discord id, others by escaped name', () => {
		db.insert(players)
			.values([
				{ id: 'a', discordId: '111', displayName: 'Aki' },
				{ id: 'b', displayName: 'Former_player 1' }
			])
			.run();
		const mention = discordMentions(['a', 'b']);
		expect([mention('a'), mention('b'), mention('zz')]).toEqual([
			'<@111>',
			'Former\\_player 1',
			'Unknown'
		]);
	});
});
