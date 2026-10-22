<script lang="ts">
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import MatchCard from '#lib/components/MatchCard.svelte';
	import PhaseBar from '#lib/components/PhaseBar.svelte';
	import ResultActions from '#lib/components/ResultActions.svelte';
	import { STATUS_LABEL } from '#lib/season.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const season = $derived(data.season);
	const base = $derived(`/seasons/${season.slug}/admin`);
	const NEXT = {
		draft: 'Check the settings, then open signup on the Season page.',
		signup: 'Close signup on the Season page when everyone is in.',
		groups: 'Check the draw on Groups, then lock it.',
		play: '',
		finished: 'The season is finalized and in the archive.'
	};
</script>

<svelte:head>
	<title>{season.name} · Admin · Poroleague</title>
</svelte:head>

<div class="page">
	<div class="head">
		<div>
			<span class="eyebrow"
				>{season.name} · {STATUS_LABEL[season.status]}{season.status === 'play' && data.week >= 1
					? ` · week ${Math.min(data.week, data.weeks)} of ${data.weeks}`
					: ''}</span
			>
			<h1>Season overview</h1>
		</div>
		{#if data.pairings}
			{@const p = data.pairings}
			<ConfirmButton
				action="?/postPairings"
				variant="secondary"
				label="Post week {p.week} pairings in Discord"
				title="Post week {p.week} pairings in Discord?"
				confirmLabel="Post pairings"
			>
				Posts the {p.count} pairings for {p.rounds[0] === p.rounds[1]
					? `round ${p.rounds[0]}`
					: `rounds ${p.rounds[0]}–${p.rounds[1]}`} in the pairings channel, with each player's Discord
				name. Nobody is pinged. It can't be unsent from here.
			</ConfirmButton>
		{/if}
	</div>

	{#if form?.message}
		<p class="pb-notice" role="status">{form.message}</p>
	{/if}

	<PhaseBar phases={data.phases} />

	{#if NEXT[season.status]}
		<p class="muted">
			{NEXT[season.status]}
			{#if season.status === 'groups'}<a href="{base}/groups">Open Groups</a
				>{:else if season.status !== 'finished'}<a href="{base}/season">Open Season</a>{/if}
		</p>
	{/if}

	{#if data.flags.length}
		<section class="flags" aria-labelledby="flags-h">
			<h2 id="flags-h">Flagged results · {data.flags.length}</h2>
			<div class="cards">
				{#each data.flags as r (r.id)}
					<div class="flag">
						<MatchCard {...r.card} flag={r.flag} />
						<div class="actions"><ResultActions row={r} /></div>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<section aria-labelledby="audit-h">
		<div class="section-head">
			<h2 id="audit-h">Recent audit log</h2>
			<a href="/seasons/{season.slug}/audit">Full audit log (public)</a>
		</div>
		{#if data.recent.length}
			<div class="panel standings">
				<table class="pb-table">
					<thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead>
					<tbody>
						{#each data.recent as l (l.id)}
							<tr>
								<td class="when">{l.when}</td>
								<td>{l.actor}</td>
								<td>{l.label}{l.what ? ` · ${l.what}` : ''}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<p class="empty">Nothing logged yet.</p>
		{/if}
	</section>
</div>

<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
		justify-content: space-between;
		align-items: flex-end;
	}
	.head h1 {
		margin: 0;
	}
	.flags {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.flags h2 {
		margin: 0;
	}
	.flag {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.section-head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px 16px;
		margin-bottom: 12px;
	}
	.section-head h2 {
		margin: 0;
	}
	.when {
		font-family: var(--font-mono);
		color: var(--ink-muted);
		white-space: nowrap;
	}
</style>
