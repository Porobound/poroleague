<script lang="ts" module>
	import type { Tier } from '#lib/league/achievements.ts';
	import type { Badge } from '#lib/league/cosmetics.ts';

	// One choice: `badge` draws an achievement icon, `frame` the avatar in that tier's ring.
	export type Choice = {
		value: string;
		label: string;
		group?: string;
		badge?: Badge;
		frame?: Tier;
	};
</script>

<script lang="ts">
	import AchIcon from '#lib/components/AchIcon.svelte';
	import Avatar from '#lib/components/Avatar.svelte';

	// One choice out of a few or of dozens. The form field is always a native select, grouped; with
	// JavaScript the design system's picker stands in for it, showing icons and a filter.
	let {
		label,
		name,
		value = $bindable(''),
		options,
		avatar
	}: {
		label: string;
		name: string;
		value?: string;
		options: Choice[];
		avatar?: { name: string; src: string | null }; // for frame choices
	} = $props();
	const NONE: Choice = { value: '', label: 'None' };
	const FILTER_FROM = 8;
	let js = $state(false);
	let open = $state(false);
	let q = $state('');
	$effect(() => {
		js = true;
	});
	const needle = $derived(q.trim().toLowerCase());
	const shown = $derived(options.filter((o) => o.label.toLowerCase().includes(needle)));
	const groups = $derived([...Map.groupBy(shown, (o) => o.group ?? '')]);
	const current = $derived(options.find((o) => o.value === value) ?? NONE);
	const pick = (v: string) => {
		value = v;
		open = false;
		q = '';
	};
</script>

{#snippet icon(o: Choice)}
	{#if avatar && (o.frame || o === NONE)}
		<Avatar {...avatar} size={o.frame ? 20 : 26} frame={o.frame ?? null} />
	{:else if o.badge}
		<AchIcon {...o.badge} size={26} />
	{:else}
		<span class="pb-picker-none" aria-hidden="true"></span>
	{/if}
{/snippet}

{#snippet option(o: Choice)}
	<li role="presentation">
		<button
			type="button"
			role="option"
			aria-selected={o.value === value}
			class={['pb-picker-opt', o.value === value && 'is-on']}
			onclick={() => pick(o.value)}
		>
			{@render icon(o)}<span class="pb-picker-lbl">{o.label}</span>
			{#if o.value === value}
				<svg
					class="pb-picker-check"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg
				>
			{/if}
		</button>
	</li>
{/snippet}

{#if js}
	<div
		class={['pb-picker', open && 'is-open']}
		role="presentation"
		onkeydown={(e) => e.key === 'Escape' && (open = false)}
	>
		<span class="pb-picker-k" id="pk-{name}-l">{label}</span>
		<button
			type="button"
			class="pb-picker-btn"
			aria-haspopup="listbox"
			aria-expanded={open}
			aria-labelledby="pk-{name}-l pk-{name}-v"
			onclick={() => (open = !open)}
		>
			{@render icon(current)}<span id="pk-{name}-v" class="pb-picker-lbl">{current.label}</span>
			<svg
				class="pb-picker-chev"
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
		</button>
		{#if open}
			<div class="pb-picker-panel">
				{#if options.length > FILTER_FROM}
					<input
						type="search"
						class="pb-input pb-picker-q"
						placeholder="Filter"
						aria-label="Filter {label.toLowerCase()}"
						bind:value={q}
					/>
				{/if}
				<div class="pb-picker-list" role="listbox" aria-labelledby="pk-{name}-l">
					{#if !needle}<ul>{@render option(NONE)}</ul>{/if}
					{#each groups as [group, list] (group)}
						{#if group}
							<div role="group" aria-label={group}>
								<span class="pb-picker-g" aria-hidden="true">{group}</span>
								<ul>
									{#each list as o (o.value)}{@render option(o)}{/each}
								</ul>
							</div>
						{:else}
							<ul>
								{#each list as o (o.value)}{@render option(o)}{/each}
							</ul>
						{/if}
					{/each}
					{#if needle && !shown.length}<p class="pb-picker-empty">No matches</p>{/if}
				</div>
			</div>
		{/if}
	</div>
{/if}
<label class="pb-field" hidden={js}>
	{label}
	<select class="pb-input pb-select" {name} bind:value>
		<option value="">None</option>
		{#each Map.groupBy(options, (o) => o.group ?? '') as [group, list] (group)}
			{#if group}
				<optgroup label={group}>
					{#each list as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
				</optgroup>
			{:else}
				{#each list as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
			{/if}
		{/each}
	</select>
</label>
