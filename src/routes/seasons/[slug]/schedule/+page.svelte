<script lang="ts">
	import { page } from '$app/state';
	import { centerCurrent } from '#lib/attach.ts';
	import MatchRows from '#lib/components/MatchRows.svelte';
	import { date, tzName } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const season = $derived(data.season);
	const q = (key: string, value: string | number | null) => {
		const u = new URLSearchParams(page.url.search);
		if (value === null) u.delete(key);
		else u.set(key, String(value));
		return `?${u}`;
	};
	const shown = $derived(data.sections.filter((s) => s.cards.length));
</script>

<svelte:head>
	<title>Schedule · {season.name} · Poroleague</title>
</svelte:head>

<div class="page">
	<span class="eyebrow">
		{season.name} · {season.roundsPerWeek} rounds a week · season ends {date(season.deadline)} 23:59
		{season.deadline ? tzName(season.deadline) : ''}
	</span>
	<h1>Schedule</h1>

	{#if !data.weeks.length}
		<p class="empty">The schedule appears once the groups are locked.</p>
	{:else}
		<div class="toolbar">
			<nav aria-label="Weeks" class="seg weeks" {@attach centerCurrent}>
				{#each data.weeks as w (w.n)}
					<a href={q('week', w.n)} aria-current={w.n === data.week ? 'true' : undefined}>
						{w.label}{w.n === data.currentWeek ? ' (now)' : ''}
					</a>
				{/each}
			</nav>
			<div class="seg filters" role="group" aria-label="Filter">
				{#if data.groups.length > 1}
					<a href={q('group', null)} aria-current={!data.group ? 'true' : undefined}>All groups</a>
					{#each data.groups as g (g.n)}
						<a href={q('group', g.n)} aria-current={data.group === g.n ? 'true' : undefined}
							>{g.label}</a
						>
					{/each}
				{/if}
				{#if data.user}
					<a
						href={q('mine', data.mine ? null : '1')}
						class="mine"
						aria-current={data.mine ? 'true' : undefined}
					>
						Only my matches
					</a>
				{/if}
			</div>
		</div>

		{#if data.overdue.length}
			<div class="rounds">
				<section class="panel rows overdue" aria-label="Overdue from earlier weeks">
					<div class="rows-head">
						<h2>Overdue</h2>
						<span class="muted small">From earlier weeks · still reportable</span>
					</div>
					<MatchRows cards={data.overdue} label="Overdue from earlier weeks" />
				</section>
			</div>
		{/if}

		{#if data.week > data.published}
			<p class="empty">Week {data.week} pairings aren't out yet. They're posted week by week.</p>
		{:else if shown.length}
			<div class="rounds">
				{#each shown as s (s.title)}
					<section class="panel rows" aria-label={s.title}>
						<div class="rows-head">
							<h2>{s.title}</h2>
							<span class="muted small"
								><span class="pb-num">{s.done}</span> of <span class="pb-num">{s.total}</span> played</span
							>
						</div>
						<MatchRows cards={s.cards} label={s.title} />
					</section>
				{/each}
			</div>
		{:else}
			<p class="empty">No matches for you in this view.</p>
		{/if}
	{/if}
</div>
