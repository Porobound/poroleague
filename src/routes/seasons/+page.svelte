<script lang="ts">
	import { date } from '#lib/format.ts';
	import { STATUS_LABEL } from '#lib/season.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Season archive · Poroleague</title>
</svelte:head>

<div class="page">
	<h1>Season archive</h1>
	{#if data.seasons.length}
		<ul class="archive">
			{#each data.seasons as s (s.id)}
				<li class="panel">
					<div class="grow">
						<h2><a href="/seasons/{s.slug}">{s.name}</a></h2>
						<span class="muted small">
							{date(s.startDate)} – {date(s.deadline)} · {s.players} players{s.groups
								? ` · ${s.groups} group${s.groups > 1 ? 's' : ''}`
								: ''}
						</span>
					</div>
					{#if s.champion}
						<div>
							<span class="eyebrow">Champion</span>
							<strong class="winner">{s.champion}</strong>
						</div>
					{:else if s.winners.length}
						<div>
							<span class="eyebrow">Group winner{s.winners.length > 1 ? 's' : ''}</span>
							<strong class="winner">{s.winners.join(' · ')}</strong>
						</div>
					{/if}
					<span class={['pb-badge', s.status !== 'finished' && 'pb-badge-live']}
						>{STATUS_LABEL[s.status]}</span
					>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty">No seasons yet. The first one shows up here once signup opens.</p>
	{/if}
</div>

<style>
	.archive {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.archive li {
		display: flex;
		flex-wrap: wrap;
		gap: 16px 32px;
		align-items: center;
	}
	.archive h2 {
		margin: 0 0 4px;
	}
	.archive h2 a {
		color: var(--ink);
		text-decoration: none;
	}
	.archive .grow {
		flex: 1 1 260px;
	}
	.archive .eyebrow {
		display: block;
	}
	.winner {
		color: var(--signal);
	}
</style>
