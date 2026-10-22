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
	/* Phones: each season is a two-line row, season and group left, place and record right. */
	@media (max-width: 640px) {
		table,
		tbody {
			display: block;
		}
		thead {
			display: none;
		}
		tbody tr {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto auto;
			gap: 2px 6px;
			padding: 12px 0;
			border-bottom: 1px solid var(--line);
			background: none;
		}
		tbody tr:last-child {
			border-bottom: 0;
		}
		tbody tr > * {
			display: block;
			padding: 0;
			border: 0;
			background: none;
		}
		th[scope='row'] {
			grid-area: 1 / 1;
		}
		td:nth-child(2) {
			grid-area: 2 / 1;
			font-size: 13px;
			color: var(--ink-muted);
		}
		td:nth-child(3) {
			grid-area: 1 / 2 / 2 / 4;
			text-align: right;
		}
		td:nth-child(4),
		td:nth-child(5) {
			grid-row: 2;
			font-size: 13px;
			color: var(--ink-muted);
		}
		td:nth-child(5)::before {
			content: '· ';
		}
	}
</style>
