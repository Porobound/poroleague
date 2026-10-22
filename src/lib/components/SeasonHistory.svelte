<script lang="ts">
	import { groupName } from '#lib/season.ts';
	import type { seasonHistory } from '#lib/server/seasons.ts';

	let {
		rows,
		playerId,
		current = null
	}: {
		rows: ReturnType<typeof seasonHistory>;
		playerId: string;
		current?: string | null;
	} = $props();
</script>

<div class="panel standings">
	<table class="pb-table">
		<thead>
			<tr>
				<th>Season</th>
				<th>Group</th>
				<th class="pb-num">Rank</th>
				<th class="pb-num">Points</th>
				<th class="pb-num"><abbr title="Wins–Draws–Losses">W–D–L</abbr></th>
			</tr>
		</thead>
		<tbody>
			{#each rows as s (s.slug)}
				<tr>
					<th scope="row">
						{#if s.slug === current}
							<strong>{s.name}</strong> <span class="muted small">Viewing</span>
						{:else}
							<a href="/seasons/{s.slug}/players/{playerId}">{s.name}</a>
						{/if}
					</th>
					<td>{s.group ? groupName(s.group) : '—'}</td>
					<td class={['pb-num', s.dropped && 'loss']}>{s.dropped ? 'Dropped' : s.place}</td>
					<td class="pb-num">{s.points}</td>
					<td class="pb-num">{s.record}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	th[scope='row'] {
		text-align: left;
		font-weight: 500;
	}
	.loss {
		color: var(--brand);
	}
</style>
