<script lang="ts">
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
	const base = $derived(`/seasons/${data.season.slug}/admin`);
	const links = $derived([
		{ href: base, label: 'Overview' },
		{ href: `${base}/players`, label: 'Players' },
		{ href: `${base}/groups`, label: 'Groups' },
		{ href: `${base}/matches`, label: 'Matches' },
		{ href: `${base}/season`, label: 'Season' }
	]);
</script>

<div class="admin">
	<nav aria-label="Admin" class="admin-nav">
		<span class="eyebrow">{data.season.name}</span>
		{#each links as l (l.href)}
			<a href={l.href} aria-current={page.url.pathname === l.href ? 'page' : undefined}>{l.label}</a
			>
		{/each}
		<a href="/seasons/{data.season.slug}">Public page ↗</a>
		<a href="/seasons/{data.season.slug}/audit">Public audit log ↗</a>
		<a href="/admin">All seasons</a>
	</nav>
	<div class="admin-main">{@render children()}</div>
</div>
