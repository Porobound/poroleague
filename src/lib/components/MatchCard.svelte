<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';

	type Side = {
		name: string;
		avatar: string | null;
		legend: string | null;
		games: number | null;
		href?: string | null;
		former?: boolean;
	};
	let {
		head,
		sides,
		dice = null,
		status,
		note = '',
		link,
		flag = null,
		resolved = false,
		mine = false,
		games
	}: {
		head: string;
		sides: [Side, Side];
		dice?: 0 | 1 | null;
		status: 'scheduled' | 'reported' | 'flagged' | 'void' | 'overdue';
		note?: string;
		link?: { href: string; label: string };
		flag?: { by: string; reason: string | null } | null;
		resolved?: boolean;
		mine?: boolean;
		games?: (0 | 1 | null)[]; // side that won each game, null for a draw
	} = $props();

	const BADGE = {
		scheduled: ['', 'Scheduled'],
		reported: ['', 'Final'],
		flagged: ['pb-badge-rank', 'Flagged'],
		void: ['', 'Void'],
		overdue: ['pb-badge-rank', 'Overdue']
	} as const;
	const winner = $derived.by(() => {
		const [a, b] = sides.map((s) => s.games);
		if (status === 'void' || a === null || b === null || a === b) return null;
		return a > b ? 0 : 1;
	});
</script>

<article class={['pb-match', `pb-match-${status}`, mine && 'pb-match-mine']}>
	<div class="pb-match-head">
		<span>{head}</span>
		<span class="status">
			{#if resolved}
				<svg class="resolved" width="14" height="14" viewBox="0 0 14 14" role="img">
					<title>Flag resolved by an organizer</title>
					<path
						d="M3 12.5V1.5M3 2h7.5l-1.8 2.75L10.5 7.5H3"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			{/if}
			<span class={['pb-badge', BADGE[status][0]]}>{BADGE[status][1]}</span>
		</span>
	</div>
	{#each sides as s, i (i)}
		<div class={['pb-match-p', winner === i && 'is-winner', s.former && 'is-former']}>
			<Avatar name={s.name} src={s.avatar} former={s.former} />
			<span class="pb-match-name">
				<span class="pb-match-nm">
					{#if s.href}<a href={s.href}>{s.name}</a>{:else}{s.name}{/if}
					{#if dice === i}
						<svg class="pb-die" width="14" height="14" viewBox="0 0 14 14" role="img">
							<title>Won the dice roll</title>
							<rect
								x="1.5"
								y="1.5"
								width="11"
								height="11"
								rx="3"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
							/>
							<circle cx="5" cy="5" r="1.2" fill="currentColor" />
							<circle cx="9" cy="9" r="1.2" fill="currentColor" />
						</svg>
					{/if}
				</span>
				{#if s.legend}<span class="pb-match-legend">{s.legend}</span>{/if}
			</span>
			<span class="pb-match-score">{s.games ?? '–'}</span>
		</div>
	{/each}
	{#if games?.length}
		<div class="pb-match-games">
			<span class="pb-match-games-k">Games</span>
			<ol class="pb-gchips" aria-label="Games">
				{#each games as g, i (i)}
					{@const who = g === null ? null : sides[g]}
					<li
						class={[
							'pb-gchip',
							g === null && 'is-draw',
							g !== null && g === winner && 'is-match-winner'
						]}
						title="Game {i + 1}: {who ? `${who.name} won` : 'draw'}"
					>
						<span class="pb-gchip-n" aria-hidden="true">{i + 1}</span><span class="pb-sr"
							>Game {i + 1}:
						</span>{who ? (who.former ? who.name : who.name.split(/\s+/)[0]) : 'Draw'}
					</li>
				{/each}
			</ol>
		</div>
	{/if}
	{#if flag}
		<figure class="pb-flag-reason">
			<figcaption>Flagged by {flag.by}</figcaption>
			<blockquote>{flag.reason ?? 'Reason removed'}</blockquote>
		</figure>
	{/if}
	{#if note || link}
		<div class="pb-match-foot">
			<span class="pb-match-note">{note}</span>
			{#if link}<a href={link.href}>{link.label}</a>{/if}
		</div>
	{/if}
</article>

<style>
	.status {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.resolved {
		color: var(--ink-muted);
	}
</style>
