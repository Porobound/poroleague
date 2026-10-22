<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import ResultActions from '#lib/components/ResultActions.svelte';
	import { groupName } from '#lib/season.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const FILTERS = [
		['all', 'All'],
		['unplayed', 'Unplayed & overdue'],
		['reported', 'Reported'],
		['flagged', 'Flagged'],
		['void', 'Void']
	] as const;
	const BADGE = {
		scheduled: ['', 'Scheduled'],
		overdue: ['pb-badge-rank', 'Overdue'],
		reported: ['pb-badge-win', 'Reported'],
		flagged: ['pb-badge-rank', 'Flagged'],
		void: ['', 'Void']
	} as const;
	const badge = (r: (typeof data.rows)[number]) =>
		r.status === 'reported' && r.entered
			? (['pb-badge-win', 'Entered by org'] as const)
			: BADGE[r.status];
</script>

<svelte:head>
	<title>Matches · {data.season.name} · Poroleague</title>
</svelte:head>

<div class="page">
	<h1>Matches</h1>
	<p class="muted">
		Enter results for overdue or unplayed matches and settle flags. A match turns Overdue by itself
		once its week has passed; players can still report it. Anything still unplayed at the deadline
		is a double loss unless you enter a result.
	</p>

	{#if form?.message}
		<p class="status" role="status">{form.message}</p>
	{/if}

	<div class="seg" role="group" aria-label="Filter by status">
		{#each FILTERS as [k, label] (k)}
			<a href="?status={k}" aria-current={data.filter === k ? 'true' : undefined}>{label}</a>
		{/each}
	</div>

	{#if data.rows.length}
		<div class="panel standings">
			<table class="pb-table">
				<thead>
					<tr>
						<th class="pb-num">Rd</th>
						<th>Group</th>
						<th>Match</th>
						<th class="pb-num">Score</th>
						<th>Status</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each data.rows as r (r.id)}
						{@const [a, b] = r.card.sides}
						<tr>
							<td class="pb-num">R{r.round}</td>
							<td>{r.group ? groupName(r.group).slice(-1) : ''}</td>
							<td>
								<div class="match">
									<span class="names">
										<span class="pb-player"
											><Avatar name={a.name} src={a.avatar} size={20} /><span class="pb-player-name"
												>{a.name}</span
											></span
										>
										<a class="muted" href="/seasons/{data.season.slug}/matches/{r.id}">vs</a>
										<span class="pb-player"
											><Avatar name={b.name} src={b.avatar} size={20} /><span class="pb-player-name"
												>{b.name}</span
											></span
										>
									</span>
									{#if r.reported}<span class="muted small">{a.legend} · {b.legend}</span>{/if}
									{#if r.flag}<span class="small">“{r.flag.reason}” · {r.flag.by}</span>{/if}
								</div>
							</td>
							<td class="pb-num">{r.reported ? `${a.games}–${b.games}` : '–'}</td>
							<td><span class={['pb-badge', badge(r)[0]]}>{badge(r)[1]}</span></td>
							<td>
								<div class="row-actions">
									{#if data.canEdit && r.status !== 'void'}
										<ResultActions row={r} query="status={data.filter}" />
									{/if}
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<p class="status">No matches here.</p>
	{/if}
</div>

<style>
	.match {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.names {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 8px;
	}
	.row-actions {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
		white-space: nowrap;
	}
</style>
