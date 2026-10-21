<script lang="ts">
	let {
		name,
		src = null,
		size = 32
	}: { name: string; src?: string | null; size?: number } = $props();
	const initials = $derived(
		name
			.split(/\s+/)
			.map((w) => w[0])
			.join('')
			.slice(0, 2)
			.toUpperCase()
	);
</script>

{#if src}
	<img class="pb-avatar pb-avatar-img" {src} alt="" width={size} height={size} />
{:else}
	<span class="pb-avatar" style:width="{size}px" style:height="{size}px" aria-hidden="true">
		{initials}
	</span>
{/if}
