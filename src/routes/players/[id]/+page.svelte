<script lang="ts">
	import Achievements from '#lib/components/Achievements.svelte';
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
	<section class="profile">
		<div class="profile-head">
			<Avatar name={player.displayName} src={player.avatar} size={96} former={player.former} ring />
			<div class="who">
				<span class="eyebrow">Career</span>
				<h1 class={['profile-name', player.former && 'pb-former']}>{player.displayName}</h1>
				<span class="muted small">{n} season{n === 1 ? '' : 's'} · first season {data.first}</span>
			</div>
		</div>
		{#if totals.played}
			<div class="profile-stats profile-stats-4" role="group" aria-label="Career stats">
				<div class="profile-stat is-lead">
					<span class="eyebrow">Matches</span><strong>{totals.played}</strong>
				</div>
				<div class="profile-stat">
					<span class="eyebrow">W–D–L</span><strong>{totals.wdl}</strong>
				</div>
				<div class="profile-stat">
					<span class="eyebrow">Game-win %</span><strong>{pct(totals.gwp)}</strong>
				</div>
				<div class="profile-stat">
					<span class="eyebrow">Dice rolls won</span><strong
						>{data.dice.won} / {data.dice.of}</strong
					>
				</div>
			</div>
		{/if}
	</section>

	{#if !totals.played}
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

	<Achievements data={data.achievements} all={data.allLegends} />
</div>

<style>
	.who {
		display: flex;
		flex-direction: column;
		gap: 4px;
		/* Lets a long name wrap inside the card instead of widening this column. */
		min-width: 0;
	}
	/* A long name with no spaces breaks instead of running out of the card. */
	.who h1 {
		overflow-wrap: anywhere;
	}
</style>
