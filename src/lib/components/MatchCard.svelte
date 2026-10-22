<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';

	type Side = {
		name: string;
		avatar: string | null;
		legend: string | null;
		games: number | null;
		href?: string;
	};
	let {
		head,
		sides,
		dice = null,
		status,
		note = '',
		link,
		mine = false
	}: {
		head: string;
		sides: [Side, Side];
		dice?: 0 | 1 | null;
		status: 'scheduled' | 'reported' | 'flagged' | 'void' | 'overdue';
		note?: string;
		link?: { href: string; label: string };
		mine?: boolean;
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
		<span class={['pb-badge', BADGE[status][0]]}>{BADGE[status][1]}</span>
	</div>
	{#each sides as s, i (i)}
		<div class={['pb-match-p', winner === i && 'is-winner']}>
			<Avatar name={s.name} src={s.avatar} />
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
	{#if note || link}
		<div class="pb-match-foot">
			<span class="pb-match-note">{note}</span>
			{#if link}<a href={link.href}>{link.label}</a>{/if}
		</div>
	{/if}
</article>
