<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import MatchCard from '#lib/components/MatchCard.svelte';
	import PlayerLegends from '#lib/components/PlayerLegends.svelte';
	import SeasonHistory from '#lib/components/SeasonHistory.svelte';
	import { pct } from '#lib/format.ts';
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
			<div class="name-row">
				<h1>{player.displayName}</h1>
				<a href="/players/{player.playerId}">Career</a>
			</div>
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
			<PlayerLegends legends={data.legends} />
		{:else}
			<p class="empty">No reported matches yet.</p>
		{/if}
	</section>

	<section>
		<h2>Other seasons</h2>
		{#if data.history.length > 1}
			<SeasonHistory rows={data.history} playerId={player.playerId} current={season.slug} />
		{:else}
			<p class="muted">First season</p>
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
	.name-row {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 14px;
		margin-bottom: 6px;
	}
	.name-row h1 {
		margin: 0;
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}
</style>
