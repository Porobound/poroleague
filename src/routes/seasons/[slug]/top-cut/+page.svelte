<script lang="ts">
	import MatchCard from '#lib/components/MatchCard.svelte';
	import { date } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const season = $derived(data.season);
	// Two matches feed each match of the next round; a pair draws the bracket line between them.
	const pairs = <T,>(slots: T[]) =>
		Array.from({ length: Math.ceil(slots.length / 2) }, (_, i) => slots.slice(2 * i, 2 * i + 2));
	let pick = $state<number | null>(null);
	const current = $derived(pick ?? (data.now < 0 ? data.rounds.length - 1 : data.now));
	const total = $derived(
		data.rounds[0].slots.reduce((n, s) => n + (s.p1 ? 1 : 0) + (s.p2 ? 1 : 0), 0)
	);
	const byes = $derived(data.rounds[0].slots.filter((s) => s.bye).length);
	const my = $derived(
		data.rounds
			.flatMap((r, i) => r.slots.map((s) => ({ ...s, round: r.name, i })))
			.filter((s) => s.mine)
			.at(-1)
	);
	const path = $derived.by(() => {
		if (!my) return "You're not in the top cut.";
		const meFirst = my.p1?.id === data.user?.id;
		const opp = meFirst ? my.p2 : my.p1;
		if (my.winner === data.user?.id)
			return my.i === data.rounds.length - 1
				? 'You won the top cut.'
				: "You're through. Next opponent TBD.";
		if (my.winner) return `Out in the ${my.round.toLowerCase()}.`;
		return `${my.round} vs ${opp ? `${opp.name} (${opp.label})` : 'TBD'}.`;
	});
</script>

<svelte:head><title>Top cut · {season.name} · Poroleague</title></svelte:head>

