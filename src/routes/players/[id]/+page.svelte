<script lang="ts">
	import Achievements from '#lib/components/Achievements.svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import Customize from '#lib/components/Customize.svelte';
	import Flair from '#lib/components/Flair.svelte';
	import PlayerLegends from '#lib/components/PlayerLegends.svelte';
	import SeasonHistory from '#lib/components/SeasonHistory.svelte';
	import { pct } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const { player, totals } = $derived(data);
	const n = $derived(data.history.length);
</script>

<svelte:head>
	<title>{player.displayName} · Career · Poroleague</title>
</svelte:head>

<div class="page">
	{#if form?.message}<p class="pb-notice" role="status">{form.message}</p>{/if}

	<section class="player-head" aria-labelledby="player-h">
		<Avatar
			name={player.displayName}
			src={player.avatar}
			size={72}
			former={player.former}
			frame={data.cosmetics.frame}
		/>
		<div class="who">
			<span class="eyebrow">Career</span>
			<div class="name-row">
				<h1 id="player-h" class={[player.former && 'pb-former']}>{player.displayName}</h1>
				{#if data.cosmetics.badge}<Flair badge={data.cosmetics.badge} />{/if}
			</div>
			<p class="muted small">
				{#if data.cosmetics.title}<span class="cos-title">{data.cosmetics.title}</span
					>{' · '}{/if}{n}
				season{n === 1 ? '' : 's'} · first season {data.first}
			</p>
		</div>
		{#if data.customize}
			<Customize
				name={player.displayName}
				avatar={player.avatar}
				{...data.customize}
				error={form?.customizeError}
			/>
		{/if}
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

	<Achievements data={data.achievements} all={data.allLegends} />
</div>

<style>
	.player-head {
		display: flex;
		flex-wrap: wrap;
		gap: 16px 24px;
		align-items: center;
	}
	.who {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1 1 180px;
		min-width: 0;
	}
	.who h1,
	.who p {
		margin: 0;
	}
	.name-row {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}
	.name-row h1 {
		min-width: 0;
		overflow-wrap: anywhere;
	}
</style>
