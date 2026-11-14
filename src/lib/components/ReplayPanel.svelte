<script lang="ts">
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import { MAX_REPLAY_BYTES, TOO_BIG } from '#lib/replay.ts';

	let {
		replays: r,
		names,
		base
	}: {
		replays: {
			games: { game: number; replay: { by: string; when: string; file: string } | null }[];
			role: 'player' | 'organizer' | 'visitor';
			public: boolean;
			canUpload: boolean;
			// Who has pressed Publish, in the order of `names`; null for anyone who may not know.
			published: readonly [boolean, boolean] | null;
		};
		// The two players, the viewer first when playing.
		names: readonly [string, string];
		// The match page's path; a game's file is at `<base>/replay/<game>`.
		base: string;
	} = $props();

	const RIFTATLAS = 'https://play.riftatlas.com/?replayFile=1';
	const ICONS = {
		down: 'M12 4v11m0 0l-4-4m4 4l4-4M5 20h14',
		ext: 'M14 5h5v5M19 5l-8 8M11 7H6v11h11v-5'
	};
	const has = $derived(r.games.some((g) => g.replay));
	const opponent = $derived(names[1]);
	const pressed = $derived(r.published ?? [false, false]);
	const SHOWS = "A replay shows the uploader's whole deck and hand.";
	// What the publish box says to a player, and the dialog its button opens.
	const box = $derived.by(() => {
		const [mine, theirs] = pressed;
		if (mine && theirs)
			return {
				status: 'Public',
				line: 'Anyone can watch these replays. Adding, replacing or deleting one makes them private again.',
				button: 'Unpublish',
				title: 'Unpublish these replays?',
				dialog: [`They go back to private: only you, ${opponent} and organizers can open them.`]
			};
		if (mine)
			return {
				status: `Waiting for ${opponent}`,
				line: `The replays go public when ${opponent} presses Publish too.`,
				button: 'Take it back',
				title: 'Take back your Publish?',
				dialog: ['The replays stay private.']
			};
		return {
			status: theirs ? `${opponent} wants to publish` : 'Private',
			line: theirs
				? 'The replays go public when you press Publish too.'
				: `Only you, ${opponent} and organizers can open these replays.`,
			advice: theirs ? SHOWS : `${SHOWS} Agree with ${opponent} before you publish.`,
			button: 'Publish',
			primary: theirs,
			title: 'Publish these replays?',
			dialog: [
				`${SHOWS} ${
					theirs
						? `${opponent} has already pressed Publish, so everyone can watch right away.`
						: `Everyone can watch once ${opponent} presses Publish too.`
				}`,
				'Either of you can take it back.'
			]
		};
	});
	const fileUrl = (game: number) => `${base}/replay/${game}`;
	// The game whose Watch was pressed last: its row says what just happened and what to do next.
	let watched = $state<number | null>(null);
	// Watch: the link opens RiftAtlas, this saves the file to drop there. RiftAtlas takes no file by URL.
	const watch = (game: number, file: string) => {
		Object.assign(document.createElement('a'), { href: fileUrl(game), download: file }).click();
		watched = game;
	};
	// The server refuses bigger request bodies outright; say so before the upload.
	const tooBig = (e: Event & { currentTarget: HTMLInputElement }) =>
		e.currentTarget.setCustomValidity(
			(e.currentTarget.files?.[0]?.size ?? 0) > MAX_REPLAY_BYTES ? TOO_BIG : ''
		);
</script>

