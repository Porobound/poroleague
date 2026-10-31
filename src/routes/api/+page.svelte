<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>API · Poroleague</title>
</svelte:head>

<!-- Our own docs/api.md, rendered on the server. -->
<article class="page narrow doc">
	{@html data.html}
</article>
