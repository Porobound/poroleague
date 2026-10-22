<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import MatchCard from '#lib/components/MatchCard.svelte';
	import { groupName } from '#lib/season.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const m = $derived(data.match);
	const me = $derived(data.user?.id);
	// The viewer's side comes first; form field names stay p1/p2.
	const order = $derived(me === m.p2Id ? (['p2', 'p1'] as const) : (['p1', 'p2'] as const));
	const player = (k: 'p1' | 'p2') => (k === 'p1' ? data.p1 : data.p2);
	const name = (k: 'p1' | 'p2') =>
		player(k).displayName + (player(k).id === me ? ' (you)' : '');
	const opponent = $derived(player(order[1]).displayName);
	const head = $derived(`${m.group ? `${groupName(m.group)} · ` : ''}Round ${m.round}`);
	const values = $derived<Record<string, string>>(
		form && 'values' in form && form.values
			? form.values
			: {
					p1Games: m.p1Games?.toString() ?? '',
					p2Games: m.p2Games?.toString() ?? '',
					p1Legend: data.prefill.p1Legend,
					p2Legend: data.prefill.p2Legend,
					dice: m.diceWinnerId ?? ''
				}
	);
	const errors = $derived<Record<string, string>>(
		(form && 'errors' in form && form.errors) || {}
	);
	const side = (k: 'p1' | 'p2') => ({
		name: player(k).displayName,
		avatar: player(k).avatar,
		legend: k === 'p1' ? m.p1Legend : m.p2Legend,
		games: k === 'p1' ? m.p1Games : m.p2Games
	});
	type Side = ReturnType<typeof side>;
	const sides = $derived<[Side, Side]>([side(order[0]), side(order[1])]);
	const dice = $derived(
		m.diceWinnerId ? (order.indexOf(m.diceWinnerId === m.p1Id ? 'p1' : 'p2') as 0 | 1) : null
	);
	const reporter = $derived(m.reportedBy === m.p1Id ? data.p1 : data.p2);
	const flagger = $derived(m.flaggedBy === m.p1Id ? data.p1 : data.p2);
</script>

<svelte:head>
	<title>{data.p1.displayName} vs {data.p2.displayName} · {data.season.name} · Poroleague</title>
</svelte:head>

<div class="page narrow">
	<div>
		<span class="eyebrow">{head} · Bo3{data.mode === 'edit' ? ' · edit your report' : ''}</span>
		<h1>{player(order[0]).displayName} vs {opponent}</h1>
		{#if data.mode === 'edit'}
			<p class="muted">You can change this until {opponent} flags it.</p>
		{/if}
	</div>

	{#if form?.message}
		<p class={['status', form && 'error' in form && 'is-error']} role="status">
			{form.message}
		</p>
	{/if}

	{#if data.mode === 'report' || data.mode === 'edit'}
		<form method="POST" action="?/report" class="panel report">
			<div class="grid-2">
				{#each order as k (k)}
					<div class="side">
						<div class="who-row">
							<Avatar name={player(k).displayName} src={player(k).avatar} />
							<strong>{name(k)}</strong>
						</div>
						<fieldset class="opts">
							<legend class="eyebrow">Games won</legend>
							{#each [0, 1, 2] as n (n)}
								<label class="opt">
									<input
										type="radio"
										name="{k}Games"
										value={n}
										checked={values[`${k}Games`] === String(n)}
										required
									/>{n}
								</label>
							{/each}
						</fieldset>
						<label class="pb-field">
							Legend
							<select class="pb-input pb-select" name="{k}Legend" required>
								<option value="" disabled selected={!values[`${k}Legend`]}>Pick a legend</option>
								{#each data.legends as l (l)}
									<option value={l} selected={values[`${k}Legend`] === l}>{l}</option>
								{/each}
							</select>
							{#if errors[`${k}Legend`]}
								<span class="pb-hint is-error">{errors[`${k}Legend`]}</span>
							{/if}
						</label>
					</div>
				{/each}
			</div>
			{#if errors.score}<p class="pb-hint is-error" role="alert">{errors.score}</p>{/if}

			<fieldset class="opts">
				<legend class="eyebrow">Who won the dice roll?</legend>
				{#each order as k (k)}
					<label class="opt who">
						<input
							type="radio"
							name="dice"
							value={player(k).id}
							checked={values.dice === player(k).id}
							required
						/>{player(k).displayName}
					</label>
				{/each}
			</fieldset>
			{#if errors.dice}<p class="pb-hint is-error" role="alert">{errors.dice}</p>{/if}

			<div class="actions">
				<button class="pb-btn pb-btn-primary"
					>{data.mode === 'edit' ? 'Save changes' : 'Add result'}</button
				>
				<a href="/seasons/{data.season.slug}" class="muted">Cancel</a>
			</div>
		</form>
	{:else}
		<MatchCard
			{head}
			{sides}
			{dice}
			status={data.voided ? 'void' : m.flaggedBy ? 'flagged' : m.reportedBy ? 'reported' : 'scheduled'}
			note={m.flaggedBy
				? `Flagged by ${flagger.id === me ? 'you' : flagger.displayName} · only organizers can change it now`
				: m.reportedBy
					? `Reported by ${reporter.id === me ? 'you' : reporter.displayName}`
					: ''}
		/>

		{#if data.mode === 'flag'}
			<div class="actions">
				<ConfirmButton
					action="?/flag"
					variant="secondary"
					label="Flag this result"
					title="Flag this result?"
					confirmLabel="Flag result"
				>
					<p>An organizer will review it. After a flag, only organizers can change the result.</p>
					<label class="pb-field">
						What's wrong?
						<textarea
							class="pb-textarea"
							name="reason"
							maxlength="500"
							required
							placeholder="e.g. It was 1-2, not 0-2."
						></textarea>
					</label>
				</ConfirmButton>
				<span class="muted">Looks right? Nothing to do.</span>
			</div>
			{#if form && 'flagError' in form}<p class="pb-hint is-error">{form.flagError}</p>{/if}
		{:else if data.mode === 'locked' && m.reportedBy === me}
			<section class="panel">
				<h2>Your report is locked</h2>
				<p class="muted">
					{flagger.displayName} flagged this result, so you can't edit it any more. An organizer will
					review it and the decision is logged in the public audit log.
				</p>
			</section>
		{:else if data.mode === 'locked'}
			<p class="muted">You flagged this result. An organizer is reviewing it.</p>
		{:else if data.voided}
			<p class="muted">A player dropped out, so this match doesn't count.</p>
		{:else if data.closed && data.season.status === 'play' && !m.reportedBy}
			<p class="muted">Reporting closed at the season deadline. An organizer enters the result.</p>
		{/if}

		<a href="/seasons/{data.season.slug}">Back to season</a>
	{/if}
</div>

<style>
	.report {
		display: flex;
		flex-direction: column;
		gap: 28px;
	}
	.side {
		display: flex;
		flex-direction: column;
		gap: 14px;
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		padding: 20px;
		background: var(--surface);
	}
	.who-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.report .actions {
		border-top: 1px solid var(--line);
		padding-top: 24px;
	}
</style>
