<script lang="ts">
	import MedalTip from '#lib/components/MedalTip.svelte';
	import type { Showcase } from '#lib/server/achievements.ts';

	// A player's best achievements and legends, a row each, highest rank first. Each row ends in a
	// link to the whole list on the career page. A row with nothing earned is left out.
	let { data, id }: { data: Showcase; id: string } = $props();
	const rows = $derived(
		[
			{
				name: 'Achievements',
				what: 'Achievement',
				medals: data.achievements,
				more: data.moreAchievements,
				href: `/players/${id}#achievements`
			},
			{
				name: 'Mastery',
				what: 'Mastery',
				medals: data.mastery,
				more: data.moreMastery,
				href: `/players/${id}?tab=mastery#achievements`
			}
		].filter((r) => r.medals.length)
	);
</script>

{#if rows.length}
	<section class="panel showcase" aria-labelledby="showcase-h">
		<h2 id="showcase-h" class="pb-sr">Achievements and mastery</h2>
		{#each rows as r (r.name)}
			<div class="line">
				<a class="eyebrow" href={r.href}>{r.name}</a>
				<ul aria-label={r.name}>
					{#each r.medals as m (m.name)}
						<li><MedalTip what={r.what} {...m} /></li>
					{/each}
					{#if r.more}
						<li>
							<a class="more" href={r.href}
								>+{r.more}<span class="pb-sr"> more, see all {r.name.toLowerCase()}</span></a
							>
						</li>
					{/if}
				</ul>
			</div>
		{/each}
	</section>
{/if}

<style>
	.showcase {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.line {
		display: grid;
		grid-template-columns: 110px minmax(0, 1fr);
		align-items: center;
		gap: 8px 12px;
	}
	.eyebrow {
		text-decoration: none;
	}
	ul {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.more {
		display: inline-grid;
		place-items: center;
		min-width: 36px;
		height: 36px;
		padding: 0 10px;
		box-sizing: border-box;
		border: 1px solid var(--line);
		border-radius: var(--radius-pill);
		color: var(--ink-muted);
		font: 600 13px/18px var(--font-sans);
		text-decoration: none;
	}
	.more:hover {
		color: var(--ink);
	}
	@media (max-width: 560px) {
		.line {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
