<script lang="ts">
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import { MAX_REPLAY_BYTES, TOO_BIG } from '#lib/replay.ts';

	let {
		replays: r,
		opponent,
		base
	}: {
		replays: {
			games: { game: number; replay: { by: string; when: string; file: string } | null }[];
			role: 'player' | 'organizer' | 'visitor';
			public: boolean;
			canUpload: boolean;
			// Who has pressed Publish, the viewer first; players only.
			published: readonly [boolean, boolean] | null;
		};
		opponent: string;
		// The match page's path; a game's file is at `<base>/replay/<game>`.
		base: string;
	} = $props();

	const RIFTATLAS = 'https://play.riftatlas.com/?replayFile=1';
	const ICONS = {
		down: 'M12 4v11m0 0l-4-4m4 4l4-4M5 20h14',
		ext: 'M14 5h5v5M19 5l-8 8M11 7H6v11h11v-5'
	};
	const has = $derived(r.games.some((g) => g.replay));
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
	/>
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
						first and publish only if you're both fine with that: replays go public once you both publish,
						and either of you can take it back. Adding, replacing or deleting a replay makes them private
						again.
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
								Everyone will see the uploader's deck and hand once {opponent} has published too. Agreed
								with {opponent}?
							{/if}
						</p>
					</ConfirmButton>
				</div>
			{/if}
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
	</section>
{/if}

<style>
	.publish p {
		margin: 0 0 8px;
	}
	.upload {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 16px;
	}
</style>
