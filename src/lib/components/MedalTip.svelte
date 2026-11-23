<script lang="ts">
	import Medal from '#lib/components/Medal.svelte';
	import type { Rank } from '#lib/league/ranks.ts';

	// A medal that says what it is: its name and requirement show in a tooltip on hover, keyboard
	// focus or tap. Without JavaScript it keeps a native title.
	let {
		what,
		name,
		description,
		icon,
		rank,
		size = 36
	}: {
		what: string; // "Achievement", "Mastery"
		name: string;
		description: string;
		icon: string;
		rank: Rank;
		size?: number;
	} = $props();
	let el = $state<HTMLElement>();
	let hover = $state(false);
	let pinned = $state(false);
	let js = $state(false);
	const label = $derived(`${what}: ${name}. ${description}`);
	$effect(() => {
		js = true;
	});

	// The tooltip lives on <body>, so a panel that clips can't cut it off.
	$effect(() => {
		if (!el || !(hover || pinned)) return;
		const at = el;
		const tip = document.createElement('div');
		tip.className = 'pb-flair-tip';
		tip.setAttribute('aria-hidden', 'true');
		const title = document.createElement('strong');
		title.textContent = name;
		const text = document.createElement('span');
		text.textContent = description;
		tip.append(title, text);
		document.body.append(tip);
		// Above the medal, or below when there's no room; never past the viewport's sides.
		const place = () => {
			const r = at.getBoundingClientRect();
			const right = document.documentElement.clientWidth;
			const x = Math.max(
				8,
				Math.min(right - tip.offsetWidth - 8, r.left + r.width / 2 - tip.offsetWidth / 2)
			);
			const above = r.top - 8 - tip.offsetHeight;
			tip.style.left = `${Math.round(x)}px`;
			tip.style.top = `${Math.round(above >= 8 ? above : r.bottom + 8)}px`;
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

<button
	bind:this={el}
	type="button"
	aria-label={label}
	aria-expanded={hover || pinned}
	title={js ? undefined : label}
	onmouseenter={() => (hover = true)}
	onmouseleave={() => (hover = false)}
	onfocus={() => (hover = true)}
	onblur={() => (hover = pinned = false)}
	onclick={() => (pinned = !pinned)}><Medal {icon} {rank} {size} /></button
>

<style>
	button {
		display: inline-flex;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: none;
		line-height: 0;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
