<script lang="ts">
	import AchIcon from '#lib/components/AchIcon.svelte';
	import { date } from '#lib/format.ts';
	import type { Career, OneView, TrackView } from '#lib/server/achievements.ts';

	// `all` lists every legend track; otherwise the list stops at LIMIT with a link to the rest.
	let { data, all = false }: { data: Career; all?: boolean } = $props();
	const LIMIT = 5;
	const cut = $derived(!all && data.legends.length > LIMIT);
	const legends = $derived(cut ? data.legends.slice(0, LIMIT) : data.legends);
</script>

{#snippet track(t: TrackView)}
	{@const got = t.tiers.filter((x) => x.earned).length}
	<details class={['pb-achrow', 'pb-achrow-track', !t.next && 'is-complete']}>
		<summary class="pb-achrow-main">
			<AchIcon kind={t.kind} icon={t.icon} tier={t.tier} locked={!t.tier} />
			<span class="pb-achrow-tx">
				<span class="pb-achrow-nm">{t.name}</span>
				<span class="pb-pips"
					>{#each t.tiers as x (x.id)}<span
							class={['pb-pip', x.earned && `is-on pb-tier-${x.tier}`]}
							aria-hidden="true"
						></span>{/each}</span
				>
				<span class="pb-sr">{got} of {t.tiers.length} tiers earned.</span>
			</span>
			<span class="pb-achrow-prog"
				>{#if t.next}{t.next.have}/{t.next.need}<span class="pb-sr">{' to '}{t.next.name}</span
					>{:else}Complete{/if}</span
			>
			<svg
				class="pb-achrow-chev"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg
			>
		</summary>
		<ol class="pb-achrow-tiers">
			{#each t.tiers as x (x.id)}
				<li class={[x.earned && 'is-earned']}>
					<span class={['pb-pip', x.earned && `is-on pb-tier-${x.tier}`]} aria-hidden="true"></span>
					<span class="pb-achrow-tn">{x.name}</span>
					<span class="pb-achrow-dt">{x.earned ? date(x.earned) : 'Locked'}</span>
					<span class="pb-achrow-req">{x.description}</span>
				</li>
			{/each}
		</ol>
	</details>
{/snippet}

{#snippet one(o: OneView)}
	<div class={['pb-achrow', 'pb-achrow-one', !o.earned && 'is-locked']}>
		<div class="pb-achrow-main">
			<AchIcon kind="item" icon={o.icon} locked={!o.earned} />
			<span class="pb-achrow-tx">
				<span class="pb-achrow-nm">{o.name}</span>
				<span class="pb-achrow-ds">{o.description}</span>
			</span>
			<span class="pb-achrow-dt">{o.earned ? date(o.earned) : 'Locked'}</span>
		</div>
	</div>
{/snippet}

<section id="achievements" aria-labelledby="ach-h">
	<div class="head">
		<h2 id="ach-h">Achievements</h2>
		<span class="muted small">{data.earned} earned</span>
	</div>
	<div class="cols">
		<div class="col">
			<h3 class="eyebrow">Legends</h3>
			{#if legends.length}
				<div class="panel pb-achrows">
					<ul aria-label="Legend tracks">
						{#each legends as t (t.track)}<li>{@render track(t)}</li>{/each}
					</ul>
					{#if cut}
						<a class="pb-achrows-more" href="?all#achievements">Show all {data.legends.length}</a>
					{:else if all && data.legends.length > LIMIT}
						<a class="pb-achrows-more" href="?#achievements">Show fewer</a>
					{/if}
				</div>
			{:else}
				<p class="empty">A legend track starts with the first match played as that legend.</p>
			{/if}
			<h3 class="eyebrow">League</h3>
			<div class="panel pb-achrows">
				<ul aria-label="League tracks">
					{#each data.league as t (t.track)}<li>{@render track(t)}</li>{/each}
				</ul>
			</div>
		</div>
		<div class="col">
			<h3 class="eyebrow">One-offs</h3>
			<div class="panel pb-achrows">
				<ul aria-label="One-offs">
					{#each data.ones as o (o.id)}<li>{@render one(o)}</li>{/each}
				</ul>
			</div>
		</div>
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
	.cols {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
		gap: 16px 24px;
		align-items: start;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	h3 {
		margin: 0;
	}
	.panel + h3 {
		margin-top: 8px;
	}
	.panel {
		padding: 0;
		overflow: hidden;
	}
	/* The design system styles the "more" control as a button; here it is a link, so it works without JavaScript. */
	a.pb-achrows-more {
		display: flex;
		align-items: center;
		box-sizing: border-box;
		text-decoration: none;
	}
</style>
