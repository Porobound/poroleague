<script lang="ts">
	import SeasonForm from '#lib/components/SeasonForm.svelte';
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import PlayerName from '#lib/components/PlayerName.svelte';
	import { date, ordinal, pct, tzName } from '#lib/format.ts';
	import { editableFields, groupName, seasonFields, STATUS_LABEL } from '#lib/season.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const season = $derived(data.season);
	const hasResults = $derived(
		season.status === 'play' || season.status === 'topcut' || season.status === 'finished'
	);
	const matchesUrl = $derived(`/seasons/${season.slug}/admin/matches`);
	const swap = (players: { playerId: string }[], i: number, j: number) => {
		const ids = players.map((p) => p.playerId);
		[ids[i], ids[j]] = [ids[j], ids[i]];
		return ids.join(',');
	};
</script>

<svelte:head>
	<title>Season · {season.name} · Admin · Poroleague</title>
</svelte:head>

<div class="page">
	<span class="eyebrow"
		>{STATUS_LABEL[season.status]}{season.status === 'draft'
			? ' · only organizers can see it'
			: ''}</span
	>
	<h1>{season.name}</h1>
	{#if season.status === 'play'}
		<p class="lock-note">
			Groups are locked, so slug, start date, rounds per week and player limits can't change.
		</p>
	{/if}

	{#if form && 'message' in form && form.message}
		<p class="pb-notice" role="status">{form.message}</p>
	{:else if form && 'saved' in form}
		<p class="pb-notice" role="status">Saved.</p>
	{/if}

	{#if data.end?.ending}
		{@const e = data.end}
		{@const tiesLeft = e.ties.filter((t) => !t.resolved).length}
		<section class="end" aria-labelledby="end-h">
			<div>
				<h2 id="end-h">End of season</h2>
				<p class="muted">
					{e.closed && season.deadline
						? `Reporting closed on ${date(season.deadline)} at 23:59 ${tzName(season.deadline)}.`
						: 'Every match is reported.'}
				</p>
			</div>

			<section class="step">
				<div class="step-head">
					<span class="stepno">1</span>
					<h3>Unplayed matches</h3>
					<span class="pb-badge"
						>{e.unplayed
							? `${e.unplayed} double loss${e.unplayed === 1 ? '' : 'es'}`
							: 'All entered'}</span
					>
				</div>
				<p class="muted">
					Unplayed matches are <strong>double losses</strong> unless you
					<a href="{matchesUrl}?status=unplayed">enter a result</a>.
				</p>
			</section>

			<section class="step">
				<div class="step-head">
					<span class="stepno">2</span>
					<h3>Flagged results</h3>
					<span class={['pb-badge', e.openFlags ? 'pb-badge-rank' : 'pb-badge-win']}
						>{e.openFlags ? `${e.openFlags} open` : 'Done'}</span
					>
				</div>
				<p class="muted">
					{#if e.openFlags}
						Edit or keep each flagged result on the
						<a href="/seasons/{season.slug}/admin">overview</a> before finalizing.
					{:else}
						No open flags.
					{/if}
				</p>
			</section>

			<section class="step">
				<div class="step-head">
					<span class="stepno">3</span>
					<h3>Unresolved ties</h3>
					<span class={['pb-badge', tiesLeft ? 'pb-badge-rank' : 'pb-badge-win']}
						>{tiesLeft ? `${tiesLeft} to order` : e.ties.length ? 'Done' : 'None'}</span
					>
				</div>
				{#if e.ties.length}
					<p class="muted">Put tied players in order.</p>
					<div class="ties">
						{#each e.ties as t (t.players.map((p) => p.playerId).join())}
							{@const all = t.players.length === 2 ? 'both' : 'all'}
							<div class="tie">
								<div class="tie-head">
									<strong>{groupName(t.group)}</strong>
									<span class="muted"
										>{ordinal(t.players[0].place)}–{ordinal(t.players[t.players.length - 1].place)} place</span
									>
								</div>
								<div class="chains" aria-label="Tiebreakers tried">
									<span class="chain">Points: {all} {t.points}</span>
									<span class="chain">Head-to-head: {t.h2h}</span>
									<span class="chain stuck">Game-win %: {all} {pct(t.gwp)} · stuck here</span>
								</div>
								<ol class="tie-list">
									{#each t.players as p, i (p.playerId)}
										<li>
											<span class="place">{p.place}</span>
											<PlayerName
												cell
												class="grow"
												name={p.name}
												avatar={p.avatar}
												former={p.former}
											/>
											<form method="POST" action="?/tiebreak">
												<input
													type="hidden"
													name="order"
													value={swap(t.players, i, Math.max(0, i - 1))}
												/>
												<button
													class="pb-btn pb-btn-secondary pb-btn-sm mv"
													disabled={i === 0}
													aria-label="Move {p.name} up">↑</button
												>
											</form>
											<form method="POST" action="?/tiebreak">
												<input
													type="hidden"
													name="order"
													value={swap(t.players, i, Math.min(t.players.length - 1, i + 1))}
												/>
												<button
													class="pb-btn pb-btn-secondary pb-btn-sm mv"
													disabled={i === t.players.length - 1}
													aria-label="Move {p.name} down">↓</button
												>
											</form>
										</li>
									{/each}
								</ol>
								<form method="POST" action="?/tiebreak">
									<input
										type="hidden"
										name="order"
										value={t.players.map((p) => p.playerId).join(',')}
									/>
									<button
										class={['pb-btn pb-btn-secondary pb-btn-sm', t.resolved && 'is-done']}
										disabled={t.resolved}
										>{t.resolved ? 'Order confirmed ✓' : 'Confirm this order'}</button
									>
								</form>
							</div>
						{/each}
					</div>
				{:else}
					<p class="muted">No ties to settle.</p>
				{/if}
			</section>

			<section class="step">
				<div class="step-head">
					<span class="stepno">4</span>
					<h3>Finalize season</h3>
				</div>
				<p class="muted">
					{e.ready
						? 'Everything is settled. Finalizing freezes the standings.'
						: 'Clear the flags and order the ties first.'}
				</p>
				<div>
					<ConfirmButton
						action="?/finalize"
						label="Finalize season"
						title="Finalize {season.name}?"
						confirmLabel="Finalize season"
						disabled={!e.ready}
					>
						Standings freeze and the season moves to the archive.
					</ConfirmButton>
				</div>
			</section>
		</section>
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
			Anyone in the Porobound Discord can sign up.
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
			editable={editableFields(season.status, data.hasCut)}
			submit="Save changes"
			confirm={season.status === 'draft' ? '' : 'Players see the changes right away.'}
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
		gap: 16px;
	}
	.end h2 {
		margin: 0;
	}
	.step {
		background: var(--surface-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.step p {
		margin: 0;
	}
	.step-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
	}
	.step-head h3 {
		margin: 0;
		flex: 1;
	}
	.stepno {
		display: inline-grid;
		place-items: center;
		width: 28px;
		height: 28px;
		flex: none;
		border-radius: var(--radius-pill);
		background: var(--frost);
		font: 600 14px/1 var(--font-mono);
	}
	.ties {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(340px, 100%), 1fr));
		gap: 16px;
	}
	.tie {
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		padding: 16px;
		background: var(--surface);
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.tie-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
	}
	.chains {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chain {
		font: 500 12px/16px var(--font-sans);
		padding: 3px 8px;
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		color: var(--ink-muted);
	}
	.chain.stuck {
		border-color: var(--signal);
		color: var(--signal);
	}
	.tie-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.tie-list li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--surface-raised);
	}
	.tie-list :global(.grow) {
		flex: 1;
		min-width: 0;
	}
	.place {
		width: 24px;
		font-family: var(--font-mono);
		color: var(--signal);
	}
	.mv {
		width: 32px;
		padding-inline: 0;
	}
	.mv:disabled {
		opacity: 0.35;
	}
	.is-done:disabled {
		border-color: var(--accent);
		opacity: 1;
	}
	.lock-note {
		margin: 0;
		background: var(--surface-raised);
		border: 1px solid var(--signal);
		border-radius: var(--radius-md);
		padding: 14px 16px;
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
