<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const season = $derived(data.season);
	const TONE: Record<string, string> = {
		flag: 'pb-badge-rank',
		edit: 'pb-badge-win',
		resolve: 'pb-badge-win',
		drop: 'pb-badge-live',
		undrop: 'pb-badge-win',
		tiebreak: 'pb-badge-win',
		finalize: 'pb-badge-win'
	};
</script>

<svelte:head>
	<title>Audit log · {season.name} · Poroleague</title>
</svelte:head>

<div class="page">
	<span class="eyebrow">{season.name}</span>
	<h1>Audit log</h1>
	<p class="muted">Every report, flag and organizer change this season, newest first.</p>

	{#if data.actions.length > 1}
		<div class="seg" role="group" aria-label="Filter by type">
			<a href="?" aria-current={!data.type ? 'true' : undefined}>All</a>
			{#each data.actions as { a, label } (a)}
				<a href="?type={a}" aria-current={data.type === a ? 'true' : undefined}>{label}</a>
			{/each}
		</div>
	{/if}

	{#if data.lines.length}
		<div class="panel standings">
			<table class="pb-table">
				<thead><tr><th>When</th><th>Who</th><th>Type</th><th>What</th></tr></thead>
				<tbody>
					{#each data.lines as l (l.id)}
						<tr>
							<td class="pb-num nowrap">{l.when}</td>
							<td>{l.actor}</td>
							<td><span class={['pb-badge', TONE[l.action]]}>{l.label}</span></td>
							<td>{l.what}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<p class="empty">Nothing logged yet.</p>
	{/if}
</div>

<style>
	.nowrap {
		white-space: nowrap;
		text-align: left !important;
	}
</style>
