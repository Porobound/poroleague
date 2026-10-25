<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Rules · Poroleague</title>
</svelte:head>

<!-- Our own docs/rules.md, rendered on the server. -->
<article class="page narrow doc">
	{@html data.html}
</article>
