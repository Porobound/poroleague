<script lang="ts">
	// A player's place in their group after each round. First place is at the top.
	// The drawing is for sighted pointer users; the table under it says the same to everyone else.
	let {
		points,
		size,
		cut = 0
	}: {
		// `tied`: a place still waiting on an organizer, as the standings mark it.
		points: { round: number; rank: number; points: number; tied: boolean }[];
		size: number;
		// Places that advance; 0 draws no line.
		cut?: number;
	} = $props();

	const H = 208;
	const PAD = { l: 30, r: 44, t: 14, b: 26 };
	let width = $state(560);
	let active = $state<number | null>(null);

	const innerW = $derived(Math.max(1, width - PAD.l - PAD.r));
	const innerH = H - PAD.t - PAD.b;
	const x = (i: number) =>
		PAD.l + (points.length > 1 ? (i * innerW) / (points.length - 1) : innerW / 2);
	const y = (rank: number) => PAD.t + (size > 1 ? ((rank - 1) * innerH) / (size - 1) : innerH / 2);
	const path = $derived(points.map((p, i) => `${i ? 'L' : 'M'}${x(i)} ${y(p.rank)}`).join(' '));
	const cutY = $derived(cut ? y(cut + 0.5) : 0);
	// Place labels on the axis: first, the last place inside the cut, and last.
	const ticks = $derived([...new Set([1, cut, size].filter((n) => n >= 1 && n <= size))]);
	const step = $derived(
		Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(innerW / 44))))
	);
	// Each round's hover area is half the gap to its neighbours, kept inside the plot: the first
	// and last rounds would otherwise reach past its edges.
	const hit = (i: number) => {
		const half = points.length > 1 ? innerW / (points.length - 1) / 2 : innerW / 2;
		const from = Math.max(PAD.l, x(i) - half);
		const to = Math.min(PAD.l + innerW, x(i) + half);
		return { x: from, width: Math.max(0, to - from) };
	};
	const last = $derived(points.at(-1)!);
	const shown = $derived(active === null ? null : points[active]);
	const ordinal = (n: number) => {
		const tail = n % 100;
		const suffix = tail > 10 && tail < 14 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
		return `${n}${suffix}`;
	};
	const place = (p: (typeof points)[number]) =>
		`${ordinal(p.rank)} of ${size}${p.tied ? ', tied' : ''}`;
	const pts = (n: number) => `${n} ${n === 1 ? 'pt' : 'pts'}`;
</script>

<div class="chart" bind:clientWidth={width}>
	<svg {width} height={H} viewBox="0 0 {width} {H}" aria-hidden="true">
		{#if cut}
			<rect class="zone" x={PAD.l} y={PAD.t - 8} width={innerW} height={cutY - PAD.t + 8} rx="6" />
			<line class="cut" x1={PAD.l} x2={PAD.l + innerW} y1={cutY} y2={cutY} />
			<text class="cut-label" x={PAD.l + innerW} y={cutY - 6} text-anchor="end">Top cut line</text>
		{/if}
		{#each ticks as t (t)}
			<text class="tick" x={PAD.l - 10} y={y(t) + 4} text-anchor="end">{t}</text>
		{/each}
		{#each points as p, i (p.round)}
			{#if i % step === 0 || i === points.length - 1}
				<text class="tick" x={x(i)} y={H - 6} text-anchor="middle">R{p.round}</text>
			{/if}
		{/each}
		{#if active !== null}
			<line class="guide" x1={x(active)} x2={x(active)} y1={PAD.t - 8} y2={PAD.t + innerH + 6} />
		{/if}
		<path class="line" d={path} />
		{#each points as p, i (p.round)}
			<circle
				class={['dot', i === active && 'is-active']}
				cx={x(i)}
				cy={y(p.rank)}
				r={i === active || i === points.length - 1 ? 5 : 4}
			/>
		{/each}
		<text class="now" x={x(points.length - 1) + 12} y={y(last.rank) + 5}>#{last.rank}</text>
		{#each points as p, i (p.round)}
			<rect
				class="hit"
				{...hit(i)}
				y="0"
				height={H}
				role="presentation"
				onpointerenter={() => (active = i)}
				onpointerleave={() => (active = null)}
			/>
		{/each}
	</svg>
	{#if shown && active !== null}
		<div
			class={['tip', x(active) > width - 130 && 'flip']}
			style:left="{x(active)}px"
			style:top="{y(shown.rank)}px"
			aria-hidden="true"
		>
			<span class="eyebrow">Round {shown.round}</span>
			<strong>#{shown.rank} <span>of {size}{shown.tied ? ' · tied' : ''}</span></strong>
			<span class="muted small">{pts(shown.points)}</span>
		</div>
	{/if}
</div>
<details class="as-table">
	<summary>Show as a table</summary>
	<table class="pb-table">
		<caption class="pb-sr">
			Group position after each round{cut ? `. The top ${cut} advance.` : ''}
		</caption>
		<thead>
			<tr><th>Round</th><th class="pb-num">Place</th><th class="pb-num">Points</th></tr>
		</thead>
		<tbody>
			{#each points as p (p.round)}
				<tr>
					<th scope="row">Round {p.round}</th>
					<td class="pb-num">{place(p)}</td>
					<td class="pb-num">{pts(p.points)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</details>

<style>
	.chart {
		position: relative;
		min-width: 0;
	}
	/* Never wider than its box: the server renders it at a default width, and on a phone an
	   overflow before the script measures the box widens the viewport for good. */
	svg {
		display: block;
		max-width: 100%;
	}
	.zone {
		fill: color-mix(in srgb, var(--accent) 7%, transparent);
	}
	.cut {
		stroke: var(--signal);
		stroke-width: 1;
		stroke-dasharray: 4 4;
		opacity: 0.8;
	}
	.cut-label {
		fill: var(--signal);
		font: 600 10px/1 var(--font-sans);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.tick {
		fill: var(--ink-muted);
		font: 500 11px/1 var(--font-mono);
	}
	.guide {
		stroke: var(--line);
		stroke-width: 1;
	}
	.line {
		fill: none;
		stroke: var(--accent);
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
	}
	.dot {
		fill: var(--accent);
		stroke: var(--surface-raised);
		stroke-width: 2;
	}
	.dot.is-active {
		fill: var(--ink);
	}
	.now {
		fill: var(--ink);
		font: 700 14px/1 var(--font-display);
	}
	.hit {
		fill: transparent;
	}
	.tip {
		position: absolute;
		z-index: 2;
		transform: translate(12px, -50%);
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		background: var(--surface);
		box-shadow: var(--shadow-pop);
		white-space: nowrap;
		pointer-events: none;
	}
	.tip.flip {
		transform: translate(calc(-100% - 12px), -50%);
	}
	.tip strong {
		font: 700 18px/22px var(--font-display);
	}
	.tip strong span {
		font: 400 13px/18px var(--font-sans);
		color: var(--ink-muted);
	}
	.as-table summary {
		display: inline-flex;
		align-items: center;
		min-height: 32px;
		font-size: 13px;
		color: var(--accent);
		cursor: pointer;
	}
	.as-table th[scope='row'] {
		text-align: left;
		font-weight: 500;
	}
	@media (max-width: 640px) {
		.as-table summary {
			min-height: 44px;
		}
	}
</style>
