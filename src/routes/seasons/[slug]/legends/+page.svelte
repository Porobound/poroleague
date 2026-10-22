<script lang="ts">
	import { pct } from '#lib/format.ts';
	import { gameWinPct, matchWinPct } from '#lib/league/legendStats.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const season = $derived(data.season);
	const COLS = [
		['legend', 'Legend'],
		['picks', 'Picks'],
		['players', 'Players'],
		['', 'W–D–L'],
		['mw', 'Match win %'],
		['gw', 'Game win %']
	] as const;
	const href = (sort: string, legend: string | null) =>
		`?sort=${sort}${legend ? `&legend=${encodeURIComponent(legend)}` : ''}`;
</script>

<svelte:head>
	<title>Legends · {season.name} · Poroleague</title>
</svelte:head>

<div class="page">
	<span class="eyebrow">{season.name}</span>
	<h1>Legends</h1>
	<p class="muted">
		Win rates show once a legend has 5+ matches. Mirror matches count as picks, not wins.
	</p>

	{#if !data.rows.length}
		<div class="status">
			<strong>No results yet.</strong> Legend stats appear after the first reported match.
			<a href="/seasons/{season.slug}/schedule">See the schedule</a>
		</div>
	{:else}
		<div class="panel standings">
			<table class="pb-table">
				<thead>
					<tr>
						{#each COLS as [key, label] (label)}
							<th
								class={[key !== 'legend' && 'pb-num']}
								aria-sort={key === data.sort
									? key === 'legend'
										? 'ascending'
										: 'descending'
									: undefined}
							>
								{#if key}<a href={href(key, data.open)}>{label}</a>{:else}{label}{/if}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each data.rows as r (r.key)}
						<tr>
							<th scope="row">
								<a
									href={href(data.sort, data.open === r.key ? null : r.key)}
									aria-expanded={data.open === r.key}
								>
									{r.key}
								</a>
							</th>
							<td class="pb-num">{r.picks}</td>
							<td class="pb-num">{r.players.size}</td>
							<td class="pb-num">{r.wins}–{r.draws}–{r.losses}</td>
							<td class="pb-num">{pct(matchWinPct(r))}</td>
							<td class="pb-num">{pct(gameWinPct(r))}</td>
						</tr>
						{#if data.open === r.key}
							<tr>
								<td colspan="6">
									<ul class="player-list" aria-label="Players who used {r.key}">
										{#each data.users as u (u.key)}
											<li>
												<a class="grow" href="/seasons/{season.slug}/players/{u.key}">{u.name}</a>
												<span class="pb-num muted">{u.picks} M</span>
												<span class="pb-num">{u.wins}–{u.draws}–{u.losses}</span>
												{#if u.mirrors}<span class="muted small">· {u.mirrors} mirror</span>{/if}
											</li>
										{/each}
									</ul>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
		<p class="muted small">
			{data.rows.reduce((s, r) => s + r.picks, 0)} picks from {data.matches} reported matches. Void matches
			and deadline double losses are left out. W–D–L leaves out mirror matches.
		</p>
	{/if}

	{#if data.notPicked.length}
		<details>
			<summary>Not picked yet · {data.notPicked.length}</summary>
			<p>
				{#each data.notPicked as l (l)}<span class="pb-badge">{l}</span>
				{/each}
			</p>
		</details>
	{/if}
</div>
