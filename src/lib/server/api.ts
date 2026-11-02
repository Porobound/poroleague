// Public read-only API (`/api/v1`, documented in openapi.json): fixed shapes over the same data the public pages
// show, so a page redesign can't break a consumer. Avatars and Discord ids never leave here.
import { json } from '@sveltejs/kit';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { ACHIEVEMENTS, achievementById, type Achievement } from '#lib/league/achievements.ts';
import { look, NOTHING, type Equipped } from '#lib/league/cosmetics.ts';
import { roundName } from '#lib/league/bracket.ts';
import { gameWinPct, legendMatches, legendStats, matchWinPct } from '#lib/league/legendStats.ts';
import { published } from '#lib/league/publish.ts';
import { droppedIds, isOverdue, isVoid } from '#lib/league/status.ts';
import { currentWeek, weekOf } from '#lib/league/time.ts';
import { liveState } from '#lib/matchCard.ts';
import { groupName, hasSchedule } from '#lib/season.ts';
import { db } from '#lib/server/db/index.ts';
import { entries, former, playerAchievements, players, seasons } from '#lib/server/db/schema.ts';
import { bracketMatches, publicMatches, seasonMatches, type Match } from '#lib/server/matches.ts';
import {
	allSeasons,
	findSeason,
	groupStandings,
	seasonEntries,
	type Season
} from '#lib/server/seasons.ts';
import { cutState } from '#lib/server/topCut.ts';

export const notFound = (error: string) => json({ error }, { status: 404 });

// A season the public pages show: not a draft, not deleted.
export const apiSeason = (slug: string) => {
	const s = findSeason(slug);
	return s && s.status !== 'draft' ? s : null;
};

// Icons are site paths; the API sends absolute URLs so a bot can embed them.
export const achievementDto = (a: Achievement, origin: string) => ({
	id: a.id,
	name: a.name,
	title: a.title,
	tier: a.tier,
	icon: new URL(a.icon, origin).href
});

// An equipped slot. An id no longer in the list is null, as on the site.
const equipped = (id: string | null, origin: string) => {
	const a = id ? achievementById.get(id) : undefined;
	return a ? achievementDto(a, origin) : null;
};

type Person = { playerId: string; displayName: string; former: boolean } & Equipped;
export const playerRef = (p: Person, origin: string) => ({
	id: p.playerId,
	name: p.displayName,
	former: p.former,
	title: equipped(p.titleAchievement, origin),
	badge: equipped(p.badgeAchievement, origin),
	frame: look(p).frame
});

const summary = (s: Season) => ({
	slug: s.slug,
	name: s.name,
	status: s.status,
	startDate: s.startDate,
	deadline: s.deadline
});

export const seasonList = () =>
	allSeasons()
		.filter((s) => s.status !== 'draft')
		.map(summary);

const people = (seasonId: number, origin: string) => {
	const list = seasonEntries(seasonId);
	const by = new Map(list.map((e) => [e.playerId, e]));
	const ref = (id: string) =>
		playerRef(
			by.get(id) ?? { playerId: id, displayName: 'Unknown', former: false, ...NOTHING },
			origin
		);
	return { list, ref };
};

export function seasonDetail(s: Season, origin: string) {
	const { list, ref } = people(s.id, origin);
	// A draw isn't final until the groups are locked: organizers can still redraw.
	const locked = hasSchedule(s.status);
	return {
		...summary(s),
		roundsPerWeek: s.roundsPerWeek,
		publishedRound: s.publishedRound,
		topCutSize: s.topCutSize,
		topCutDate: s.topCutDate,
		players: list.map((e) => ({
			...playerRef(e, origin),
			group: locked ? e.group : null,
			dropped: e.dropped
		})),
		groups: locked
			? groupStandings(s, list).map((g) => ({
					group: g.group,
					name: groupName(g.group),
					standings: g.rows.map((r, i) => ({
						rank: i + 1,
						player: ref(r.playerId),
						played: r.played,
						wins: r.wins,
						draws: r.draws,
						losses: r.losses,
						points: r.points,
						gameWins: r.gameWins,
						gameLosses: r.gameLosses,
						gameWinPct: r.gwp,
						unresolvedTie: r.unresolvedTie
					}))
				}))
			: []
	};
}

