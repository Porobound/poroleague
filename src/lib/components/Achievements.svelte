<script lang="ts">
	import { date } from '#lib/format.ts';
	import type { Career, Tile, TrackView } from '#lib/server/achievements.ts';

	let { data }: { data: Career } = $props();
	const TIER = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' } as const;
</script>

{#snippet tile(t: Tile)}
	<div class="tile" data-state={t.earned ? 'earned' : 'locked'} data-tier={t.tier}>
		<span class="ico">
			<img
				src={t.icon}
				alt=""
				width="48"
				height="48"
				class={[t.crest ? 'champ' : t.tier && 'emblem']}
			/>
			{#if t.crest}<img class="crest" src={t.crest} alt="" width="20" height="15" />{/if}
		</span>
		<span class="tx">
			<span class="tier">{t.tier ? TIER[t.tier] : 'One-off'}</span>
			<span class="nm">{t.name}</span>
			<span class="pb-sr">{t.earned ? 'Earned.' : 'Locked.'}</span>
			<span class="ds">{t.description}</span>
			{#if t.earned}
				<span class="dt">Earned {date(t.earned)}</span>
			{:else}
				<span class="prog">
					<span
						class="bar"
						role="progressbar"
						aria-label="{t.name} progress"
						aria-valuemin="0"
						aria-valuemax={t.need}
						aria-valuenow={t.have}><span style:width="{(t.have / t.need) * 100}%"></span></span
					>
					<span class="cnt">{t.have}/{t.need}</span>
				</span>
			{/if}
		</span>
	</div>
{/snippet}

{#snippet track(tr: TrackView)}
	<div class="track" role="group" aria-label={tr.title}>
		<div class="track-h">
			<span class="track-t">{tr.title}</span>
			<span class="track-c">{tr.tiles.filter((t) => t.earned).length} of {tr.tiles.length}</span>
		</div>
		<ol class="steps">
			{#each tr.tiles as t (t.id)}<li>{@render tile(t)}</li>{/each}
		</ol>
	</div>
{/snippet}

<section class="ach" aria-labelledby="ach-h">
	<div class="ach-head">
		<h2 id="ach-h">Achievements</h2>
		<span class="muted small">{data.earned} earned</span>
	</div>
	<h3 class="eyebrow">Legend tracks</h3>
	{#if data.legends.length}
		<div class="tracks">
			{#each data.legends as tr (tr.track)}{@render track(tr)}{/each}
		</div>
	{:else}
		<p class="empty">A legend track starts with the first match played as that legend.</p>
	{/if}
	<h3 class="eyebrow">League tracks</h3>
	<div class="tracks">
		{#each data.tracks as tr (tr.track)}{@render track(tr)}{/each}
	</div>
	<h3 class="eyebrow">One-offs</h3>
	<ul class="ones">
		{#each data.ones as t (t.id)}<li>{@render tile(t)}</li>{/each}
	</ul>
</section>

<style>
	.ach {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.ach-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 4px 16px;
	}
	h3 {
		margin: 4px 0 0;
	}
	ol,
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.tracks {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 480px), 1fr));
		gap: 16px;
	}
	.track {
		background: var(--surface-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		min-width: 0;
	}
	.track-h {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 14px 16px 0;
	}
	.track-t {
		font: 600 17px/24px var(--font-display);
	}
	.track-c {
		margin-left: auto;
		font: 500 13px/18px var(--font-mono);
		color: var(--ink-muted);
		white-space: nowrap;
	}
	.steps {
		display: flex;
		gap: 8px;
		padding: 12px 16px 16px;
	}
	.steps > li {
		flex: 1 1 0;
		min-width: 0;
		display: flex;
	}
	.ones {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
		gap: 16px;
	}
	.tile {
		--tier: var(--accent);
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
		padding: 12px;
		border-radius: var(--radius-md);
		background: var(--surface);
	}
	.tile[data-tier='bronze'] {
		--tier: var(--tier-bronze);
	}
	.tile[data-tier='silver'] {
		--tier: var(--tier-silver);
	}
	.tile[data-tier='gold'] {
		--tier: var(--tier-gold);
	}
	.ones .tile {
		height: 100%;
		box-sizing: border-box;
		flex-direction: row;
		align-items: center;
		gap: 12px;
		padding: 14px 16px;
		background: var(--surface-raised);
		border: 1px solid var(--line);
	}
	.ico {
		flex: none;
		position: relative;
		width: 48px;
		height: 48px;
	}
	.ico > img:first-child {
		width: 48px;
		height: 48px;
		box-sizing: border-box;
		border-radius: var(--radius-md);
	}
	/* Rank emblems are a small crest in the middle of a 1280×720 canvas: zoom in on the crest. */
	.ico:has(.emblem) {
		overflow: hidden;
	}
	.ico > img.emblem {
		position: absolute;
		left: -86px;
		top: -34px;
		width: 220px;
		height: auto;
		max-width: none;
		border-radius: 0;
	}
	.champ {
		border: 2px solid var(--tier);
	}
	.crest {
		position: absolute;
		right: -6px;
		bottom: -4px;
		height: auto;
	}
	.tx {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.tier {
		font: 600 11px/16px var(--font-sans);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--tier);
	}
	.nm {
		font-weight: 600;
		font-size: 15px;
		line-height: 20px;
	}
	.ds {
		font-size: 13px;
		line-height: 18px;
		color: var(--ink-muted);
	}
	.dt {
		margin-top: 2px;
		font-size: 12px;
		line-height: 16px;
		color: var(--ink-muted);
	}
	.prog {
		align-self: stretch;
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 4px;
	}
	.bar {
		flex: 1;
		display: block;
		min-width: 40px;
		height: 6px;
		border-radius: var(--radius-pill);
		background: var(--line);
		overflow: hidden;
	}
	.bar > span {
		display: block;
		height: 100%;
		background: var(--ink-muted);
		border-radius: inherit;
	}
	.cnt {
		font: 500 12px/16px var(--font-mono);
		color: var(--ink-muted);
		white-space: nowrap;
	}
	[data-state='locked'] .ico {
		filter: grayscale(1);
		opacity: 0.55;
	}
	[data-state='locked'] :is(.nm, .tier) {
		color: var(--ink-muted);
	}
	[data-state='locked'] .champ {
		border-color: var(--line);
	}
	/* Phones: a track's tiers stack as a list (MobileCareer board). */
	@media (max-width: 640px) {
		.steps {
			flex-direction: column;
			gap: 0;
			padding: 8px 16px 12px;
		}
		.steps .tile {
			flex-direction: row;
			gap: 12px;
			padding: 8px 0;
			background: none;
		}
	}
</style>
