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
	<section class="profile">
		<div class="player-head">
			<span class="ring">
				<Avatar name={player.displayName} src={player.avatar} size={96} former={player.former} />
			</span>
			<div class="who">
				<span class="eyebrow">Career</span>
				<h1 class={[player.former && 'pb-former']}>{player.displayName}</h1>
				<span class="muted small">{n} season{n === 1 ? '' : 's'} · first season {data.first}</span>
			</div>
		</div>
		{#if totals.played}
			<div class="stats" role="group" aria-label="Career stats">
				<div class="stat is-lead">
					<span class="eyebrow">Matches</span><strong>{totals.played}</strong>
				</div>
				<div class="stat"><span class="eyebrow">W–D–L</span><strong>{totals.wdl}</strong></div>
				<div class="stat">
					<span class="eyebrow">Game-win %</span><strong>{pct(totals.gwp)}</strong>
				</div>
				<div class="stat">
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
</div>

<style>
	.profile {
		overflow: hidden;
		display: flex;
		flex-direction: column;
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		background:
			radial-gradient(
				560px 240px at 0% 0%,
				color-mix(in srgb, var(--brand) 14%, transparent),
				transparent 70%
			),
			radial-gradient(
				480px 220px at 100% 0%,
				color-mix(in srgb, var(--accent) 9%, transparent),
				transparent 70%
			),
			linear-gradient(180deg, var(--panel-top), var(--panel-bottom));
		box-shadow: var(--shadow-panel);
	}
	.player-head {
		display: flex;
		flex-wrap: wrap;
		gap: 20px 28px;
		align-items: center;
		padding: 28px;
	}
	.ring {
		display: inline-grid;
		padding: 3px;
		border-radius: var(--radius-pill);
		background: conic-gradient(
			from 210deg,
			var(--brand),
			var(--signal),
			var(--accent),
			var(--brand)
		);
		box-shadow: 0 12px 28px -14px color-mix(in srgb, var(--brand) 80%, transparent);
	}
	.ring :global(.pb-avatar) {
		border: 4px solid var(--surface-raised);
		box-sizing: content-box;
		font-size: 30px;
		font-family: var(--font-display);
	}
	.who h1 {
		font-size: clamp(36px, 5vw, 56px);
		line-height: 1;
		letter-spacing: -0.035em;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0;
		border-top: 1px solid var(--line);
	}
	.stat {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 16px 20px;
		min-width: 0;
	}
	.stat + .stat {
		border-left: 1px solid var(--line);
	}
	.stat strong {
		font: 600 26px/30px var(--font-display);
		letter-spacing: -0.02em;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.stat.is-lead strong {
		color: var(--signal);
	}
	@media (max-width: 640px) {
		.player-head {
			gap: 14px;
			padding: 20px 16px;
		}
		.ring :global(.pb-avatar) {
			width: 64px !important;
			height: 64px !important;
			font-size: 22px;
		}
		.stats {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.stat {
			padding: 12px 14px;
		}
		.stat:nth-child(3) {
			border-left: 0;
		}
		.stat:nth-child(n + 3) {
			border-top: 1px solid var(--line);
		}
		.stat strong {
			font-size: 20px;
			line-height: 26px;
		}
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
