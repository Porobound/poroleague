<script lang="ts">
	import PlayerName from '#lib/components/PlayerName.svelte';
	import { pct } from '#lib/format.ts';
	import type { GroupStanding } from '#lib/server/seasons.ts';

	let {
		rows,
		cut,
		slug,
		me = null,
		showTies = false
	}: {
		rows: GroupStanding['rows'];
		cut: number;
		slug: string;
		me?: string | null;
		showTies?: boolean;
	} = $props();
	// Nobody has played: rows are still in name order, so show no ranks or cut line yet.
	const fresh = $derived(rows.every((r) => !r.played));
	// Erased players can't advance, so the cut counts only the rows that can, as when it is drawn.
	const eligible = $derived(rows.flatMap((r, i) => (r.former ? [] : [i])));
	// Index of the last row inside the cut; -1 until there are results and the cut leaves someone out.
	const line = $derived(!fresh && cut > 0 && cut < eligible.length ? eligible[cut - 1] : -1);
</script>

<table class="pb-table">
	<thead>
		<tr>
			<th class="pb-num">#</th>
			<th>Player</th>
			<th class="pb-num pb-opt"><abbr title="Wins">W</abbr></th>
			<th class="pb-num pb-opt"><abbr title="Draws">D</abbr></th>
			<th class="pb-num pb-opt"><abbr title="Losses">L</abbr></th>
			<th class="pb-num"><abbr title="Matches played">M</abbr></th>
			<th class="pb-num"><abbr title="Game-win %">GW%</abbr></th>
			<th class="pb-num"><abbr title="Points">Pts</abbr></th>
		</tr>
	</thead>
	<tbody>
		{#each rows as r, i (r.playerId)}
			<tr
				class={[
					r.playerId === me && 'is-me',
					i <= line && !r.former && 'is-in',
					i === line && 'is-cut'
				]}
			>
				<td class={['pb-rank', i === 0 && r.played > 0 && 'is-podium']}
					><span class="pb-rank-chip">{fresh ? '–' : i + 1}</span></td
				>
				<td class="pb-player-cell">
					<PlayerName
						cell
						name={r.name}
						avatar={r.avatar}
						former={r.former}
						badge={r.badge}
						href="/seasons/{slug}/players/{r.playerId}"
					>
						{#if showTies && r.unresolvedTie}<span class="pb-tie" title="Tied: an organizer decides"
								>Tie</span
							>{/if}
					</PlayerName>
				</td>
				<td class={['pb-num pb-opt', !r.wins && 'pb-muted']}>{r.wins}</td>
				<td class={['pb-num pb-opt', !r.draws && 'pb-muted']}>{r.draws}</td>
				<td class={['pb-num pb-opt', !r.losses && 'pb-muted']}>{r.losses}</td>
				<td class="pb-num">{r.played}</td>
				<td class="pb-num">{r.played ? pct(r.gwp) : '—'}</td>
				<td class="pb-num pb-pts" data-cut={i === line ? `Top ${cut} advance` : undefined}
					>{r.points}</td
				>
			</tr>
		{/each}
	</tbody>
</table>
