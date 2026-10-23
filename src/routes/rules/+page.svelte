<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Rules · Poroleague</title>
</svelte:head>

<!-- Our own docs/rules.md, rendered on the server. -->
<article class="page narrow rules">
	{@html data.html}
</article>

<style>
	.rules :global(h2) {
		scroll-margin-top: 80px;
	}
	.rules :global(ul),
	.rules :global(ol) {
		padding-left: 20px;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.rules :global(li) {
		line-height: 1.55;
	}
	.rules :global(p) {
		line-height: 1.55;
	}
</style>
