<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import PlayerLegends from '#lib/components/PlayerLegends.svelte';
	import SeasonHistory from '#lib/components/SeasonHistory.svelte';
	import { pct } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const { player, totals } = $derived(data);
	const n = $derived(data.history.length);
</script>

<svelte:head>
	<title>{player.displayName} · Career · Poroleague</title>
</svelte:head>

<div class="page">
	<section class="player-head">
		<Avatar name={player.displayName} src={player.avatar} size={72} />
		<div class="who">
			<span class="eyebrow">Career</span>
			<h1>{player.displayName}</h1>
			<span class="muted small">{n} season{n === 1 ? '' : 's'} · first season {data.first}</span>
		</div>
	</section>

	{#if totals.played}
		<section class="stats" aria-label="Career stats">
			<div class="panel"><span class="eyebrow">Matches</span><strong>{totals.played}</strong></div>
			<div class="panel"><span class="eyebrow">W–D–L</span><strong>{totals.wdl}</strong></div>
			<div class="panel">
				<span class="eyebrow">Game-win %</span><strong>{pct(totals.gwp)}</strong>
			</div>
			<div class="panel">
				<span class="eyebrow">Dice rolls won</span><strong>{data.dice.won} / {data.dice.of}</strong>
			</div>
		</section>
	{:else}
		<div class="empty">
			<strong>No reported matches yet</strong>
			<span
				>Career stats and legends show up after {player.displayName}'s first reported match.</span
			>
		</div>
	{/if}

	<section>
		<h2>Season by season</h2>
		<SeasonHistory rows={data.history} playerId={player.playerId} />
	</section>

	{#if data.legends.playedAs.length}
		<section>
			<h2>Legends across seasons</h2>
			<PlayerLegends legends={data.legends} />
		</section>
	{/if}
</div>

<style>
	.player-head {
		display: flex;
		flex-wrap: wrap;
		gap: 24px;
		align-items: center;
	}
	.who {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.who h1 {
		margin: 0;
	}
</style>
