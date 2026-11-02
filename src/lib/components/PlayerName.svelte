<script lang="ts">
	import type { ClassValue } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import Flair from '#lib/components/Flair.svelte';
	import type { Badge } from '#lib/league/cosmetics.ts';

	// An erased player keeps the muted "Former player 3f9a" name and gets no link.
	// `cell` is the standings/table look (pb-player); the default is the inline name (pb-pname).
	let {
		name,
		avatar = null,
		href = null,
		former = false,
		size = 24,
		cell = false,
		class: extra = undefined,
		tag = null,
		badge = null,
		children
	}: {
		name: string;
		avatar?: string | null;
		href?: string | null;
		former?: boolean;
		size?: number;
		cell?: boolean;
		class?: ClassValue;
		// A name tag after the name, e.g. "On holiday".
		tag?: string | null;
		// An equipped badge (#143): standings, the bracket and profile headers only.
		badge?: Badge | null;
		children?: Snippet;
	} = $props();
	const link = $derived(former ? null : href);
</script>

<svelte:element
	this={link ? 'a' : 'span'}
	class={[cell ? 'pb-player' : 'pb-pname', !cell && former && 'is-former', extra]}
	href={link ?? undefined}
	><Avatar {name} src={avatar} {size} {former} /><span
		class={[cell ? 'pb-player-name' : 'pb-pname-text', cell && former && 'pb-former']}>{name}</span
	>{#if badge && !former}<Flair {badge} />{/if}{#if tag}<span class="pb-badge pb-badge-sm"
			>{tag}</span
		>{/if}{@render children?.()}</svelte:element
>