{#snippet ico(name: keyof typeof ICONS, size = 16)}
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"><path d={ICONS[name]} /></svg
	>
{/snippet}

{#snippet remove(game: number, label: string, sr = '')}
	<ConfirmButton
		action="?/deleteReplay"
		variant="ghost"
		confirmVariant="danger"
		class="pb-replay-del"
		{label}
		{sr}
		title="Delete the game {game} replay?"
		confirmLabel="Delete replay"
		fields={{ game: String(game) }}
	>
		<p>This can't be undone.</p>
		{#if pressed.includes(true)}
			<p>The other replays go back to private until both players publish again.</p>
		{/if}
	</ConfirmButton>
{/snippet}

{#if has || r.canUpload || r.role === 'organizer'}
	<section class="pb-replays pb-panel" aria-labelledby="replays-h">
		<header class="pb-replays-head">
			<h2 id="replays-h" class="pb-replays-title">Replays</h2>
			{#if has && r.role !== 'visitor'}
				<span class={['pb-badge', r.public && 'pb-badge-win']}
					>{r.public ? 'Public' : 'Private'}</span
				>
			{/if}
		</header>
		{#if has}
			<ol class="pb-replays-list">
				{#each r.games as { game, replay } (game)}
					<li class={['pb-replay', !replay && 'is-empty']}>
						<div class="pb-replay-main">
							<span class="pb-replay-game">Game {game}</span>
							<span class="pb-replay-meta">
								{replay ? `Added by ${replay.by} · ${replay.when}` : 'No replay'}
							</span>
						</div>
						{#if replay}
							<div class="pb-replay-actions">
								<a
									class="pb-btn pb-btn-secondary pb-replay-watch"
									href={RIFTATLAS}
									target="_blank"
									rel="noopener"
									onclick={() => watch(game, replay.file)}
									><svg
										class="pb-ico-play"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="currentColor"
										aria-hidden="true"
										><path
											d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5z"
										/></svg
									>Watch<span class="pb-sr"> game {game} on RiftAtlas</span></a
								>
								<a class="pb-btn pb-btn-ghost" href={fileUrl(game)} download={replay.file}
									>{@render ico('down')}Download<span class="pb-sr"> game {game}</span></a
								>
								{#if r.role === 'organizer'}
									{@render remove(game, 'Delete', ` game ${game} replay`)}
								{:else if r.role === 'player'}
									<details class="pb-replay-more">
										<summary class="pb-btn pb-btn-ghost" aria-label="More for game {game}"
											><svg
												width="18"
												height="18"
												viewBox="0 0 24 24"
												fill="currentColor"
												aria-hidden="true"
												><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle
													cx="19"
													cy="12"
													r="1.8"
												/></svg
											></summary
										>
										<div class="pb-replay-menu">{@render remove(game, 'Delete replay')}</div>
									</details>
								{/if}
							</div>
							{#if watched === game}
								<div class="pb-replay-next" role="status">
									<ol>
										<li>Saved to your downloads as <code>{replay.file}</code>.</li>
										<li>RiftAtlas opened in a new tab. Drop the file in there.</li>
									</ol>
									<div class="pb-replay-next-links">
										<a href={RIFTATLAS} target="_blank" rel="noopener"
											>Open RiftAtlas{@render ico('ext', 14)}</a
										>
										<a href={fileUrl(game)} download={replay.file}>Download again</a>
									</div>
								</div>
							{/if}
						{/if}
					</li>
				{/each}
			</ol>
			<p class="pb-replays-how">
				{@render ico('ext', 14)}
				<span>
					Watch saves the replay file and opens
					<a href={RIFTATLAS} target="_blank" rel="noopener">RiftAtlas</a> in a new tab. Drop the file
					in there to play it.
				</span>
			</p>
		{:else}
			<p class="pb-replays-empty">
				{r.role === 'player'
					? 'No replays yet. RiftAtlas deletes replays after 6 hours, so add yours while you still have the files: one JSON file per game.'
					: 'No replays yet.'}
			</p>
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
						One JSON file per game. Only you and {opponent} can see it until you both publish.
					</span>
				</label>
				<label class="pb-field">
					Which game is it?
					<select class="pb-input pb-select" name="game">
						<option value="">The game the file says</option>
						{#each r.games as { game } (game)}
							<option value={game}>Game {game}</option>
						{/each}
					</select>
					<span class="pb-hint">
						Choose a game if the series moved to a new RiftAtlas room, where the count starts over.
					</span>
				</label>
				<button class="pb-btn pb-btn-secondary">Add replay</button>
			</form>
		{/if}
		{#if has && r.published && r.role === 'player'}
			<div class={['pb-replays-publish', r.public && 'is-public']}>
				<div class="pb-publish-text">
					<strong class="pb-publish-status">{box.status}</strong>
					<span>{box.line}</span>
					{#if box.advice}<span class="pb-publish-advice">{box.advice}</span>{/if}
				</div>
				<ConfirmButton
					action="?/publishReplays"
					variant={box.primary ? 'primary' : 'secondary'}
					label={box.button}
					title={box.title}
					confirmLabel={box.button}
					fields={{ on: pressed[0] ? '0' : '1' }}
				>
					{#each box.dialog as line (line)}<p>{line}</p>{/each}
				</ConfirmButton>
			</div>
		{:else if has && r.published && r.role === 'organizer'}
			{@const first = pressed[0] ? 0 : 1}
			<p class="pb-replays-status">
				{#if r.public}
					Both players published.
				{:else if pressed.includes(true)}
					{names[first]} pressed Publish; {names[1 - first]} hasn't.
				{:else}
					Neither player has pressed Publish.
				{/if}
			</p>
		{/if}
	</section>
{/if}

<style>
	.pb-replays :global(.pb-dialog-body p) {
		margin: 0;
	}
	.upload {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 16px;
	}
</style>
