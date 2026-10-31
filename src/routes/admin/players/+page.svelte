<script lang="ts">
	import PlayerName from '#lib/components/PlayerName.svelte';
	import { pct } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Players · Admin · Poroleague</title>
</svelte:head>

<div class="page">
	<span class="eyebrow">Organizer</span>
	<h1>Players</h1>
	<p class="muted">
		Every season so far, ranked by Elo rating: everyone starts at 1500, and every reported match
		counts, walkovers aside.
	</p>

	{#if data.players.length}
		<div class="panel standings">
			<table class="pb-table">
				<thead>
					<tr>
						<th class="pb-num">#</th>
						<th>Player</th>
						<th class="pb-num">Rating</th>
						<th class="pb-num pb-opt"><abbr title="Matches played">M</abbr></th>
						<th class="pb-num"><abbr title="Wins–Draws–Losses">W–D–L</abbr></th>
						<th class="pb-num pb-opt"><abbr title="Game-win %">GW%</abbr></th>
						<th class="pb-num pb-opt">Seasons</th>
						<th>Best finish</th>
					</tr>
				</thead>
				<tbody>
					{#each data.players as p, i (p.playerId)}
						<tr>
							<td class="pb-rank">{p.rating === null ? '—' : i + 1}</td>
							<td class="pb-player-cell">
								<PlayerName
									cell
									name={p.displayName}
									avatar={p.avatar}
									former={p.former}
									href="/players/{p.playerId}"
								/>
							</td>
							<td class="pb-num pb-pts">{p.rating === null ? '—' : Math.round(p.rating)}</td>
							<td class="pb-num pb-opt">{p.played}</td>
							<td class="pb-num nowrap">{p.wins}–{p.draws}–{p.losses}</td>
							<td class="pb-num pb-opt">{pct(p.gwp)}</td>
							<td class="pb-num pb-opt">{p.seasons}</td>
							<td class="nowrap">{p.best ?? '—'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<p class="muted">No one has played a season yet.</p>
	{/if}
</div>
