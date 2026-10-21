<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import Avatar from '#lib/components/Avatar.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
	const returnTo = $derived(page.url.pathname.startsWith('/login') ? '/' : page.url.pathname);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<header class="site-header">
	<nav aria-label="Main" class="container site-nav">
		<a href="/" class="brand">Poroleague</a>
		{#if data.user}
			{#if data.user.isOrganizer}
				<a href="/admin" class="nav-link">Admin</a>
			{/if}
			<span class="me">
				<Avatar name={data.user.displayName} src={data.user.avatar} />
				{data.user.displayName}
			</span>
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
