<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import { pct } from '#lib/format.ts';
	import type { GroupStanding } from '#lib/server/seasons.ts';

	let {
		rows,
		cut,
		slug,
		me = null
	}: { rows: GroupStanding['rows']; cut: number; slug: string; me?: string | null } = $props();
</script>

<table class="pb-table">
	<thead>
		<tr>
			<th class="pb-num">#</th>
			<th>Player</th>
			<th class="pb-num"><abbr title="Matches played">M</abbr></th>
			<th class="pb-num pb-opt"><abbr title="Wins">W</abbr></th>
			<th class="pb-num pb-opt"><abbr title="Draws">D</abbr></th>
			<th class="pb-num pb-opt"><abbr title="Losses">L</abbr></th>
			<th class="pb-num"><abbr title="Game-win %">GW%</abbr></th>
			<th class="pb-num"><abbr title="Points">Pts</abbr></th>
		</tr>
	</thead>
	<tbody>
		{#each rows as r, i (r.playerId)}
			<tr class={[r.playerId === me && 'is-me', i + 1 === cut && i + 1 < rows.length && 'is-cut']}>
				<td class={['pb-rank', i === 0 && r.played > 0 && 'is-podium']}>{i + 1}</td>
				<td class="pb-player-cell">
					<a class="pb-player" href="/seasons/{slug}/players/{r.playerId}">
						<Avatar name={r.name} src={r.avatar} size={24} />
						<span class="pb-player-name">{r.name}</span>
						{#if r.unresolvedTie}<span class="pb-tie" title="Tied: an organizer decides">Tie</span
							>{/if}
					</a>
				</td>
				<td class="pb-num">{r.played}</td>
				<td class="pb-num pb-opt">{r.wins}</td>
				<td class="pb-num pb-opt">{r.draws}</td>
				<td class="pb-num pb-opt">{r.losses}</td>
				<td class="pb-num">{r.played ? pct(r.gwp) : '—'}</td>
				<td class="pb-num pb-pts">{r.points}</td>
			</tr>
		{/each}
	</tbody>
</table>
