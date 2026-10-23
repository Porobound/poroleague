<script lang="ts">
	import { page } from '$app/state';

	const missing = $derived(page.status === 404);
	const title = $derived(
		missing ? (page.error?.message ?? 'Page not found') : 'Something went wrong'
	);
	// Under a season, go back to it, unless it's the season that's missing.
	const slug = $derived(page.url.pathname.match(/^\/seasons\/([^/]+)/)?.[1]);
	const back = $derived(
		slug && page.error?.message !== 'Season not found'
			? { href: `/seasons/${slug}`, label: 'Back to the season' }
			: { href: '/seasons', label: 'All seasons' }
	);
</script>

<svelte:head>
	<title>{title} · Poroleague</title>
</svelte:head>

<section class="message-card">
	<span class="eyebrow">Error {page.status}</span>
	<h1>{title}</h1>
	<p>
		{missing
			? "The link may be old, or it isn't public yet."
			: 'Something broke on our side. Try again in a moment.'}
	</p>
	<div class="actions">
		<a class="pb-btn pb-btn-primary" href={back.href}>{back.label}</a>
		<a class="pb-btn pb-btn-secondary" href="/">Home</a>
	</div>
</section>
