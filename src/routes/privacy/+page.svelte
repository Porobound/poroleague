<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Privacy · Poroleague</title>
</svelte:head>

<!-- Our own docs/privacy.md, rendered on the server. -->
<article class="page narrow doc">
	{@html data.html}
</article>
