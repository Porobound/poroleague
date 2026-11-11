<script lang="ts">
	import AchIcon from '#lib/components/AchIcon.svelte';
	import type { Badge } from '#lib/league/cosmetics.ts';

	// The equipped badge: the achievement's icon in the design system's chip. Its name and
	// requirement show in a tooltip on hover, keyboard focus or tap. `inert` is for a chip inside a
	// link (bracket slots, match rows): no button there, so hover only.
	let { badge, inert = false }: { badge: Badge; inert?: boolean } = $props();
	let el = $state<HTMLElement>();
	let hover = $state(false);
	let pinned = $state(false);
	let js = $state(false);
	const label = $derived(`Badge: ${badge.name}. ${badge.description}`);
	const cls = $derived(['pb-flair', badge.tier && `pb-tier-${badge.tier}`]);
	$effect(() => {
		js = true;
	});

	// The tooltip lives on <body>, so tables that scroll and panels that clip can't cut it off.
	$effect(() => {
		if (!el || !(hover || pinned)) return;
		const at = el;
		const tip = document.createElement('div');
		tip.className = 'pb-flair-tip';
		tip.setAttribute('aria-hidden', 'true');
		const name = document.createElement('strong');
		name.textContent = badge.name;
		const text = document.createElement('span');
		text.textContent = badge.description;
		tip.append(name, text);
		document.body.append(tip);
		// Below the chip, or above when there's no room; never past the viewport's sides.
		const place = () => {
			const r = at.getBoundingClientRect();
			const right = document.documentElement.clientWidth;
			const x = Math.max(
				8,
				Math.min(right - tip.offsetWidth - 8, r.left + r.width / 2 - tip.offsetWidth / 2)
			);
			const below = r.bottom + 8;
			const above = r.top - 8 - tip.offsetHeight;
			const y = below + tip.offsetHeight > window.innerHeight - 8 && above >= 8 ? above : below;
			tip.style.left = `${Math.round(x)}px`;
			tip.style.top = `${Math.round(y)}px`;
		};
		place();
		window.addEventListener('scroll', place, true);
		window.addEventListener('resize', place);
		return () => {
			window.removeEventListener('scroll', place, true);
			window.removeEventListener('resize', place);
			tip.remove();
		};
	});
</script>

<!-- Without JavaScript the native title is the tooltip; with it, ours replaces it. -->
{#if inert}
	<span
		bind:this={el}
		class={cls}
		role="img"
		aria-label={label}
		title={js ? undefined : label}
		onmouseenter={() => (hover = true)}
		onmouseleave={() => (hover = false)}><AchIcon {...badge} size={14} bare /></span
	>
{:else}
	<button
		bind:this={el}
		type="button"
		class={cls}
		aria-label={label}
		aria-expanded={hover || pinned}
		title={js ? undefined : label}
		onmouseenter={() => (hover = true)}
		onmouseleave={() => (hover = false)}
		onfocus={() => (hover = true)}
		onblur={() => (hover = pinned = false)}
		onclick={() => (pinned = !pinned)}><AchIcon {...badge} size={14} bare /></button
	>
{/if}
