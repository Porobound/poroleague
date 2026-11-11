<script lang="ts">
	import type { Tier } from '#lib/league/achievements.ts';

	// An achievement's icon in the design system's frame: champion portrait, rank emblem or item.
	let {
		kind,
		icon,
		tier = null,
		size = 36,
		locked = false,
		bare = false
	}: {
		kind: 'legend' | 'rank' | 'item';
		icon: string;
		tier?: Tier | null;
		size?: number;
		locked?: boolean;
		bare?: boolean; // no tier crest, for the badge chip
	} = $props();
</script>

<span
	class={['pb-ach', `pb-ach-${kind}`, tier && `pb-tier-${tier}`, locked && 'is-locked']}
	style:width="{size}px"
	style:height="{size}px"
	aria-hidden="true"
	><img
		src={icon}
		alt=""
		width={size}
		height={size}
		loading="lazy"
	/>{#if kind === 'legend' && tier && !bare}<span class="pb-ach-crest"></span>{/if}</span
>
