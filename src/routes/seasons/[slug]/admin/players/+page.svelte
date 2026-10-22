<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import { groupName } from '#lib/season.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const status = $derived(data.season.status);
	const scheduled = $derived(status === 'play' || status === 'finished');
	const active = $derived(data.entries.filter((e) => !e.dropped).length);
	const intro = $derived(
		{
			draft: 'Signup has not opened yet.',
			signup:
				'Everyone who signed up. You can remove someone while signup is open; 16 or more players makes two groups.',
			groups: 'Signup is closed. Once groups are locked you can drop players.',
			play: 'Dropping a player voids all their matches. They stay in the database but leave the standings.',
			finished: 'The season is finalized.'
		}[status]
	);
</script>

<svelte:head>
	<title>Players · {data.season.name} · Poroleague</title>
</svelte:head>

<div class="page">
	<span class="eyebrow">{scheduled ? `${active} active` : `${data.entries.length} signed up`}</span>
	<h1>Players</h1>
	<p class="muted">{intro}</p>

	{#if form?.message}
		<p class="status" role="status">{form.message}</p>
	{/if}

	{#if scheduled}
		<div class="panel standings">
			<table class="pb-table">
				<thead>
					<tr>
						<th>Player</th>
						<th>Group</th>
						<th class="pb-num">Played</th>
						<th class="pb-num">W–D–L</th>
						<th>Status</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each data.entries as e (e.playerId)}
						<tr class={[e.dropped && 'is-dropped']}>
							<td class="pb-player-cell">
								<span class="pb-player">
									<Avatar name={e.displayName} src={e.avatar} size={24} />
									<span class="pb-player-name">{e.displayName}</span>
								</span>
							</td>
							<td>{e.group ? groupName(e.group) : ''}</td>
							<td class="pb-num">{e.record?.played ?? '—'}</td>
							<td class="pb-num">{e.record?.wdl ?? '—'}</td>
							<td>
								<span class={['pb-badge', e.dropped && 'pb-badge-loss']}
									>{e.dropped ? 'Dropped' : 'Active'}</span
								>
							</td>
							<td>
								{#if status === 'play' && !e.dropped}
									<ConfirmButton
										action="?/drop"
										variant="ghost"
										small
										fields={{ playerId: e.playerId }}
										label="Drop"
										title="Drop {e.displayName}?"
										confirmLabel="Drop player"
									>
										All {e.matches} of their matches are voided, played and unplayed, and they leave the
										standings. Their opponents' results from those matches stop counting. Posted in the
										organizer channel and logged in the public audit log.
									</ConfirmButton>
								{:else if e.canCancel}
									<ConfirmButton
										action="?/cancelDrop"
										variant="secondary"
										small
										fields={{ playerId: e.playerId }}
										label="Cancel drop"
										title="Cancel {e.displayName}'s drop?"
										confirmLabel="Cancel drop"
									>
										For fixing a mistaken drop. Their {e.matches} matches count again, with any results
										reported before the drop, and unplayed ones can be reported. Posted in the organizer
										channel and logged in the public audit log.
									</ConfirmButton>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<ul class="player-list">
			{#each data.entries as e (e.playerId)}
				<li>
					<Avatar name={e.displayName} src={e.avatar} />
					<span class="grow">{e.displayName}</span>
					{#if status === 'signup'}
						<ConfirmButton
							action="?/remove"
							variant="ghost"
							small
							fields={{ playerId: e.playerId }}
							label="Remove"
							title="Remove {e.displayName} from signups?"
							confirmLabel="Remove"
						>
							They can sign up again while signup is open.
						</ConfirmButton>
					{/if}
				</li>
			{:else}
				<li class="muted">Nobody has signed up yet.</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.is-dropped td:not(:last-child) {
		opacity: 0.6;
	}
</style>
