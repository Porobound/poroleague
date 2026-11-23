<script lang="ts">
	import Medal from '#lib/components/Medal.svelte';
	import { date } from '#lib/format.ts';
	import { RANK_NAME } from '#lib/league/ranks.ts';
	import type { AchievementView, Career, MasteryView } from '#lib/server/achievements.ts';

	// Achievements and legend mastery, a tab each, ten rows a page. Achievements: earned first,
	// then what is under way, then locked. Mastery: every legend, most played first or by name.
	// The tabs, the filter, the sort and the pages are links, so it all works without JavaScript.
	let {
		data,
		tab = 'achievements',
		show = 'all',
		sort = 'played',
		page = 1
	}: {
		data: Career;
		tab?: 'achievements' | 'mastery';
		show?: 'all' | 'earned' | 'locked';
		sort?: 'played' | 'name';
		page?: number;
	} = $props();
	const PER = 10;
	const TAB = { achievements: 'Achievements', mastery: 'Mastery' } as const;
	const SHOW = { all: 'All', earned: 'Earned', locked: 'Locked' } as const;
	const SORT = { played: 'Most played', name: 'Name' } as const;
	const keep = <T,>(list: T[], got: (x: T) => boolean) =>
		list.filter((x) => show === 'all' || (show === 'earned') === got(x));
	const achievements = $derived(keep(data.list, (a) => !!a.earned));
	const legends = $derived(
		keep(
			sort === 'name'
				? data.legends.toSorted((a, b) => a.legend.localeCompare(b.legend))
				: data.legends,
			(m) => !!m.rank
		)
	);
	const count = $derived(tab === 'mastery' ? legends.length : achievements.length);
	const pages = $derived(Math.max(1, Math.ceil(count / PER)));
	const at = $derived(Math.min(page, pages));
	const slice = <T,>(list: T[]) => list.slice((at - 1) * PER, at * PER);
	const ranked = $derived(data.legends.filter((m) => m.rank).length);
	// A link that keeps the rest of the state: only what differs from the default is in the URL.
	const href = (o: { tab?: string; show?: string; sort?: string; page?: number }) => {
		const s = { tab, show, sort, page: at, ...o };
		const q = new URLSearchParams();
		if (s.tab !== 'achievements') q.set('tab', s.tab);
		if (s.show !== 'all') q.set('show', s.show);
		if (s.tab === 'mastery' && s.sort !== 'played') q.set('sort', s.sort);
		if (s.page > 1) q.set('page', String(s.page));
		return `?${q}#achievements`;
	};
</script>

