import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const createdAt = () =>
	integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`);

export const players = sqliteTable('players', {
	id: text('id').primaryKey(), // Discord user id
	displayName: text('display_name').notNull(),
	avatar: text('avatar')
});

export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	playerId: text('player_id')
		.notNull()
		.references(() => players.id),
	accessToken: text('access_token').notNull(),
	isOrganizer: integer('is_organizer', { mode: 'boolean' }).notNull(),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
});

export const seasons = sqliteTable('seasons', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	slug: text('slug').notNull().unique(),
	name: text('name').notNull(),
	status: text('status', { enum: ['draft', 'signup', 'groups', 'play', 'finished'] })
		.notNull()
		.default('draft'),
	startDate: text('start_date'), // ISO date
	roundsPerWeek: integer('rounds_per_week').notNull().default(2),
	deadline: text('deadline'), // ISO date
	topCutSize: integer('top_cut_size'),
	createdAt: createdAt(),
	// Soft delete: hidden everywhere, data kept, restorable by clearing these two columns (and the slug suffix).
	deletedAt: integer('deleted_at', { mode: 'timestamp' }),
	deletedBy: text('deleted_by').references(() => players.id)
});

export const entries = sqliteTable(
	'entries',
	{
		seasonId: integer('season_id')
			.notNull()
			.references(() => seasons.id),
		playerId: text('player_id')
			.notNull()
			.references(() => players.id),
		group: integer('group_no'),
		dropped: integer('dropped', { mode: 'boolean' }).notNull().default(false),
		tiebreak: integer('tiebreak'), // organizer-set rank for unresolved ties, lower first
		createdAt: createdAt()
	},
	(t) => [primaryKey({ columns: [t.seasonId, t.playerId] })]
);

export const matches = sqliteTable(
	'matches',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		seasonId: integer('season_id')
			.notNull()
			.references(() => seasons.id),
		stage: text('stage', { enum: ['group', 'playoff'] })
			.notNull()
			.default('group'),
		group: integer('group_no'),
		round: integer('round').notNull(),
		p1Id: text('p1_id')
			.notNull()
			.references(() => players.id),
		p2Id: text('p2_id')
			.notNull()
			.references(() => players.id),
		p1Games: integer('p1_games'),
		p2Games: integer('p2_games'),
		p1Legend: text('p1_legend'),
		p2Legend: text('p2_legend'),
		diceWinnerId: text('dice_winner_id').references(() => players.id),
		reportedBy: text('reported_by').references(() => players.id),
		reportedAt: integer('reported_at', { mode: 'timestamp' }),
		flaggedBy: text('flagged_by').references(() => players.id),
		flagReason: text('flag_reason'),
		flagResolvedBy: text('flag_resolved_by').references(() => players.id),
		flagResolvedAt: integer('flag_resolved_at', { mode: 'timestamp' })
	},
	(t) => [index('matches_season_idx').on(t.seasonId)]
);

export const audit = sqliteTable(
	'audit',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		seasonId: integer('season_id')
			.notNull()
			.references(() => seasons.id),
		matchId: integer('match_id').references(() => matches.id),
		actorId: text('actor_id')
			.notNull()
			.references(() => players.id),
		action: text('action').notNull(), // report | edit | flag | resolve | drop | ...
		before: text('before', { mode: 'json' }),
		after: text('after', { mode: 'json' }),
		createdAt: createdAt()
	},
	(t) => [index('audit_season_idx').on(t.seasonId)]
);
