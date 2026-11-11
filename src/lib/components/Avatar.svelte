<script lang="ts">
	import type { Tier } from '#lib/league/achievements.ts';

	let {
		name,
		src = null,
		size = 32,
		former = false,
		frame = null
	}: {
		name: string;
		src?: string | null;
		size?: number;
		former?: boolean;
		// An equipped avatar frame (#143): the DS rank ring. Never on a former player.
		frame?: Tier | null;
	} = $props();
	const initials = $derived(
		name
			.split(/\s+/)
			.map((w) => w[0])
			.join('')
			.slice(0, 2)
			.toUpperCase()
	);
	const icon = $derived(Math.round(size * 0.56));
	const TIER = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' } as const;
</script>

{#snippet face()}
	{#if former}
		<span
			class="pb-avatar pb-avatar-former"
			style:width="{size}px"
			style:height="{size}px"
			aria-hidden="true"
		>
			<svg
				width={icon}
				height={icon}
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				aria-hidden="true"
			>
				<circle cx="12" cy="8" r="4" />
				<path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
			</svg>
		</span>
	{:else if src}
		<img class="pb-avatar pb-avatar-img" {src} alt="" width={size} height={size} />
	{:else}
		<span class="pb-avatar" style:width="{size}px" style:height="{size}px" aria-hidden="true">
			{initials}
		</span>
	{/if}
{/snippet}

{#if frame && !former}
	<span class="pb-framed pb-frame-{frame}" style:padding="{Math.max(3, Math.round(size * 0.14))}px">
		{@render face()}
		<svg class="pb-ring" viewBox="0 0 100 100" role="img" aria-label="{TIER[frame]} frame">
			<circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="5" />
			{#if frame !== 'bronze'}
				<circle
					cx="50"
					cy="50"
					r="40.5"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					opacity="0.6"
				/>
				<path d="M-1 50L4 43L9 50L4 57ZM91 50L96 43L101 50L96 57Z" fill="currentColor" />
			{/if}
			{#if frame === 'gold'}
				<path
					d="M37 7L41 -4L50 2L59 -4L63 7Z"
					fill="currentColor"
					stroke="var(--surface)"
					stroke-width="1.5"
					stroke-linejoin="round"
				/>
			{/if}
		</svg>
	</span>
{:else}
	{@render face()}
{/if}