{#snippet achievement(a: AchievementView)}
	<div class={['pb-achrow', 'pb-achrow-one', 'pb-achrow-ach', !a.earned && 'is-locked']}>
		<div class="pb-achrow-main">
			<Medal icon={a.icon} rank={a.earned ? a.rank : null} size={36} />
			<span class="pb-achrow-tx">
				<span class="pb-achrow-nm"
					><span>{a.name}</span><span class="pb-achrow-rank">{RANK_NAME[a.rank]}</span
					>{#if a.levels > 1}<span class="pb-sr">{' '}Level {a.level} of {a.levels}.</span
						>{/if}</span
				>
				<span class="pb-achrow-ds">{a.description}</span>
				{#if a.next && a.next.need > 1}
					<span class="pb-achprog">
						<span class="pb-achbar" aria-hidden="true"
							><i style:width="{Math.min(100, (a.next.have / a.next.need) * 100)}%"></i></span
						>
						<span>{a.next.have}/{a.next.need}<span class="pb-sr">{' to '}{a.next.name}</span></span>
					</span>
				{/if}
			</span>
			<span class="pb-achwhen">
				{#if a.earned}
					{#if a.season}<a href="/seasons/{a.season.slug}">{a.season.name}</a>{/if}
					<span>{date(a.earned)}</span>
				{:else}Locked{/if}
			</span>
		</div>
	</div>
{/snippet}

{#snippet legend(m: MasteryView)}
	<div class={['pb-achrow', 'pb-achrow-one', 'pb-achrow-ach', !m.rank && 'is-locked']}>
		<div class="pb-achrow-main">
			<Medal icon={m.icon} rank={m.rank} size={36} />
			<span class="pb-achrow-tx">
				<span class="pb-achrow-nm"
					><span>{m.legend}</span><span class="pb-achrow-rank"
						>{m.rank ? RANK_NAME[m.rank] : 'Unranked'}</span
					></span
				>
				<span class="pb-achrow-ds">{m.matches} {m.matches === 1 ? 'match' : 'matches'}</span>
				{#if m.next}
					<span class="pb-achprog">
						<span class="pb-achbar" aria-hidden="true"
							><i style:width="{Math.min(100, (m.matches / m.next.need) * 100)}%"></i></span
						>
						<span
							>{m.matches}/{m.next.need}<span class="pb-sr">{' to '}{RANK_NAME[m.next.rank]}</span
							></span
						>
					</span>
				{/if}
			</span>
			<span class="pb-achwhen">
				{#if m.earned}
					{#if m.season}<a href="/seasons/{m.season.slug}">{m.season.name}</a>{/if}
					<span>{date(m.earned)}</span>
				{/if}
			</span>
		</div>
	</div>
{/snippet}

<section id="achievements" aria-labelledby="ach-h">
	<div class="head">
		<h2 id="ach-h">Achievements</h2>
		<span class="muted small"
			>{#if tab === 'mastery'}{ranked} of {data.legends.length} legends ranked{:else}{data.earned}
				of {data.total} earned{/if}</span
		>
	</div>
	<nav class="pb-achtabs" aria-label="Achievements and mastery">
		{#each ['achievements', 'mastery'] as const as t (t)}
			<a
				href={href({ tab: t, show: 'all', sort: 'played', page: 1 })}
				aria-current={tab === t ? 'true' : undefined}>{TAB[t]}</a
			>
		{/each}
	</nav>
	<div class="pb-achbar" aria-hidden="true">
		<i
			style:width="{(tab === 'mastery' ? ranked / data.legends.length : data.earned / data.total) *
				100}%"
		></i>
	</div>
	<div class="controls">
		<nav class="pb-achnav" aria-label="Show">
			{#each ['all', 'earned', 'locked'] as const as s (s)}
				<a href={href({ show: s, page: 1 })} aria-current={show === s ? 'true' : undefined}
					>{tab === 'mastery' && s !== 'all'
						? s === 'earned'
							? 'Ranked'
							: 'Unranked'
						: SHOW[s]}</a
				>
			{/each}
		</nav>
		{#if tab === 'mastery'}
			<nav class="pb-achnav" aria-label="Sort legends">
				{#each ['played', 'name'] as const as s (s)}
					<a href={href({ sort: s, page: 1 })} aria-current={sort === s ? 'true' : undefined}
						>{SORT[s]}</a
					>
				{/each}
			</nav>
		{/if}
	</div>
	<div class="panel pb-achrows">
		{#if !count}
			<p class="empty">Nothing here yet.</p>
		{:else if tab === 'mastery'}
			<ul aria-label="Legend mastery">
				{#each slice(legends) as m (m.legend)}<li>{@render legend(m)}</li>{/each}
			</ul>
		{:else}
			<ul aria-label="Achievements">
				{#each slice(achievements) as a (a.key)}<li>{@render achievement(a)}</li>{/each}
			</ul>
		{/if}
		{#if pages > 1}
			<nav class="pb-achnav pb-achpager" aria-label="Pages">
				<span class="muted small">{(at - 1) * PER + 1}–{Math.min(at * PER, count)} of {count}</span>
				<span>
					{#if at > 1}<a href={href({ page: at - 1 })} rel="prev">Previous</a>{/if}
					{#each { length: pages } as _, i (i)}
						<a href={href({ page: i + 1 })} aria-current={at === i + 1 ? 'page' : undefined}
							><span class="pb-sr">Page </span>{i + 1}</a
						>
					{/each}
					{#if at < pages}<a href={href({ page: at + 1 })} rel="next">Next</a>{/if}
				</span>
			</nav>
		{/if}
	</div>
</section>

<style>
	section {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 4px 16px;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 8px 16px;
	}
	.panel {
		padding: 0;
		overflow: hidden;
	}
	.panel > .empty {
		margin: 0;
		padding: 14px;
	}
</style>
