<script lang="ts">
	import { pct } from '#lib/format.ts';
	import { gameWinPct, type playerLegends } from '#lib/league/legendStats.ts';

	let { legends }: { legends: ReturnType<typeof playerLegends> } = $props();
</script>

<div class="grid-2">
	{#each [['Played as', 'Legend', legends.playedAs], ['Against', 'Opponent legend', legends.against]] as const as [title, col, rows] (title)}
		<div class="panel">
			<table class="pb-table">
				<caption><h3>{title}</h3></caption>
				<thead>
					<tr>
						<th>{col}</th>
						<th class="pb-num">M</th>
						<th class="pb-num">W–D–L</th>
						<th class="pb-num">GW%</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as r (r.key)}
						<tr>
							<th scope="row">{r.key}</th>
							<td class="pb-num">{r.picks}</td>
							<td class="pb-num">{r.wins}–{r.draws}–{r.losses}</td>
							<td class="pb-num">{pct(gameWinPct(r, 0))}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/each}
</div>

<style>
	caption {
		text-align: left;
	}
	caption h3 {
		margin: 0 0 4px;
	}
</style>
