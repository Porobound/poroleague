<script lang="ts">
	// A player's place in their group after each round. First place is at the top.
	let {
		points,
		size,
		cut = 0
	}: {
		points: { round: number; rank: number; points: number }[];
		size: number;
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
	// Rank labels on the axis: first, the last place inside the cut, and last.
	const ticks = $derived([...new Set([1, cut, size].filter((n) => n >= 1 && n <= size))]);
	const step = $derived(
		Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(innerW / 44))))
	);
	const band = $derived(points.length > 1 ? innerW / (points.length - 1) : innerW);
	const last = $derived(points.at(-1)!);
	const shown = $derived(active === null ? null : points[active]);
</script>

<div class="chart" bind:clientWidth={width}>
	<svg
		{width}
		height={H}
		viewBox="0 0 {width} {H}"
		role="img"
		aria-label="Group position after each round: {points
			.map((p) => `round ${p.round}, ${p.rank}`)
			.join('; ')}"
	>
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
		{#if shown && active !== null}
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
				x={x(i) - band / 2}
				y="0"
				width={band}
				height={H}
				role="presentation"
				onpointerenter={() => (active = i)}
				onpointerleave={() => (active = null)}
			>
				<title>Round {p.round}: #{p.rank} of {size}, {p.points} pts</title>
			</rect>
		{/each}
	</svg>
	{#if shown && active !== null}
		<div
			class="tip"
			style:left="{x(active)}px"
			style:top="{y(shown.rank)}px"
			class:flip={x(active) > width - 130}
		>
			<span class="eyebrow">Round {shown.round}</span>
			<strong>#{shown.rank} <span>of {size}</span></strong>
			<span class="muted small">{shown.points} pts</span>
		</div>
	{/if}
</div>

<style>
	.chart {
		position: relative;
		min-width: 0;
	}
	svg {
		display: block;
		overflow: visible;
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
</style>
