<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import MatchCard from '#lib/components/MatchCard.svelte';
	import { pct } from '#lib/format.ts';
	import { gameWinPct } from '#lib/league/legendStats.ts';
	import { groupName } from '#lib/season.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const { season, player, row } = $derived(data);
	const isMe = $derived(data.user?.id === player.playerId);
</script>

<svelte:head>
	<title>{player.displayName} · {season.name} · Poroleague</title>
</svelte:head>

<div class="page">
	<section class="player-head">
		<Avatar name={player.displayName} src={player.avatar} size={72} />
		<div>
			<h1>{player.displayName}</h1>
			<div class="badges">
				{#if player.group}<span class="pb-badge">{groupName(player.group)}</span>{/if}
				{#if player.dropped}
					<span class="pb-badge pb-badge-loss">Dropped</span>
				{:else if row}
					<span class="pb-badge pb-badge-rank">#{data.rank} in group</span>
				{/if}
				<span class="muted small">{season.name}</span>
			</div>
		</div>
	</section>

	{#if row}
		<section class="stats" aria-label="Season stats">
			<div class="panel"><span class="eyebrow">Points</span><strong>{row.points}</strong></div>
			<div class="panel">
				<span class="eyebrow">W–D–L</span><strong>{row.wins}–{row.draws}–{row.losses}</strong>
			</div>
			<div class="panel">
				<span class="eyebrow">Game-win %</span><strong>{row.played ? pct(row.gwp) : '—'}</strong>
			</div>
			<div class="panel">
				<span class="eyebrow">Dice rolls won</span><strong>{data.dice.won} / {data.dice.of}</strong>
			</div>
		</section>
	{/if}

	{#if data.thisWeek.length}
		<section>
			<h2>{isMe ? 'Who you play this week' : 'This week'}</h2>
			<div class="cards">
				{#each data.thisWeek as c (c.id)}<MatchCard {...c.props} />{/each}
			</div>
		</section>
	{/if}

	<section>
		<h2>Matches this season</h2>
		{#if data.matches.length}
			<div class="cards">
				{#each data.matches as c (c.id)}<MatchCard {...c.props} />{/each}
			</div>
		{:else}
			<p class="muted">The schedule appears once the groups are locked.</p>
		{/if}
	</section>

	<section>
		<h2>
			Legends <a class="small" href="/seasons/{season.slug}/legends">All legends this season</a>
		</h2>
		{#if data.legends.playedAs.length}
			<div class="grid-2">
				{#each [['Played as', 'Legend', data.legends.playedAs], ['Against', 'Opponent legend', data.legends.against]] as const as [title, col, rows] (title)}
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
		{:else}
			<p class="status">No reported matches yet.</p>
		{/if}
	</section>
</div>

<style>
	.player-head {
		display: flex;
		flex-wrap: wrap;
		gap: 24px;
		align-items: center;
	}
	.player-head h1 {
		margin: 0 0 6px;
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}
	caption {
		text-align: left;
	}
	caption h3 {
		margin: 0 0 4px;
	}
</style>
