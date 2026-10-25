<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import MatchCard from '#lib/components/MatchCard.svelte';
	import PlayerLegends from '#lib/components/PlayerLegends.svelte';
	import SeasonHistory from '#lib/components/SeasonHistory.svelte';
	import { pct } from '#lib/format.ts';
	import { groupName } from '#lib/season.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let typed = $state('');
	const { season, player, row } = $derived(data);
	const isMe = $derived(data.user?.id === player.playerId);
</script>

<svelte:head>
	<title>{player.displayName} · {season.name} · Poroleague</title>
</svelte:head>

<div class="page">
	{#if form?.message}
		<p class="pb-notice" role="status">{form.message}</p>
	{/if}

	<section class="player-head">
		<Avatar name={player.displayName} src={player.avatar} size={72} former={player.former} />
		<div class="head-text">
			<div class="name-row">
				<h1 class={[player.former && 'pb-former']}>{player.displayName}</h1>
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
				{#if player.former}<span class="muted small">· Account erased.</span>{/if}
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

	{#if data.canErase}
		<section class="erase" aria-labelledby="erase-h">
			<div class="erase-h">
				<h2 id="erase-h">Erase player</h2>
				<span class="pb-badge pb-badge-rank">Organizers only</span>
			</div>
			<div class="danger">
				<p class="muted">
					Removes their name, avatar, Discord link and logins for good. Their results in finished
					seasons stay, shown as “Former player”; a season still running loses them.
				</p>
				<ConfirmButton
					action="?/erase"
					variant="danger"
					confirmVariant="danger"
					label="Erase player…"
					title="Erase {player.displayName}?"
					confirmLabel="Erase player"
					confirmDisabled={typed.trim() !== player.displayName}
				>
					<div class="list">
						<strong>Removed</strong>
						<ul>
							<li>Name and avatar</li>
							<li>Discord link and logins</li>
							<li>Their flag reasons</li>
							<li>Their place in seasons still in signup or groups</li>
						</ul>
					</div>
					<div class="list">
						<strong>Dropped</strong>
						<ul>
							<li>From seasons in play: their matches there are void</li>
						</ul>
					</div>
					<div class="list">
						<strong>Kept</strong>
						<ul>
							<li>Their results in finished seasons, shown as “Former player”</li>
						</ul>
					</div>
					<p class="final">This can't be undone.</p>
					<label class="pb-field">
						Type {player.displayName} to confirm
						<input class="pb-input" name="confirm" autocomplete="off" bind:value={typed} />
					</label>
				</ConfirmButton>
			</div>
		</section>
	{/if}
</div>

<style>
	.erase {
		margin-top: 24px;
		padding-top: 32px;
		border-top: 1px solid var(--line);
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.erase-h {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.erase-h h2 {
		margin: 0;
	}
	.danger {
		border: 1px solid color-mix(in srgb, var(--brand) 55%, var(--line));
		border-radius: var(--radius-md);
		padding: 20px 24px;
		display: flex;
		flex-wrap: wrap;
		gap: 12px 24px;
		align-items: center;
		justify-content: space-between;
	}
	.danger p {
		margin: 0;
		max-width: 640px;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.list strong,
	.final {
		color: var(--ink);
	}
	.list ul {
		margin: 0;
		padding-left: 18px;
	}
	.final {
		margin: 0;
		font-weight: 600;
	}
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
	.head-text {
		flex: 1 1 200px;
		min-width: 0;
	}
	@media (max-width: 640px) {
		.player-head {
			gap: 14px;
		}
	}
</style>
