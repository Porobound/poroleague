<script lang="ts">
	import type { Rank } from '#lib/league/ranks.ts';

	// An achievement or a legend as a medal: its icon in a chrome ring the colour of its rank.
	// No rank = not earned yet: a dashed ring and a greyed icon.
	let {
		icon,
		rank = null,
		size = 40
	}: {
		icon: string;
		rank?: Rank | null;
		size?: number;
	} = $props();
</script>

<span
	class={['pb-medal', rank ? `pb-rank-${rank}` : 'is-locked']}
	style:--pb-medal="{size}px"
	aria-hidden="true"><img src={icon} alt="" width={size} height={size} loading="lazy" /></span
>
