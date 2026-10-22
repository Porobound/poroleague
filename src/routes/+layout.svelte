<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import Avatar from '#lib/components/Avatar.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
	// Season sub-pages 404 on drafts, so organizers previewing one get no links to them.
	const slug = $derived(
		(page.data.season as { status: string } | undefined)?.status === 'draft'
			? undefined
			: data.navSlug
	);
	const here = (href: string) => (page.url.pathname === href ? 'page' : undefined);
	const returnTo = $derived(page.url.pathname.startsWith('/login') ? '/' : page.url.pathname);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<header class="site-header">
	<nav aria-label="Main" class="container site-nav">
		<a href="/" class="brand">Poroleague</a>
		{#if slug}
			{#each [['', 'Season'], ['/schedule', 'Schedule'], ['/legends', 'Legends']] as [path, label] (path)}
				<a
					href="/seasons/{slug}{path}"
					class="nav-link"
					aria-current={here(`/seasons/${slug}${path}`)}>{label}</a
				>
			{/each}
		{/if}
		<a href="/seasons" class="nav-link" aria-current={here('/seasons')}>Archive</a>
		{#if data.user}
			{#if data.user.isOrganizer}
				<a href="/admin" class="nav-link">Admin</a>
			{/if}
			<svelte:element
				this={data.myPage ? 'a' : 'span'}
				href={data.myPage}
				class="me"
				aria-current={data.myPage ? here(data.myPage) : undefined}
			>
				<Avatar name={data.user.displayName} src={data.user.avatar} />
				{data.user.displayName}
			</svelte:element>
			<form method="POST" action="/auth/logout">
				<button class="pb-btn pb-btn-ghost pb-btn-sm">Log out</button>
			</form>
		{:else}
			<a
				class="pb-btn pb-btn-secondary"
				href="/auth/login?returnTo={encodeURIComponent(returnTo)}"
				data-sveltekit-reload>Log in with Discord</a
			>
		{/if}
	</nav>
</header>

<main class="container">
	{@render children()}
</main>