<div class="page">
	<div class="head">
		<span class="pb-badge">{season.name}</span>
		<h1>
			{data.champion
				? 'Top cut · final standings'
				: data.now >= 0
					? `${data.rounds[data.now].name}${data.rounds[data.now].name === 'Final' ? ' is up.' : ' are up.'}`
					: 'Top cut'}
		</h1>
		<p class="lede">
			Top {season.topCutSize} from each group · {total} players · single elimination, Bo3{byes
				? ` · ${byes} byes for the top seeds`
				: ''}{season.topCutDate ? ` · ${date(season.topCutDate)}` : ''}
		</p>
	</div>

	{#if data.champion}
		<div class="champ">
			<span class="eyebrow signal">{season.name} champion</span>
			<strong>{data.champion.name}</strong>
			<span class="muted small">Seed {data.champion.label}</span>
		</div>
	{/if}

	<div class="phone">
		<div class="panel you"><span class="eyebrow">Your top cut</span><span>{path}</span></div>
		<div class="chips" role="group" aria-label="Rounds">
			{#each data.rounds as r, i (r.name)}
				<button
					class="pb-btn pb-btn-sm {i === current ? 'pb-btn-primary' : 'pb-btn-ghost'}"
					aria-pressed={i === current}
					onclick={() => (pick = i)}>{r.name}</button
				>
			{/each}
		</div>
		<div class="cards">
			{#each data.rounds[current].slots as s, j (j)}
				{#if s.card}<MatchCard {...s.card.props} />
				{:else if s.bye}<p class="muted small">
						{(s.p1 ?? s.p2)?.label}
						{(s.p1 ?? s.p2)?.name} advances (bye)
					</p>
				{:else}<p class="muted small">{s.p1?.name ?? 'TBD'} vs {s.p2?.name ?? 'TBD'}</p>{/if}
			{/each}
		</div>
	</div>

	<div class="desk-block">
		<div class="legend">
			<span><i class="key-mine"></i>Your matches</span><span><i class="key-now"></i>To play</span
			><span>A1 = 1st in Group A</span>
		</div>
		<section class="br" aria-label="Bracket">
			{#each data.rounds as r, i (r.name)}
				<div class="col">
					<div class={['colh', i === data.now && 'now']}>
						<b>{r.name}</b><span
							>{i < data.now || data.now < 0 ? 'Done' : i === data.now ? 'Now' : 'Next'}</span
						>
					</div>
					<div class="slots">
						{#each pairs(r.slots) as pair, j (j)}
							<div class={['pair', i < data.rounds.length - 1 && 'joins']}>
								{#each pair as s, k (k)}
									<div class="cell">
										<svelte:element
											this={s.href ? 'a' : 'div'}
											href={s.href}
											class={[
												'bm',
												s.mine && 'mine',
												i === data.now && s.p1 && s.p2 && !s.winner && 'now'
											]}
										>
											{#each [s.p1, s.p2] as p, k (k)}
												<span
													class={[
														'bp',
														p && s.winner === p.id && 'w',
														p && s.winner && s.winner !== p.id && 'l',
														!p && (s.bye ? 'bye' : 'tbd')
													]}
												>
													<span class="sd">{p?.label ?? ''}</span>
													<span class="nm">{p?.name ?? (s.bye ? 'Bye' : 'TBD')}</span>
													<span class="sc">{s.games?.[k] ?? ''}</span>
												</span>
											{/each}
											{#if s.level}<span class="note">Level · higher seed advances</span
												>{:else if s.walkover}<span class="note">Walkover</span>{/if}
										</svelte:element>
									</div>
								{/each}
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</section>
	</div>
</div>

<style>
	/* Ported from the TopCut / MobileTopCut boards. */
	.page {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-items: flex-start;
	}
	.champ {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 20px 24px;
		border: 1px solid var(--signal);
		border-radius: var(--radius-md);
		background: var(--surface-raised);
	}
	.champ strong {
		font: 700 24px/30px var(--font-display);
	}
	.signal {
		color: var(--signal);
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 20px;
		font-size: 13px;
		color: var(--ink-muted);
	}
	.legend i {
		display: inline-block;
		width: 14px;
		height: 10px;
		border-radius: 3px;
		margin-right: 6px;
		vertical-align: -1px;
	}
	.key-mine {
		border: 1px solid var(--accent);
	}
	.key-now {
		background: var(--signal);
	}
	.br {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: minmax(200px, 1fr);
		gap: 28px;
		overflow-x: auto;
		padding-bottom: 8px;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	.colh {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 0 2px 6px;
		border-bottom: 1px solid var(--line);
	}
	.colh b {
		font: 600 14px/20px var(--font-sans);
	}
	.colh span {
		font-size: 12px;
		line-height: 16px;
		color: var(--ink-muted);
	}
	.colh.now span {
		color: var(--signal);
	}
	/* Each pair splits its height between two cells and each box sits centred in its cell, so a
	   box's centre lands at 1/4 and 3/4 of its pair, and the pair's midpoint is exactly where the
	   next round's box is centred. */
	.slots {
		flex: 1;
		display: flex;
		flex-direction: column;
	}
	.pair {
		flex: 1;
		position: relative;
		display: flex;
		flex-direction: column;
	}
	.cell {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 4px 0;
	}
	.pair.joins::after {
		content: '';
		position: absolute;
		right: -15px;
		top: 25%;
		bottom: 25%;
		border-right: 1px solid var(--line);
	}
	.pair.joins::before {
		content: '';
		position: absolute;
		right: -29px;
		top: 50%;
		width: 14px;
		border-top: 1px solid var(--line);
	}
	.bm {
		position: relative;
		display: flex;
		flex-direction: column;
		background: var(--surface-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		font-size: 14px;
		line-height: 20px;
		text-decoration: none;
		color: var(--ink);
	}
	a.bm:hover {
		border-color: var(--ink-muted);
	}
	.bm.mine {
		border-color: var(--accent);
	}
	.bm.now {
		box-shadow: inset 3px 0 0 var(--signal);
	}
	.joins .bm::after {
		content: '';
		position: absolute;
		right: -15px;
		top: 50%;
		width: 14px;
		border-top: 1px solid var(--line);
	}
	.bp {
		display: grid;
		grid-template-columns: 30px minmax(0, 1fr) auto;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
	}
	.bp + .bp {
		border-top: 1px solid var(--line);
	}
	.sd {
		font: 500 11px/16px var(--font-mono);
		color: var(--ink-muted);
	}
	.nm {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sc {
		font: 500 14px/20px var(--font-mono);
		color: var(--ink-muted);
	}
	.bp.w .nm {
		font-weight: 700;
	}
	.bp.w .sc {
		color: var(--accent);
	}
	.bp.l .nm {
		color: var(--ink-muted);
	}
	.bp.tbd .nm,
	.bp.bye .nm {
		color: var(--ink-muted);
		font-style: italic;
	}
	.note {
		padding: 4px 10px 6px;
		border-top: 1px dashed var(--line);
		font-size: 11px;
		line-height: 14px;
		color: var(--signal);
	}
	.you {
		padding: 12px 16px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.chips {
		display: flex;
		gap: 6px;
		overflow-x: auto;
	}
	.cards {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.lede {
		max-width: 600px;
		font-size: 18px;
		line-height: 28px;
		color: var(--ink-muted);
		margin: 0;
	}
	.phone {
		display: none;
	}
	.desk-block {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	@media (max-width: 720px) {
		.phone {
			display: flex;
			flex-direction: column;
			gap: 16px;
		}
		.desk-block {
			display: none;
		}
		.lede {
			font-size: 15px;
			line-height: 22px;
		}
	}
</style>
