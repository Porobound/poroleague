<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import GameRows from '#lib/components/GameRows.svelte';
	import MatchCard from '#lib/components/MatchCard.svelte';
	import { parseReport } from '#lib/league/report.ts';
	import { MAX_REPLAY_BYTES, TOO_BIG } from '#lib/replay.ts';
	import { MediaQuery } from 'svelte/reactivity';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const m = $derived(data.match);
	const me = $derived(data.user?.id);
	const narrow = new MediaQuery('max-width: 640px', false);
	// The viewer's side comes first; form field names stay p1/p2.
	const order = $derived(me === m.p2Id ? (['p2', 'p1'] as const) : (['p1', 'p2'] as const));
	const player = (k: 'p1' | 'p2') => (k === 'p1' ? data.p1 : data.p2);
	const name = (k: 'p1' | 'p2') => player(k).displayName + (player(k).id === me ? ' (you)' : '');
	const opponent = $derived(player(order[1]).displayName);
	const head = $derived(data.head);
	const values = $derived<Record<string, string>>(
		form && 'values' in form && form.values
			? form.values
			: {
					game1: m.games?.[0] ?? '',
					game2: m.games?.[1] ?? '',
					game3: m.games?.[2] ?? '',
					p1Legend: data.prefill?.p1Legend ?? '',
					p2Legend: data.prefill?.p2Legend ?? '',
					dice: m.diceWinnerId ?? ''
				}
	);
	const errors = $derived<Record<string, string>>((form && 'errors' in form && form.errors) || {});
	type Result = {
		games: string | null;
		p1Games: number | null;
		p2Games: number | null;
		p1Legend: string | null;
		p2Legend: string | null;
		diceWinnerId: string | null;
	};
	// MatchCard props for a result (saved, or the live form), viewer's side first.
	const card = (r: Result) => {
		const side = (k: 'p1' | 'p2') => ({
			name: player(k).displayName,
			avatar: player(k).avatar,
			legend: k === 'p1' ? r.p1Legend : r.p2Legend,
			games: k === 'p1' ? r.p1Games : r.p2Games,
			former: player(k).former,
			href: player(k).former ? null : `/seasons/${data.season.slug}/players/${player(k).id}`,
			tag: data.tags[k]
		});
		const diceSide = r.diceWinnerId === m.p1Id ? 'p1' : 'p2';
		return {
			sides: [side(order[0]), side(order[1])] as [ReturnType<typeof side>, ReturnType<typeof side>],
			dice: r.diceWinnerId ? (order.indexOf(diceSide) as 0 | 1) : null,
			games: r.games
				? [...r.games].map((g) =>
						g === 'D' ? null : (order.indexOf(g === '1' ? 'p1' : 'p2') as 0 | 1)
					)
				: undefined
		};
	};
	const saved = $derived(card(m));
	// An organizer can enter a result for a match they don't play in.
	const reporter = $derived(
		m.reportedBy === m.p1Id ? data.p1 : m.reportedBy === m.p2Id ? data.p2 : null
	);
	const flagger = $derived(m.flaggedBy === m.p1Id ? data.p1 : data.p2);

	// Live read of the report form for the confirm dialog; `changes` re-runs it on every input.
	let reportForm = $state<HTMLFormElement>();
	let changes = $state(0);
	const live = $derived.by(() => {
		void changes;
		return reportForm ? parseReport(new FormData(reportForm), m.p1Id, m.p2Id) : null;
	});

	const RIFTATLAS = 'https://play.riftatlas.com/?replayFile=1';
	const fileUrl = (game: number) => `/seasons/${data.season.slug}/matches/${m.id}/replay/${game}`;
	// Watch: the link opens RiftAtlas, this saves the file to drop there. RiftAtlas takes no file by URL.
	const download = (game: number) =>
		Object.assign(document.createElement('a'), { href: fileUrl(game), download: '' }).click();
	// The server refuses bigger request bodies outright; say so before the upload.
	const tooBig = (e: Event & { currentTarget: HTMLInputElement }) =>
		e.currentTarget.setCustomValidity(
			(e.currentTarget.files?.[0]?.size ?? 0) > MAX_REPLAY_BYTES ? TOO_BIG : ''
		);
</script>

<svelte:head>
	<title>{data.p1.displayName} vs {data.p2.displayName} · {data.season.name} · Poroleague</title>
</svelte:head>

<div class="back-bar">
	<a href="/seasons/{data.season.slug}" aria-label="Back to the season"
		><svg
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg
		></a
	>
	<span>{data.mode === 'report' ? 'Add result' : 'Match'}</span>
</div>

