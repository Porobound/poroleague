// Public read-only API (`/api/v1`, docs/api.md): fixed shapes over the same data the public pages
// show, so a page redesign can't break a consumer. Avatars and Discord ids never leave here.
import { json } from '@sveltejs/kit';
import { roundName } from '#lib/league/bracket.ts';
import { gameWinPct, legendMatches, legendStats, matchWinPct } from '#lib/league/legendStats.ts';
import { published } from '#lib/league/publish.ts';
import { droppedIds, isOverdue, isVoid } from '#lib/league/status.ts';
import { currentWeek, weekOf } from '#lib/league/time.ts';
import { liveState } from '#lib/matchCard.ts';
import { groupName, hasSchedule } from '#lib/season.ts';
import { bracketMatches, seasonMatches, type Match } from '#lib/server/matches.ts';
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

export const playerRef = (p: { playerId: string; displayName: string; former: boolean }) => ({
	id: p.playerId,
	name: p.displayName,
	former: p.former
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

export function seasonDetail(s: Season) {
	const list = seasonEntries(s.id);
	// A draw isn't final until the groups are locked: organizers can still redraw.
	const locked = hasSchedule(s.status);
	return {
		...summary(s),
		roundsPerWeek: s.roundsPerWeek,
		publishedRound: s.publishedRound,
		topCutSize: s.topCutSize,
		topCutDate: s.topCutDate,
		players: list.map((e) => ({
			...playerRef(e),
			group: locked ? e.group : null,
			dropped: e.dropped
		})),
		groups: locked
			? groupStandings(s, list).map((g) => ({
					group: g.group,
					name: groupName(g.group),
					standings: g.rows.map((r, i) => ({
						rank: i + 1,
						player: playerRef({ playerId: r.playerId, displayName: r.name, former: r.former }),
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

const people = (seasonId: number) => {
	const list = seasonEntries(seasonId);
	const by = new Map(list.map((e) => [e.playerId, e]));
	const ref = (id: string) => {
		const e = by.get(id);
		return e ? playerRef(e) : { id, name: 'Unknown', former: false };
	};
	return { list, ref };
};

// Group matches of published rounds, then the playoffs once the bracket is out. Flag reasons stay
// private: they're free text, removed on erasure.
export function seasonMatchList(s: Season) {
	const { list, ref } = people(s.id);
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
	const playoffs = cutState(s).published ? bracketMatches(s.id) : [];
	return [...published(seasonMatches(s.id), s.publishedRound), ...playoffs].map(dto);
}

// null until the bracket is published.
export function topCut(s: Season) {
	const cut = cutState(s);
	if (!cut.published) return null;
	const { ref } = people(s.id);
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
	return legendStats(legendMatches(seasonMatches(s.id), dropped)).map((t) => ({
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
