<script lang="ts">
	import PlayerName from '#lib/components/PlayerName.svelte';
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import { groupName } from '#lib/season.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const status = $derived(data.season.status);
	const scheduled = $derived(status !== 'draft' && status !== 'signup' && status !== 'groups');
	const active = $derived(data.entries.filter((e) => !e.dropped).length);
	const intro = $derived(
		{
			draft: 'Signup has not opened yet.',
			signup: 'You can remove players while signup is open.',
			groups: 'Signup is closed. Once groups are locked you can drop players.',
			play: 'Dropping a player voids all their matches.',
			topcut:
				'The top cut is running. A player who withdraws gets a walkover against them on Top cut.',
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
		<p class="pb-notice" role="status">{form.message}</p>
	{/if}

	{#if scheduled}
		<div class="panel standings">
			<table class="pb-table">
				<thead>
					<tr>
						<th>Player</th>
						<th>Group</th>
						<th class="pb-num pb-opt">Played</th>
						<th class="pb-num">W–D–L</th>
						<th>Status</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each data.entries as e (e.playerId)}
						<tr class={[e.dropped && 'is-dropped']}>
							<td class="pb-player-cell">
								<PlayerName
									name={e.displayName}
									avatar={e.avatar}
									former={e.former}
									href="/seasons/{data.season.slug}/players/{e.playerId}"
								/>
							</td>
							<td class="nowrap">{e.group ? groupName(e.group) : ''}</td>
							<td class="pb-num pb-opt">{e.record?.played ?? '—'}</td>
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
										All their matches are voided and they leave the standings.
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
										Their {e.matches} matches count again, with any results reported before the drop.
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
					<span class="grow"
						><PlayerName
							name={e.displayName}
							avatar={e.avatar}
							former={e.former}
							size={32}
							href="/seasons/{data.season.slug}/players/{e.playerId}"
						/></span
					>
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
	.nowrap {
		white-space: nowrap;
	}
	.is-dropped td:not(:last-child) {
		opacity: 0.6;
	}
</style>
