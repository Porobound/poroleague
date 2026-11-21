<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Poroleague</title>
</svelte:head>

<section class="hero">
	{#if data.comingSoon}
		<span class="pb-badge">Coming soon</span>
		<h1>The next season is on its way.</h1>
		<p>It's being set up now. Signup will be announced in the Porobound Discord.</p>
	{:else}
		<span class="pb-badge">No season yet</span>
		<h1>The herd is gathering.</h1>
		<p>The first season hasn't been set up yet. It'll be announced in the Porobound Discord.</p>
	{/if}
	{#if data.user?.isOrganizer}
		<a class="pb-btn pb-btn-secondary" href="/admin">Go to admin</a>
	{/if}
</section>

<style>
	.hero {
		max-width: 640px;
		margin: clamp(48px, 14vh, 140px) auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-4);
		text-align: center;
	}
	h1 {
		margin: 0;
		font: 700 clamp(36px, 6vw, 64px) / 1.02 var(--font-display);
		letter-spacing: -0.035em;
		text-wrap: balance;
	}
	p {
		margin: 0;
		font-size: 18px;
		line-height: 28px;
		color: var(--ink-muted);
	}
</style>
