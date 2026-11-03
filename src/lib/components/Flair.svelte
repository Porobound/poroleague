<script lang="ts">
	import type { Badge } from '#lib/league/cosmetics.ts';

	// The equipped badge: the achievement's icon in the DS flair chip, tier-coloured.
	let { badge }: { badge: Badge } = $props();
</script>

<span
	class="pb-flair pb-flair-icon pb-flair-{badge.tier ?? 'one'}"
	role="img"
	aria-label="{badge.name} badge"
	title={badge.name}
	><img
		class={['pb-flair-ico', badge.icon.startsWith('/achievements/tiers/') && 'emblem']}
		src={badge.icon}
		alt=""
		width="14"
		height="14"
	/></span
>
