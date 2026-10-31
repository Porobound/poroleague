# API

Poroleague's public data as JSON, for stat sites, bots and tools. It's the same data the site shows to anyone: seasons, standings, results, the top cut and legend stats.

- **Read-only and anonymous.** `GET` only, no key, no login. Requests are answered the same whether you're logged in or not.
- **Base URL:** `https://league.porobound.com/api/v1`
- **Browser-friendly:** responses allow any origin (`Access-Control-Allow-Origin: *`).
- **Cached for 60 seconds.** A new result can take up to a minute to show.
- **Rate limited:** about 30 requests per 10 seconds per IP. Over that you get `429` for 10 seconds.
- **Stable within v1:** fields may be added; nothing is renamed or removed without a new version (`/api/v2`).

## Conventions

- Dates are `YYYY-MM-DD` in league time (Europe/Helsinki). Timestamps are ISO 8601 in UTC.
- Players appear as `{ "id": "…", "name": "…", "former": false }`. The `id` is the site's own id, stable across seasons and names. `former` is true for a player who asked to be erased; their name is then "Former player" with a short code.
- Errors are `{ "error": "Season not found" }` with the matching status: `404` for an unknown season or path, `405` for anything but `GET`.
- Draft and deleted seasons don't exist as far as the API is concerned.

## Seasons

`GET /seasons`: every season, newest first.

```json
[
	{
		"slug": "season-2",
		"name": "Season 2",
		"status": "play",
		"startDate": "2026-11-02",
		"deadline": "2026-12-20"
	}
]
```

`status` is one of `signup`, `groups` (drawn, not locked), `play`, `topcut`, `finished`.

## One season

`GET /seasons/{slug}`: the season, its players and the standings of each group.

```json
{
	"slug": "season-2",
	"name": "Season 2",
	"status": "play",
	"startDate": "2026-11-02",
	"deadline": "2026-12-20",
	"roundsPerWeek": 2,
	"publishedRound": 4,
	"topCutSize": 2,
	"topCutDate": null,
	"players": [{ "id": "k3x9", "name": "Alice", "former": false, "group": 1, "dropped": false }],
	"groups": [
		{
			"group": 1,
			"name": "Group A",
			"standings": [
				{
					"rank": 1,
					"player": { "id": "k3x9", "name": "Alice", "former": false },
					"played": 4,
					"wins": 3,
					"draws": 1,
					"losses": 0,
					"points": 10,
					"gameWins": 7,
					"gameLosses": 2,
					"gameWinPct": 0.778,
					"unresolvedTie": false
				}
			]
		}
	]
}
```

- `publishedRound`: the last round whose pairings are out. Later rounds aren't in the API yet.
- `topCutSize`: players per group who go through to the top cut; `null` for no top cut.
- `groups` is empty until the groups are locked.
- Standings are ranked as on the site: points, then the league's tiebreakers. `unresolvedTie` marks players still level on everything, until an organizer ranks them.
- A dropped player is in `players` with `dropped: true` and left out of the standings.

## Matches

`GET /seasons/{slug}/matches`: group matches of published rounds, then top-cut matches once the bracket is out.

```json
[
	{
		"id": 41,
		"stage": "group",
		"group": 1,
		"round": 1,
		"week": 1,
		"p1": { "id": "k3x9", "name": "Alice", "former": false },
		"p2": { "id": "m2q7", "name": "Bob", "former": false },
		"result": {
			"p1Games": 2,
			"p2Games": 1,
			"games": ["1", "2", "1"],
			"p1Legend": "Jinx",
			"p2Legend": "Ahri",
			"diceWinner": "k3x9",
			"reportedAt": "2026-11-03T18:22:05.000Z"
		},
		"walkover": null,
		"void": false,
		"overdue": false,
		"flag": null
	}
]
```

- `result` is `null` until reported. `games` is the winner of each game in order (`"1"`, `"2"` or `"D"` for a draw), or `null` for results reported as a score only. `diceWinner` is a player id.
- `stage` is `group` or `playoff`. Playoff matches have `group` and `week` `null`.
- `walkover`: in the top cut, the id of a player who went through without playing.
- `void`: a player dropped, so the match doesn't count.
- `overdue`: unreported and from an earlier week, while reporting is still open. After the season deadline an unplayed match counts as a loss for both.
- `flag`: `"open"` while a player disputes the result, `"resolved"` once an organizer has settled it, else `null`.

## Top cut

`GET /seasons/{slug}/top-cut`: the bracket. `404` (`No top cut yet`) until it's published.

```json
{
	"champion": null,
	"rounds": [
		{
			"name": "Semifinals",
			"slots": [
				{
					"p1": { "id": "k3x9", "name": "Alice", "former": false },
					"p2": { "id": "z8w1", "name": "Dana", "former": false },
					"bye": false,
					"winner": null,
					"matchId": 57
				}
			]
		},
		{
			"name": "Final",
			"slots": [{ "p1": null, "p2": null, "bye": false, "winner": null, "matchId": null }]
		}
	]
}
```

- Rounds run first to last; a slot's `p1`/`p2` is `null` until decided.
- `bye`: one side goes through without a match (first round only).
- `matchId` links to the match in `/matches`.

## Legends

`GET /seasons/{slug}/legends`: one row per legend played this season, most picked first.

```json
[
	{
		"legend": "Jinx",
		"picks": 14,
		"players": 5,
		"mirrors": 2,
		"wins": 8,
		"draws": 1,
		"losses": 3,
		"gameWins": 17,
		"gameLosses": 9,
		"matchWinPct": 0.667,
		"gameWinPct": 0.654
	}
]
```

- Void and unplayed matches are left out, so a deadline double loss doesn't count against a legend.
- A mirror match counts as two picks (and in `mirrors`), never as a win or loss.
- `matchWinPct` and `gameWinPct` are `null` under 5 non-mirror matches.
- `players`: distinct players who picked it this season, so it doesn't add up across seasons.

## Example: legend meta across seasons

```js
const API = 'https://league.porobound.com/api/v1';
const seasons = await (await fetch(`${API}/seasons`)).json();
for (const s of seasons) {
	const legends = await (await fetch(`${API}/seasons/${s.slug}/legends`)).json();
	console.log(`\n${s.name} (${s.status})`);
	for (const l of legends)
		console.log(
			`${l.legend.padEnd(12)} ${String(l.picks).padStart(3)} picks  ${l.wins}-${l.draws}-${l.losses}  ` +
				(l.matchWinPct === null ? '—' : `${Math.round(l.matchWinPct * 100)}%`)
		);
}
```
