<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import { pct } from '#lib/format.ts';
	import { gameWinPct, matchWinPct, type Tally } from '#lib/league/legendStats.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const season = $derived(data.season);
	const COLS = [
		{ key: 'legend', label: 'Legend' },
		{ key: 'picks', label: 'Picks' },
		{ key: 'players', label: 'Players' },
		{ key: 'w', label: 'W–D–L', title: 'Wins–Draws–Losses (mirror matches left out)' },
		{ key: 'mw', label: 'Match win %' },
		{ key: 'gw', label: 'Game win %' }
	] as const;
	// Phones get a select instead of column headers; each option sorts its column's first way.
	const SORT_OPTIONS = [
		['picks', 'Picks'],
		['mw', 'Match win %'],
		['gw', 'Game win %'],
		['players', 'Players'],
		['legend', 'Legend A–Z']
	] as const;

	const query = (o: { sort: string; dir?: string; legend?: string | null }) =>
		'?' +
		new URLSearchParams(Object.entries(o).filter((e): e is [string, string] => !!e[1])).toString();
	// Clicking the sorted column flips it; another column starts in its own direction.
	const sortHref = (key: string) =>
		query(
			key === data.sort
				? { sort: key, dir: data.dir === 'asc' ? 'desc' : 'asc', legend: data.open }
				: { sort: key, legend: data.open }
		);
	const toggleHref = (legend: string) =>
		query({ sort: data.sort, dir: data.dir, legend: data.open === legend ? null : legend });
	const bar = (t: Tally) => `width: ${Math.max(4, Math.round((t.picks / data.maxPicks) * 100))}%`;
</script>

