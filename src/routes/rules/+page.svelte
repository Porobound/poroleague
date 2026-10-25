<script lang="ts">
	import { RIOT_DISCLAIMER } from '#lib/legal.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Rules · Poroleague</title>
</svelte:head>

<!-- Our own docs/rules.md, rendered on the server. -->
<article class="page narrow doc">
	{@html data.html}
	<p class="legal">{RIOT_DISCLAIMER}</p>
</article>
