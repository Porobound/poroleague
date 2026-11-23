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

	<section class="profile" aria-labelledby="player-h">
		<div class="profile-head">
			<Avatar
				name={player.displayName}
				src={player.avatar}
				size={96}
				former={player.former}
				ring
				frame={data.cosmetics.frame}
			/>
			<div class="who">
				<span class="eyebrow">Career</span>
				<div class="name-row">
					<h1 id="player-h" class={['profile-name', player.former && 'pb-former']}>
						{player.displayName}
					</h1>
					{#if data.cosmetics.badge}<Flair badge={data.cosmetics.badge} />{/if}
				</div>
				<span class="muted small">
					{#if data.cosmetics.title}<span class="cos"
							><span class="cos-title">{data.cosmetics.title}</span>{' · '}</span
						>{/if}{n}
					season{n === 1 ? '' : 's'} · first season {data.first}
				</span>
			</div>
			{#if data.customize}
				<Customize
					name={player.displayName}
					avatar={player.avatar}
					{...data.customize}
					error={form?.customizeError}
				/>
			{/if}
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

	<!-- A viewer's own choice, kept in a cookie: it needs no account and no JavaScript. -->
	<form method="POST" action="?/cosmetics" class="muted small cos-pref">
		{#if data.plain}
			<span>Titles, badges and avatar frames are hidden for you on every page.</span>
			<button class="pb-btn pb-btn-ghost pb-btn-sm">Show them again</button>
		{:else}
			<span>Rather see plain names?</span>
			<button class="pb-btn pb-btn-ghost pb-btn-sm">Hide titles, badges and frames</button>
		{/if}
	</form>
</div>

<style>
	.cos-pref {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 12px;
	}
	.who {
		display: flex;
		flex-direction: column;
		gap: 4px;
		flex: 1 1 180px;
		/* Lets a long name wrap inside the card instead of widening this column. */
		min-width: 0;
	}
	.name-row {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}
	/* A long name with no spaces breaks instead of running out of the card. */
	.who h1 {
		min-width: 0;
		overflow-wrap: anywhere;
	}
</style>