// Group matches of published rounds, then the playoffs once the bracket is out. Flag reasons stay
// private: they're free text, removed on erasure.
export function seasonMatchList(s: Season, origin: string) {
	const { list, ref } = people(s.id, origin);
	const dropped = droppedIds(list);
	const now = new Date();
	const week = currentWeek(s.startDate, now);
	const dto = (m: Match) => {
		const { inPlay, closed } = liveState(m, s, now);
		const voided = isVoid(m, dropped);
		const group = m.stage === 'group';
		return {
			id: m.id,
			stage: m.stage,
			group: m.group,
			round: m.round,
			week: group ? weekOf(m.round, s.roundsPerWeek) : null,
			p1: ref(m.p1Id),
			p2: ref(m.p2Id),
			result:
				m.reportedBy && m.p1Games !== null && m.p2Games !== null
					? {
							p1Games: m.p1Games,
							p2Games: m.p2Games,
							games: m.games ? [...m.games] : null,
							p1Legend: m.p1Legend,
							p2Legend: m.p2Legend,
							diceWinner: m.diceWinnerId,
							reportedAt: m.reportedAt?.toISOString() ?? null
						}
					: null,
			walkover: m.walkoverId,
			void: voided,
			overdue: isOverdue(m, {
				roundsPerWeek: s.roundsPerWeek,
				week,
				inPlay: group && inPlay,
				closed,
				voided
			}),
			flag: m.flaggedBy ? (m.flagResolvedAt ? 'resolved' : 'open') : null
		};
	};
	// Playoff rows only exist once the bracket is published (syncBracket writes them).
	return [...published(seasonMatches(s.id), s.publishedRound), ...bracketMatches(s.id)].map(dto);
}

// null until the bracket is published.
export function topCut(s: Season, origin: string) {
	const cut = cutState(s);
	if (!cut.published) return null;
	const { ref } = people(s.id, origin);
	const maybe = (id: string | null) => (id ? ref(id) : null);
	return {
		champion: maybe(cut.champion),
		rounds: cut.rounds.map((r, i) => ({
			name: roundName(i + 1, cut.rounds.length),
			slots: r.map((x) => ({
				p1: maybe(x.p1),
				p2: maybe(x.p2),
				bye: x.bye,
				winner: x.winner,
				matchId: x.match?.id ?? null
			}))
		}))
	};
}

// Same rows as the legends page: void and unplayed matches left out, mirrors only as picks.
export function legendList(s: Season) {
	const dropped = droppedIds(seasonEntries(s.id));
	return legendStats(legendMatches(publicMatches(s), dropped)).map((t) => ({
		legend: t.key,
		picks: t.picks,
		players: t.players.size,
		mirrors: t.mirrors,
		wins: t.wins,
		draws: t.draws,
		losses: t.losses,
		gameWins: t.gameWins,
		gameLosses: t.gameLosses,
		matchWinPct: matchWinPct(t),
		gameWinPct: gameWinPct(t)
	}));
}

const ORDER = new Map(ACHIEVEMENTS.map((a, i) => [a.id, i]));

// The career page's rule: a player is public once they're in a non-draft season that isn't deleted.
// Earned rows come only from published results, so none reveals a result the site still hides.
// No season field: an award from a season deleted later mustn't leak it.
export function playerDetail(id: string, origin: string) {
	const listed = db
		.select({ id: entries.playerId })
		.from(entries)
		.innerJoin(seasons, eq(entries.seasonId, seasons.id))
		.where(and(eq(entries.playerId, id), isNull(seasons.deletedAt), ne(seasons.status, 'draft')))
		.get();
	if (!listed) return null;
	const p = db
		.select({
			playerId: players.id,
			displayName: players.displayName,
			former: former(),
			titleAchievement: players.titleAchievement,
			badgeAchievement: players.badgeAchievement,
			frameAchievement: players.frameAchievement
		})
		.from(players)
		.where(eq(players.id, id))
		.get()!;
	const achievements = db
		.select()
		.from(playerAchievements)
		.where(eq(playerAchievements.playerId, id))
		.all()
		.flatMap((r) => {
			const a = achievementById.get(r.achievementId);
			return a ? [{ a, at: r.unlockedAt }] : [];
		})
		.sort((x, y) => y.at.getTime() - x.at.getTime() || ORDER.get(x.a.id)! - ORDER.get(y.a.id)!)
		.map(({ a, at }) => ({ ...achievementDto(a, origin), unlockedAt: at.toISOString() }));
	return { ...playerRef(p, origin), achievements };
}
