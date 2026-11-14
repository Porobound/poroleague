<script lang="ts">
	import { enhance } from '$app/forms';
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import { MAX_REPLAY_BYTES, TOO_BIG } from '#lib/replay.ts';

	let {
		replays: r,
		names,
		base,
		upload = null
	}: {
		replays: {
			// Each file is the one the match's player `side` (1 or 2) added.
			games: {
				game: number;
				// Two one-side files of the same game: each shows its own uploader's side.
				split: boolean;
				files: { side: 1 | 2; by: string; bothSides: boolean; when: string; file: string }[];
			}[];
			role: 'player' | 'organizer' | 'visitor';
			public: boolean;
			// The viewer's side when playing: their own files.
			side: 1 | 2 | null;
			canUpload: boolean;
			// Who has pressed Publish, in the order of `names`; null for anyone who may not know.
			published: readonly [boolean, boolean] | null;
		};
		// The two players, the viewer first when playing.
		names: readonly [string, string];
		// The match page's path; a file is at `<base>/replay/<game>/<side>`.
		base: string;
		// Why the last upload wasn't saved: the file was refused, or its game has another replay.
		upload?: 'refused' | 'which' | null;
	} = $props();

	const RIFTATLAS = 'https://play.riftatlas.com/?replayFile=1';
	const ICONS = {
		down: 'M12 4v11m0 0l-4-4m4 4l4-4M5 20h14',
		ext: 'M14 5h5v5M19 5l-8 8M11 7H6v11h11v-5',
		up: 'M12 20V9m0 0l-4 4m4-4l4 4M5 4h14',
		file: 'M7 3h7l4 4v14H7zM14 3v4h4'
	};
	const has = $derived(r.games.some((g) => g.files.length));
	const opponent = $derived(names[1]);
	const pressed = $derived(r.published ?? [false, false]);
	const SHOWS = "A replay shows the uploader's whole deck and hand.";
	// What the publish box says to a player, and the dialog its button opens.
	const box = $derived.by(() => {
		const [mine, theirs] = pressed;
		if (mine && theirs)
			return {
				status: 'Public',
				line: 'Anyone can watch these replays. A replay you add is public at once.',
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
	const fileUrl = (game: number, side: number) => `${base}/replay/${game}/${side}`;
	// The file whose Watch was pressed last, as `<game>/<side>`: its row says what just happened and
	// what to do next.
	let watched = $state<string | null>(null);
	// Watch: the link opens RiftAtlas, this saves the file to drop there. RiftAtlas takes no file by URL.
	const watch = (game: number, side: number, file: string) => {
		Object.assign(document.createElement('a'), {
			href: fileUrl(game, side),
			download: file
		}).click();
		watched = `${game}/${side}`;
	};
	const which = $derived(upload === 'which');
	let add = $state<HTMLDetailsElement>();
	// The chosen file's name. Empty after a page load, so always without JavaScript: the input is
	// empty then too, and the which-game step has to show it again.
	let picked = $state('');
	let pick = $state<number | null>(null);
	const chosen = (e: Event & { currentTarget: HTMLInputElement }) => {
		const file = e.currentTarget.files?.[0];
		picked = file?.name ?? '';
		// The server refuses bigger request bodies outright; say so before the upload.
		e.currentTarget.setCustomValidity((file?.size ?? 0) > MAX_REPLAY_BYTES ? TOO_BIG : '');
	};
	const close = () => {
		add!.open = false;
		add!.querySelector('form')!.reset();
		picked = '';
		pick = null;
	};
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

{#snippet remove(game: number, side: number, label: string, sr = '')}
	<ConfirmButton
		action="?/deleteReplay"
		variant="ghost"
		confirmVariant="danger"
		class="pb-replay-del"
		{label}
		{sr}
		title="Delete the game {game} replay?"
		confirmLabel="Delete replay"
		fields={{ game: String(game), side: String(side) }}
	>
		<p>This can't be undone.</p>
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
				{#each r.games as { game, split, files } (game)}
					<li class="pb-replay-game">
						<div class="pb-replay-ghead">
							<h3 class="pb-replay-gname">Game {game}</h3>
							{#if !files.length || split}
								<span class="pb-replay-gside"
									>{files.length ? 'Each side in its own replay' : 'No replay'}</span
								>
							{/if}
						</div>
						{#if files.length}
							<ul class="pb-replay-files">
								{#each files as replay (replay.side)}
									<li class="pb-replay">
										<div class="pb-replay-main">
											<span class="pb-replay-meta">
												{`Added by ${replay.by} · ${replay.when}`}
											</span>
										</div>
										{#if replay}
											{@const whose = ` game ${game} from ${replay.by}`}
											<div class="pb-replay-actions">
												<a
													class="pb-btn pb-btn-secondary pb-replay-watch"
													href={RIFTATLAS}
													target="_blank"
													rel="noopener"
													onclick={() => watch(game, replay.side, replay.file)}
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
													>Watch<span class="pb-sr">{whose} on RiftAtlas</span></a
												>
												<a
													class="pb-btn pb-btn-ghost"
													href={fileUrl(game, replay.side)}
													download={replay.file}
													>{@render ico('down')}Download<span class="pb-sr">{whose}</span></a
												>
												{#if r.role === 'organizer'}
													{@render remove(
														game,
														replay.side,
														'Delete',
														` game ${game} replay from ${replay.by}`
													)}
												{:else if r.role === 'player' && replay.side === r.side}
													<details class="pb-replay-more">
														<summary class="pb-btn pb-btn-ghost" aria-label="More for game {game}"
															><svg
																width="18"
																height="18"
																viewBox="0 0 24 24"
																fill="currentColor"
																aria-hidden="true"
																><circle cx="5" cy="12" r="1.8" /><circle
																	cx="12"
																	cy="12"
																	r="1.8"
																/><circle cx="19" cy="12" r="1.8" /></svg
															></summary
														>
														<div class="pb-replay-menu">
															{@render remove(game, replay.side, 'Delete replay')}
														</div>
													</details>
												{/if}
											</div>
											{#if watched === `${game}/${replay.side}`}
												<div class="pb-replay-next" role="status">
													<ol>
														<li>Saved to your downloads as <code>{replay.file}</code>.</li>
														<li>RiftAtlas opened in a new tab. Drop the file in there.</li>
													</ol>
													<div class="pb-replay-next-links">
														<a href={RIFTATLAS} target="_blank" rel="noopener"
															>Open RiftAtlas{@render ico('ext', 14)}</a
														>
														<a href={fileUrl(game, replay.side)} download={replay.file}
															>Download again</a
														>
													</div>
												</div>
											{/if}
										{/if}
									</li>
								{/each}
							</ul>
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
			<details class="pb-replays-add" open={!!upload} bind:this={add}>
				<summary class={['pb-btn', has ? 'pb-btn-ghost' : 'pb-btn-primary']}
					>{@render ico('up')}{has ? 'Add or replace a replay' : 'Add a replay'}</summary
				>
				<!-- Without a reload a refused file stays in the input, for the which-game step to send again. -->
				<form
					class="pb-replays-form"
					method="POST"
					action="?/replay"
					enctype="multipart/form-data"
					use:enhance={() =>
						async ({ result, update }) => {
							await update();
							if (result.type === 'success') close();
						}}
				>
					<div hidden={which && !!picked}>
						<label class="pb-field">
							Replay file
							<input
								class="pb-input pb-file"
								type="file"
								name="file"
								accept=".json,application/json"
								required
								aria-invalid={upload === 'refused' || undefined}
								onchange={chosen}
							/>
							<span class="pb-hint">One JSON file per game, downloaded from RiftAtlas.</span>
						</label>
					</div>
					{#if which}
						<fieldset class="pb-replays-which">
							<legend>Which game is this file?</legend>
							{#if picked}
								<span class="pb-replays-file">{@render ico('file')}{picked}</span>
							{/if}
							{#each r.games as { game, files } (game)}
								{@const own = files.find((f) => f.side === r.side)}
								<label class="pb-choice">
									<input type="radio" name="game" value={game} required bind:group={pick} />
									<span>
										<strong>Game {game}</strong>
										<span class="pb-choice-sub">
											{own
												? `Replaces the replay added by ${own.by}`
												: files.length
													? `Goes next to the replay added by ${files[0].by}`
													: 'No replay yet'}
										</span>
									</span>
								</label>
							{/each}
						</fieldset>
					{/if}
					<div class="pb-replays-form-actions">
						<button class="pb-btn pb-btn-primary" disabled={which && !!picked && !pick}
							>{which ? 'Save replay' : 'Upload'}</button
						>
						<!-- A link: going to the page again also drops the notice, with or without JavaScript. -->
						<a
							class="pb-btn pb-btn-ghost"
							href={base}
							data-sveltekit-noscroll
							data-sveltekit-replacestate
							onclick={close}>Cancel</a
						>
					</div>
				</form>
			</details>
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
</style>
