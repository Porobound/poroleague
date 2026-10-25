<script lang="ts">
	let {
		name,
		src = null,
		size = 32,
		former = false
	}: { name: string; src?: string | null; size?: number; former?: boolean } = $props();
	const initials = $derived(
		name
			.split(/\s+/)
			.map((w) => w[0])
			.join('')
			.slice(0, 2)
			.toUpperCase()
	);
	const icon = $derived(Math.round(size * 0.56));
</script>

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