<div class="page narrow">
	<div>
		<span class="eyebrow">{head} · Bo3</span>
		<h1>{player(order[0]).displayName} vs {opponent}</h1>
	</div>

	{#if form?.message}
		<p class={['pb-notice', form && 'error' in form && 'pb-notice-error']} role="status">
			{form.message}
		</p>
	{/if}

	{#if data.mode === 'report'}
		<form
			method="POST"
			action="?/report"
			class="panel report"
			bind:this={reportForm}
			onchange={() => changes++}
		>
			<section class="games" aria-labelledby="games-h">
				<span id="games-h" class="eyebrow">Games</span>
				<GameRows
					p1={{ name: data.p1.displayName }}
					p2={{ name: data.p2.displayName }}
					{values}
					compact={narrow.current}
					flip={order[0] === 'p2'}
				/>
			</section>

			<div class="grid-2">
				{#each order as k (k)}
					<div class="side">
						<div class="who-row">
							<Avatar
								name={player(k).displayName}
								src={player(k).avatar}
								former={player(k).former}
							/>
							<strong class={[player(k).former && 'pb-former']}>{name(k)}</strong>
							{#if data.tags[k]}<span class="pb-badge pb-badge-sm">{data.tags[k]}</span>{/if}
						</div>
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

			<p class="muted small">
				Played on RiftAtlas? Download the replay JSON of each game within 6 hours, before RiftAtlas
				deletes it. You can add it to this match once the result is saved.
			</p>

			<div class="actions action-bar">
				<ConfirmButton
					inForm
					label="Add result"
					title="Save this result?"
					confirmLabel="Save result"
					disabled={!live?.ok}
					confirmDisabled={!live?.ok}
				>
					{#if live?.ok}
						<MatchCard {head} status="reported" {...card(live.values)} />
					{/if}
					<p>
						Reports are final. If something's off, either of you can flag it.
						<a href="/rules#5-reporting-results" target="_blank">Reporting rules</a>
					</p>
				</ConfirmButton>
				<a href="/seasons/{data.season.slug}" class="muted cancel">Cancel</a>
			</div>
		</form>
	{:else}
		<MatchCard
			{head}
			{...saved}
			status={data.status}
			note={data.walkover
				? `Walkover · ${data.walkover} advances`
				: m.flagResolvedAt
					? 'Flag resolved by an organizer · final'
					: m.flaggedBy
						? `Flagged by ${flagger.id === me ? 'you' : flagger.displayName} · only organizers can change it now`
						: m.reportedBy
							? `Reported by ${!reporter ? 'an organizer' : reporter.id === me ? 'you' : reporter.displayName}`
							: ''}
		/>
		{#if data.earlyNote}<p class="muted small">{data.earlyNote}.</p>{/if}

		{#if m.flaggedBy && m.flagReason}
			<figure class="flag-reason">
				<blockquote>{m.flagReason}</blockquote>
				<figcaption class="muted">
					{flagger.id === me ? 'Your' : `${flagger.displayName}'s`} reason for the flag
				</figcaption>
			</figure>
		{/if}

		{#if data.mode === 'flag'}
			<div class="actions action-bar">
				<ConfirmButton
					action="?/flag"
					variant="secondary"
					label="Flag this result"
					title="Flag this result?"
					confirmLabel="Flag result"
				>
					<p>
						Only organizers can change the result after a flag.
						<a href="/rules#5-reporting-results" target="_blank">Reporting rules</a>
					</p>
					<label class="pb-field">
						What's wrong?
						<textarea
							class="pb-textarea"
							name="reason"
							maxlength="500"
							required
							placeholder="e.g. It was 1-2, not 0-2."></textarea>
					</label>
				</ConfirmButton>
			</div>
			{#if form && 'flagError' in form}<p class="pb-hint is-error">{form.flagError}</p>{/if}
		{:else if data.mode === 'locked' && m.flagResolvedAt}
			<p class="muted">An organizer reviewed the flag. The result is final.</p>
		{:else if data.mode === 'locked' && m.flaggedBy === me}
			<p class="muted">You flagged this result. An organizer is reviewing it.</p>
		{:else if data.mode === 'locked'}
			<section class="panel">
				<h2>Flagged</h2>
				<p class="muted">
					{flagger.displayName} flagged this result. An organizer will review it and the decision is logged
					in the public audit log.
				</p>
			</section>
		{:else if data.waiting}
			<p class="muted">
				A result before this match is flagged. You can report once an organizer settles it.
			</p>
		{:else if data.voided}
			<p class="muted">A player dropped out, so this match doesn't count.</p>
		{:else if data.closed && data.season.status === 'play' && !m.reportedBy}
			<p class="muted">Reporting closed at the season deadline. An organizer enters the result.</p>
		{/if}

		{#if data.replays && (data.replays.games.length || data.replays.canUpload)}
			{@const r = data.replays}
			<section class="panel replays" aria-labelledby="replays-h">
				<h2 id="replays-h">Replays</h2>
				{#if r.games.length}
					<ul>
						{#each r.games as g (g.game)}
							<li>
								<span><strong>Game {g.game}</strong> <span class="muted">from {g.by}</span></span>
								<span class="replay-actions">
									<a
										class="pb-btn pb-btn-primary pb-btn-sm"
										href={RIFTATLAS}
										target="_blank"
										rel="noopener"
										onclick={() => download(g.game)}
										>Watch<span class="pb-sr"> game {g.game}</span></a
									>
									<a class="pb-btn pb-btn-ghost pb-btn-sm" href={fileUrl(g.game)} download
										>Download<span class="pb-sr"> game {g.game}</span></a
									>
									{#if r.canDelete}
										<ConfirmButton
											action="?/deleteReplay"
											variant="ghost"
											confirmVariant="danger"
											small
											label="Delete"
											title="Delete the game {g.game} replay?"
											confirmLabel="Delete replay"
											fields={{ game: String(g.game) }}
										/>
									{/if}
								</span>
							</li>
						{/each}
					</ul>
					<p class="muted small">
						Watch downloads the replay and opens RiftAtlas in a new tab: drop the downloaded file on
						that page.
					</p>
					{#if r.published}
						{@const [mine, theirs] = r.published}
						<div class="publish">
							<p>
								<strong>
									{#if mine && theirs}
										Public: anyone can watch these replays.
									{:else if mine}
										You said yes to publishing. Waiting for {opponent}.
									{:else if theirs}
										{opponent} wants to publish these replays. They go public if you publish too.
									{:else}
										Private: only you and {opponent} can watch these replays.
									{/if}
								</strong>
							</p>
							<p class="muted small">
								A replay shows the uploader's deck and every card in their hand. Talk to {opponent}
								first and publish only if you're both fine with that: replays go public once you both
								publish, and either of you can take it back. Adding, replacing or deleting a replay makes
								them private again.
							</p>
							<ConfirmButton
								action="?/publishReplays"
								variant="secondary"
								small
								label={mine ? 'Unpublish' : 'Publish'}
								title={mine ? 'Take back publishing?' : 'Publish these replays?'}
								confirmLabel={mine ? 'Unpublish' : 'Publish'}
								fields={{ on: mine ? '0' : '1' }}
							>
								<p>
									{#if mine}
										Only you and {opponent} will see the replays.
									{:else}
										Everyone will see the uploader's deck and hand once {opponent} has published too.
										Agreed with {opponent}?
									{/if}
								</p>
							</ConfirmButton>
						</div>
					{/if}
				{/if}
				{#if r.canUpload}
					<form method="POST" action="?/replay" enctype="multipart/form-data" class="upload">
						<label class="pb-field">
							Replay file from RiftAtlas
							<input
								class="pb-input"
								type="file"
								name="file"
								accept=".json,application/json"
								required
								onchange={tooBig}
							/>
							<span class="pb-hint">
								One JSON file per game; it replaces a replay already added for that game. Only you
								and {opponent} can see it until you both publish.
							</span>
						</label>
						<label class="pb-field">
							Which game is it?
							<select class="pb-input pb-select" name="game">
								<option value="">The game the file says</option>
								{#each { length: r.played }, i (i)}
									<option value={i + 1}>Game {i + 1}</option>
								{/each}
							</select>
							<span class="pb-hint">
								Choose a game if the series moved to a new RiftAtlas room, where the count starts
								over.
							</span>
						</label>
						<button class="pb-btn pb-btn-secondary">Add replay</button>
					</form>
				{/if}
			</section>
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
	.games {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.who-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.flag-reason {
		margin: 0;
		border-left: 3px solid var(--signal);
		padding: 4px 0 4px 16px;
	}
	.flag-reason blockquote {
		margin: 0 0 4px;
		white-space: pre-wrap;
	}
	.flag-reason figcaption {
		font-size: 13px;
	}
	.report .actions {
		border-top: 1px solid var(--line);
		padding-top: 24px;
	}
	.publish p {
		margin: 0 0 8px;
	}
	.replays,
	.upload {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.upload {
		align-items: flex-start;
	}
	.replays ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.replays li,
	.replay-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.replays li {
		justify-content: space-between;
		padding: 10px 0;
		border-top: 1px solid var(--line);
	}
	@media (max-width: 640px) {
		.report {
			padding: 16px;
			gap: 20px;
		}
		.report .grid-2 {
			grid-template-columns: minmax(0, 1fr);
			gap: 12px;
		}
		.side {
			padding: 16px;
		}
		.report > .opts {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.report > .opts legend {
			grid-column: 1 / -1;
		}
		.opt {
			min-height: 48px;
			min-width: 0;
		}
		.report .actions {
			border-top: 0;
			padding-top: 12px;
		}
		.cancel {
			display: none;
		}
	}
</style>
