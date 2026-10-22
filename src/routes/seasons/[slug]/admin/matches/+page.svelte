<script lang="ts">
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import ResultFields from '#lib/components/ResultFields.svelte';
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
						<tr>
							<td class="pb-num">R{r.round}</td>
							<td>{r.group ? groupName(r.group) : ''}</td>
							<td
								><div class="match">
									<a href="/seasons/{data.season.slug}/matches/{r.id}">{r.p1.name} vs {r.p2.name}</a
									>
									{#if r.legends}<span class="muted small">{r.legends}</span>{/if}
									{#if r.flag}<span class="small">“{r.flag.reason}” · {r.flag.by}</span>{/if}
								</div></td
							>
							<td class="pb-num">{r.score}</td>
							<td><span class={['pb-badge', BADGE[r.status][0]]}>{BADGE[r.status][1]}</span></td>
							<td
								><div class="row-actions">
									{#if data.canEdit && r.status !== 'void'}
										<ConfirmButton
											action="?/edit"
											small
											variant={r.flag ? 'primary' : 'secondary'}
											fields={{ matchId: String(r.id) }}
											label={r.reported ? 'Edit result' : 'Enter result'}
											title={r.flag
												? 'Change this result?'
												: r.reported
													? 'Edit this result?'
													: 'Enter result as organizer?'}
											confirmLabel="Save result"
										>
											<p>
												{r.p1.name} vs {r.p2.name}, round {r.round}.
												{r.flag
													? "The new result replaces the reported one and resolves the flag; it can't be flagged again. Posted in the organizer channel"
													: r.reported
														? 'The new result replaces the reported one. Posted in the organizer channel'
														: 'Use this when the match was played but never reported. Posted in the results channel'}
												and logged in the public audit log.
											</p>
											<ResultFields p1={r.p1} p2={r.p2} values={r.values} />
										</ConfirmButton>
										{#if r.flag}
											<ConfirmButton
												action="?/keep"
												small
												variant="ghost"
												fields={{ matchId: String(r.id) }}
												label="Keep as reported"
												title="Keep the result as reported?"
												confirmLabel="Keep result"
											>
												The flag is resolved and the reported score stands. It can't be flagged
												again. Posted in the organizer channel and logged in the public audit log.
											</ConfirmButton>
										{/if}
									{/if}
								</div></td
							>
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
	.row-actions {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
		white-space: nowrap;
	}
</style>
