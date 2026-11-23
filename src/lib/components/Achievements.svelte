<script lang="ts">
	import Medal from '#lib/components/Medal.svelte';
	import { date } from '#lib/format.ts';
	import { RANK_NAME } from '#lib/league/ranks.ts';
	import type { AchievementView, Career, MasteryView } from '#lib/server/achievements.ts';

	// The achievement list: earned first, then what is under way, then locked, ten a page. The
	// filter and the pages are links, so it works without JavaScript. `all` lists every legend
	// played; otherwise that list stops at LIMIT with a link to the rest.
	let {
		data,
		show = 'all',
		page = 1,
		all = false
	}: { data: Career; show?: 'all' | 'earned' | 'locked'; page?: number; all?: boolean } = $props();
	const PER = 10;
	const LIMIT = 5;
	const SHOW = { all: 'All', earned: 'Earned', locked: 'Locked' } as const;
	const rows = $derived(
		data.list.filter((a) => show === 'all' || (show === 'earned') === !!a.earned)
	);
	const pages = $derived(Math.max(1, Math.ceil(rows.length / PER)));
	const at = $derived(Math.min(page, pages));
	const shown = $derived(rows.slice((at - 1) * PER, at * PER));
	const cut = $derived(!all && data.legends.length > LIMIT);
	const legends = $derived(cut ? data.legends.slice(0, LIMIT) : data.legends);
	// A link that keeps the rest of the state: only what differs from the default is in the URL.
	const href = (o: { show?: string; page?: number; all?: boolean }) => {
		const s = { show, page: at, all, ...o };
		const q = new URLSearchParams();
		if (s.show !== 'all') q.set('show', s.show);
		if (s.page > 1) q.set('page', String(s.page));
		if (s.all) q.set('all', '');
		return `?${q}#achievements`.replace('all=', 'all');
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
	<div class={['pb-achrow', 'pb-achrow-one', !m.rank && 'is-locked']}>
		<div class="pb-achrow-main">
			<Medal icon={m.icon} rank={m.rank} size={36} />
			<span class="pb-achrow-tx">
				<span class="pb-achrow-nm">{m.legend}</span>
				<span class="pb-achrow-ds"
					>{m.rank ? RANK_NAME[m.rank] : 'Unranked'} · {m.matches}
					{m.matches === 1 ? 'match' : 'matches'}</span
				>
			</span>
			<span class="pb-achrow-prog"
				>{#if m.next}{m.matches}/{m.next.need}<span class="pb-sr"
						>{' to '}{RANK_NAME[m.next.rank]}</span
					>{:else}Top rank{/if}</span
			>
		</div>
	</div>
{/snippet}

<section id="achievements" aria-labelledby="ach-h">
	<div class="head">
		<h2 id="ach-h">Achievements</h2>
		<span class="muted small">{data.earned} of {data.total} earned</span>
	</div>
	<div class="pb-achbar" aria-hidden="true">
		<i style:width="{(data.earned / data.total) * 100}%"></i>
	</div>
	<nav class="pb-achnav" aria-label="Show achievements">
		{#each ['all', 'earned', 'locked'] as const as s (s)}
			<a href={href({ show: s, page: 1 })} aria-current={show === s ? 'true' : undefined}
				>{SHOW[s]}</a
			>
		{/each}
	</nav>
	<div class="panel pb-achrows">
		{#if shown.length}
			<ul aria-label="Achievements">
				{#each shown as a (a.key)}<li>{@render achievement(a)}</li>{/each}
			</ul>
		{:else}
			<p class="empty">{show === 'earned' ? 'Nothing earned yet.' : 'Nothing left to earn.'}</p>
		{/if}
		{#if pages > 1}
			<nav class="pb-achnav pb-achpager" aria-label="Achievement pages">
				<span class="muted small"
					>{(at - 1) * PER + 1}–{(at - 1) * PER + shown.length} of {rows.length}</span
				>
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
	<h3 class="eyebrow">Mastery</h3>
	{#if legends.length}
		<div class="panel pb-achrows">
			<ul aria-label="Legend mastery">
				{#each legends as m (m.legend)}<li>{@render legend(m)}</li>{/each}
			</ul>
			{#if cut}
				<a class="pb-achrows-more" href={href({ all: true })}>Show all {data.legends.length}</a>
			{:else if all && data.legends.length > LIMIT}
				<a class="pb-achrows-more" href={href({ all: false })}>Show fewer</a>
			{/if}
		</div>
	{:else}
		<p class="empty">Mastery starts with the first match played as a legend.</p>
	{/if}
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
	h3 {
		margin: 8px 0 0;
	}
	.panel {
		padding: 0;
		overflow: hidden;
	}
	.panel > .empty {
		margin: 0;
		padding: 14px;
	}
	/* The design system styles the "more" control as a button; here it is a link, so it works without JavaScript. */
	a.pb-achrows-more {
		display: flex;
		align-items: center;
		box-sizing: border-box;
		text-decoration: none;
	}
</style>
