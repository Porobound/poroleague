<script lang="ts">
	import SeasonForm from '#lib/components/SeasonForm.svelte';
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import { date } from '#lib/format.ts';
	import { editableFields, groupName, seasonFields, STATUS_LABEL } from '#lib/season.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const season = $derived(data.season);
	const hasResults = $derived(season.status === 'play' || season.status === 'finished');
	const matchesUrl = $derived(`/seasons/${season.slug}/admin/matches`);
	const swap = (players: { playerId: string }[], i: number, j: number) => {
		const ids = players.map((p) => p.playerId);
		[ids[i], ids[j]] = [ids[j], ids[i]];
		return ids.join(',');
	};
</script>

<svelte:head>
	<title>{season.name} · Admin · Poroleague</title>
</svelte:head>

<div class="page">
	<span class="eyebrow"
		>{STATUS_LABEL[season.status]}{season.status === 'draft'
			? ' · only organizers can see it'
			: ''}</span
	>
	<h1>{season.name}</h1>

	{#if form && 'message' in form && form.message}
		<p class="status" role="status">{form.message}</p>
	{:else if form && 'saved' in form}
		<p class="status" role="status">Saved.</p>
	{/if}

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
				: `rounds ${p.rounds[0]}–${p.rounds[1]}`} in the pairings channel and pings every player in them.
			It can't be unsent from here.
		</ConfirmButton>
	{/if}

	{#if data.end}
		{@const e = data.end}
		{#if e.openFlags && !e.ending}
			<p class="status" role="status">
				<a href="{matchesUrl}?status=flagged"
					>{e.openFlags} flagged result{e.openFlags === 1 ? '' : 's'}</a
				> waiting for you.
			</p>
		{/if}
		{#if e.ending}
			<section class="panel end">
				<h2>End of season</h2>
				<p class="muted">
					{e.closed
						? `The deadline passed on ${date(season.deadline)}. Reporting is closed.`
						: 'Every match is reported.'} Settle what's left, then finalize.
				</p>

				<h3>1. Unplayed matches</h3>
				<p>
					{#if e.unplayed}
						{e.unplayed} unplayed: each is a double loss unless you
						<a href="{matchesUrl}?status=unplayed">enter the result</a>.
					{:else}
						None left.
					{/if}
				</p>

				<h3>2. Flagged results</h3>
				<p>
					{#if e.openFlags}
						<a href="{matchesUrl}?status=flagged">{e.openFlags} open</a>: edit or keep each one.
					{:else}
						None open.
					{/if}
				</p>

				<h3>3. Unresolved ties</h3>
				{#each e.ties as t (t.players.map((p) => p.playerId).join())}
					<div class="tie">
						<p>
							<strong>{groupName(t.group)}</strong> · places {t.players[0].place}–{t.players.at(-1)
								?.place} ·
							<span class="muted"
								>{t.resolved ? 'Order set' : 'Tied on points, head-to-head and game-win %'}</span
							>
						</p>
						<ol class="player-list">
							{#each t.players as p, i (p.playerId)}
								<li>
									<span class="pb-num">{p.place}</span>
									<span class="grow">{p.name}</span>
									{#if i > 0}
										<form method="POST" action="?/tiebreak">
											<input type="hidden" name="order" value={swap(t.players, i, i - 1)} />
											<button class="pb-btn pb-btn-ghost pb-btn-sm" aria-label="Move {p.name} up"
												>↑</button
											>
										</form>
									{/if}
									{#if i < t.players.length - 1}
										<form method="POST" action="?/tiebreak">
											<input type="hidden" name="order" value={swap(t.players, i, i + 1)} />
											<button class="pb-btn pb-btn-ghost pb-btn-sm" aria-label="Move {p.name} down"
												>↓</button
											>
										</form>
									{/if}
								</li>
							{/each}
						</ol>
						{#if !t.resolved}
							<form method="POST" action="?/tiebreak">
								<input
									type="hidden"
									name="order"
									value={t.players.map((p) => p.playerId).join(',')}
								/>
								<button class="pb-btn pb-btn-secondary pb-btn-sm">Keep this order</button>
							</form>
						{/if}
					</div>
				{:else}
					<p>None.</p>
				{/each}

				<h3>4. Finalize</h3>
				{#if e.ready}
					<ConfirmButton
						action="?/finalize"
						label="Finalize season"
						title="Finalize {season.name}?"
						confirmLabel="Finalize season"
					>
						Standings freeze and can't be changed after this. The season moves to the archive.
						Finalizing is logged in the public audit log.
					</ConfirmButton>
				{:else}
					<p class="muted">Resolve the flags and order the ties first.</p>
				{/if}
			</section>
		{/if}
	{/if}

	{#if season.status === 'draft' && data.running}
		<p class="muted">
			<a href="/seasons/{data.running.slug}/admin">{data.running.name}</a> is still running. Only one
			season can be open at a time, so signup for this one opens once that season is finished.
		</p>
	{:else if season.status === 'draft'}
		<ConfirmButton
			action="?/openSignup"
			label="Open signup"
			title="Open signup for {season.name}?"
			confirmLabel="Open signup"
		>
			The season goes public and anyone in the Porobound Discord can sign up until you close signup.
			You can still edit the dates and top cut until groups are locked.
		</ConfirmButton>
	{:else if season.status === 'groups'}
		<p class="muted">
			Signup is closed. Check the draw on <a href="/seasons/{season.slug}/admin/groups">Groups</a>,
			then lock it, or reopen signup from there.
		</p>
	{:else if season.status === 'signup'}
		<ConfirmButton
			action="?/closeSignup"
			label="Close signup & draw groups"
			title="Close signup and draw the groups?"
			confirmLabel="Close signup"
		>
			Players can no longer sign up or withdraw. Groups are drawn at random; you can adjust them
			before locking.
		</ConfirmButton>
	{/if}

	<form method="POST" action="?/save" class="panel">
		<SeasonForm
			values={form && 'raw' in form && form.raw ? form.raw : seasonFields(season)}
			errors={form && 'errors' in form ? form.errors : undefined}
			editable={editableFields(season.status)}
			submit="Save changes"
		/>
	</form>

	<section class="danger">
		<h2>Delete season</h2>
		<p class="muted">
			Removes the season from the site for everyone, with its {data.entryCount} signups{data.matchCount
				? ` and ${data.matchCount} matches`
				: ''}. Your name and the time are recorded, and the data is kept so it can be restored from
			the database if needed.
		</p>
		<ConfirmButton
			action="?/delete"
			variant="secondary"
			label="Delete season"
			title="Delete {season.name}?"
			confirmLabel="Delete season"
		>
			{season.name} disappears from the site for everyone, with its {data.entryCount} signups{data.matchCount
				? `, ${data.matchCount} matches and every reported result`
				: ''}. The deletion is recorded under your name.
			{#if hasResults}
				<label class="pb-field">
					Type {season.slug} to confirm
					<input
						class="pb-input"
						name="confirmSlug"
						required
						pattern={season.slug}
						autocomplete="off"
					/>
				</label>
			{/if}
		</ConfirmButton>
	</section>
</div>

<style>
	.end {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
	}
	.end h3 {
		margin: 12px 0 0;
	}
	.end p {
		margin: 0;
	}
	.tie {
		align-self: stretch;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.danger {
		border-top: 1px solid var(--line);
		padding-top: 24px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
	}
</style>