{#snippet wdl(t: Tally)}
	<span class="wdl"
		><span class={t.wins ? 'win' : 'pb-muted'}>{t.wins}</span>–<span>{t.draws}</span>–<span
			class={t.losses ? 'loss' : 'pb-muted'}>{t.losses}</span
		></span
	>
{/snippet}

{#snippet rate(n: number | null)}
	<span class={[n === null && 'pb-muted']}>{pct(n)}</span>
{/snippet}

{#snippet chev()}
	<svg class="pb-disclosure-chev" viewBox="0 0 24 24" aria-hidden="true">
		<path
			d="M9 6l6 6-6 6"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>
{/snippet}

{#snippet users(legend: string)}
	<ul class="ulist" aria-label="Players who used {legend}">
		{#each data.users as u (u.key)}
			<li>
				<a class="pb-pname" href="/seasons/{season.slug}/players/{u.key}">
					<Avatar name={u.name} src={u.avatar} size={24} />
					<span class="pb-pname-text">{u.name}</span>
				</a>
				<span class="urec">
					<span class="pb-num pb-muted">{u.picks} M</span>
					<span class="pb-num">{@render wdl(u)}</span>
				</span>
				{#if u.mirrors}<span class="mirror">· {u.mirrors} mirror</span>{/if}
			</li>
		{/each}
	</ul>
{/snippet}

<svelte:head>
	<title>Legends · {season.name} · Poroleague</title>
</svelte:head>

<div class="page">
	<div class="intro">
		<span class="eyebrow"
			>{season.name}{#if data.week}
				· week {data.week.week} of {data.week.weeks}{/if}</span
		>
		<h1>Legends</h1>
		<p class="muted">
			Win rates show once a legend has 5+ matches. Mirror matches count as picks, not wins.
		</p>
	</div>

	{#if !data.rows.length}
		<div class="empty">
			<strong>No results yet.</strong>
			<span class="muted">Legend stats appear after the first reported match.</span>
			<a href="/seasons/{season.slug}/schedule">See the schedule</a>
		</div>
	{:else}
		<div class="table-wrap">
			<table class="lt" id="legends">
				<thead>
					<tr>
						{#each COLS as c (c.key)}
							<th
								scope="col"
								class={[c.key === 'legend' && 'l']}
								aria-sort={c.key === data.sort
									? data.dir === 'asc'
										? 'ascending'
										: 'descending'
									: undefined}
							>
								<a
									class="sortb"
									href={sortHref(c.key)}
									title={'title' in c ? c.title : undefined}
									data-on={c.key === data.sort}
									data-sveltekit-reset="false"
									>{c.label}<span class="arrow" aria-hidden="true"
										>{c.key === data.sort ? (data.dir === 'asc' ? '↑' : '↓') : ''}</span
									></a
								>
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each data.rows as r, i (r.key)}
						<tr class={[i % 2 && 'pb-stripe']}>
							<th scope="row" class="l">
								<a
									class="pb-disclosure"
									href={toggleHref(r.key)}
									aria-expanded={data.open === r.key}
									data-sveltekit-reset="false"
								>
									{@render chev()}{r.key}
								</a>
							</th>
							<td class="num">
								<span class="picks"
									><span class="track" aria-hidden="true"
										><span class="fill" style={bar(r)}></span></span
									><span class="n">{r.picks}</span></span
								>
							</td>
							<td class="num">{r.players.size}</td>
							<td class="num">{@render wdl(r)}</td>
							<td class="num">{@render rate(matchWinPct(r))}</td>
							<td class="num">{@render rate(gameWinPct(r))}</td>
						</tr>
						{#if data.open === r.key}
							<tr class="sub">
								<td colspan="6"><div class="pb-disclosure-body">{@render users(r.key)}</div></td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Phones: one card per legend, sorted through a select. -->
		<div class="cards-m">
			<form method="GET" class="pb-field" data-sveltekit-reset="false">
				<label for="sort">Sort by</label>
				<select
					id="sort"
					name="sort"
					class="pb-input pb-select"
					onchange={(e) => e.currentTarget.form?.requestSubmit()}
				>
					{#each SORT_OPTIONS as [key, label] (key)}
						<option value={key} selected={key === data.sort}>{label}</option>
					{/each}
				</select>
				{#if data.open}<input type="hidden" name="legend" value={data.open} />{/if}
				<noscript><button class="pb-btn pb-btn-secondary pb-btn-sm">Sort</button></noscript>
			</form>
			<ul class="lcards" aria-label="Legends">
				{#each data.rows as r (r.key)}
					<li>
						<a
							class="lc"
							href={toggleHref(r.key)}
							aria-expanded={data.open === r.key}
							data-sveltekit-reset="false"
						>
							<span class="lc-head">
								<span class="pb-disclosure">{@render chev()}{r.key}</span>
								<span class="pb-num">{r.picks} <span class="pb-muted unit">picks</span></span>
							</span>
							<span class="track wide" aria-hidden="true"
								><span class="fill" style={bar(r)}></span></span
							>
							<span class="lc-stats">
								<span><span class="k" title={COLS[3].title}>W–D–L</span>{@render wdl(r)}</span>
								<span
									><span class="k">Match win</span><span class="pb-num"
										>{@render rate(matchWinPct(r))}</span
									></span
								>
								<span
									><span class="k">Game win</span><span class="pb-num"
										>{@render rate(gameWinPct(r))}</span
									></span
								>
							</span>
						</a>
						{#if data.open === r.key}
							<div class="lc-body">{@render users(r.key)}</div>
						{/if}
					</li>
				{/each}
			</ul>
		</div>

		<p class="muted small">
			{data.rows.reduce((s, r) => s + r.picks, 0)} picks from {data.matches} reported matches. Void matches
			and deadline double losses are left out. W–D–L leaves out mirror matches.
		</p>
	{/if}

	{#if data.notPicked.length}
		<details class="not-picked">
			<summary>Not picked yet · {data.notPicked.length}</summary>
			<div>
				{#each data.notPicked as l (l)}<span class="pb-badge">{l}</span>{/each}
			</div>
		</details>
	{/if}
</div>

<style>
	.intro {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.intro h1,
	.intro p {
		margin: 0;
	}
	.table-wrap {
		background: var(--surface-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		overflow-x: auto;
	}
	.lt {
		width: 100%;
		border-collapse: collapse;
		font-size: 15px;
		line-height: 20px;
	}
	.lt th,
	.lt td {
		padding: 12px 16px;
		border-bottom: 1px solid var(--line);
		text-align: right;
		vertical-align: middle;
	}
	.lt thead th {
		padding: 0;
	}
	.lt .l {
		text-align: left;
	}
	.num {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.sortb {
		display: flex;
		gap: 6px;
		align-items: center;
		justify-content: flex-end;
		padding: 12px 16px;
		font: 600 12px/16px var(--font-sans);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-muted);
		text-decoration: none;
		white-space: nowrap;
	}
	.sortb:hover,
	.sortb[data-on='true'] {
		color: var(--ink);
	}
	.l .sortb {
		justify-content: flex-start;
	}
	.arrow {
		font-family: var(--font-mono);
		width: 10px;
	}
	.picks {
		display: inline-flex;
		align-items: center;
		gap: 10px;
	}
	.picks .n {
		min-width: 2ch;
	}
	.track {
		display: inline-block;
		width: 72px;
		height: 6px;
		border-radius: var(--radius-pill);
		background: var(--surface);
		overflow: hidden;
	}
	.track.wide {
		display: block;
		width: auto;
	}
	.fill {
		display: block;
		height: 100%;
		border-radius: var(--radius-pill);
		background: var(--frost);
	}
	.wdl {
		font-family: var(--font-mono);
		white-space: nowrap;
	}
	.win {
		color: var(--accent);
	}
	.loss {
		color: var(--brand);
	}
	.sub td {
		background: var(--surface);
		padding: 0 16px;
	}
	.ulist {
		list-style: none;
		margin: 0;
		padding: 8px 0 12px;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 4px 24px;
		text-align: left;
	}
	.ulist li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 0;
		font-size: 14px;
		min-width: 0;
	}
	.urec {
		margin-left: auto;
		display: inline-flex;
		gap: 12px;
		align-items: baseline;
	}
	.mirror {
		font-size: 12px;
		color: var(--ink-muted);
		white-space: nowrap;
	}
	.cards-m {
		display: none;
		flex-direction: column;
		gap: 16px;
	}
	.lcards {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.lcards > li {
		background: var(--surface-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
	}
	.lc {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px 16px;
		color: var(--ink);
		text-decoration: none;
	}
	.lc:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
		border-radius: var(--radius-md);
	}
	.lc[aria-expanded='true'] .pb-disclosure-chev {
		transform: rotate(90deg);
	}
	.lc-head {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 16px;
	}
	.lc-head .pb-num {
		margin-left: auto;
		font-size: 15px;
	}
	.unit {
		font: 13px var(--font-sans);
	}
	.lc-stats {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
		font-size: 15px;
	}
	.lc-stats > span {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.k {
		font: 600 11px/16px var(--font-sans);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}
	.lc-body {
		border-top: 1px solid var(--line);
		padding: 4px 16px 10px 38px;
	}
	.lc-body .ulist {
		grid-template-columns: 1fr;
		gap: 0;
		padding: 0;
	}
	.lc-body .urec > .pb-muted,
	.lc-body .mirror {
		display: none;
	}
	.not-picked {
		font-size: 14px;
	}
	.not-picked summary {
		cursor: pointer;
		color: var(--ink-muted);
		font-weight: 500;
		padding: 4px 0;
	}
	.not-picked div {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding-top: 10px;
	}
	@media (max-width: 600px) {
		.table-wrap {
			display: none;
		}
		.cards-m {
			display: flex;
		}
	}
</style>
