<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import Avatar from '#lib/components/Avatar.svelte';
	import { RIOT_DISCLAIMER } from '#lib/legal.ts';
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
	const loginHref = $derived(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);

	const icon = (d: string) =>
		`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
	const tabs = $derived([
		...(slug
			? [
					{
						href: `/seasons/${slug}`,
						label: 'Season',
						icon: icon('<path d="M4 11l8-6 8 6v8H4z"/>')
					},
					{
						href: `/seasons/${slug}/schedule`,
						label: 'Schedule',
						icon: icon(
							'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>'
						)
					},
					{
						href: `/seasons/${slug}/legends`,
						label: 'Legends',
						icon: icon(
							'<rect x="7" y="3" width="12" height="16" rx="2"/><path d="M5 7v12a2 2 0 0 0 2 2h9"/>'
						)
					}
				]
			: []),
		{
			href: '/seasons',
			label: 'Archive',
			icon: icon('<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/>')
		}
	]);

	let menuOpen = $state(false);
	afterNavigate(() => (menuOpen = false));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<header class="site-header">
	<nav aria-label="Main" class="container site-nav">
		<a href="/" class="brand">Poroleague</a>
		<span class="desk">
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
			<a href="/rules" class="nav-link" aria-current={here('/rules')}>Rules</a>
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
				<a class="pb-btn pb-btn-secondary" href={loginHref} data-sveltekit-reload
					>Log in with Discord</a
				>
			{/if}
		</span>
		<span class="phone">
			{#if data.user}
				<details class="me-menu" bind:open={menuOpen}>
					<summary class="me">
						<Avatar name={data.user.displayName} src={data.user.avatar} />
						{data.user.displayName}
					</summary>
					<div class="me-items">
						{#if data.myPage}<a href={data.myPage}>Your page</a>{/if}
						{#if data.user.isOrganizer}<a href="/admin">Admin</a>{/if}
						<form method="POST" action="/auth/logout"><button>Log out</button></form>
					</div>
				</details>
			{:else}
				<a class="pb-btn pb-btn-secondary pb-btn-sm" href={loginHref} data-sveltekit-reload
					>Log in with Discord</a
				>
			{/if}
		</span>
	</nav>
</header>

<main class="container">
	{@render children()}
</main>

<footer class="pb-footer">
	<div class="pb-footer-in">
		<span class="pb-footer-mark">Poroleague</span>
		<nav class="pb-footer-links" aria-label="Footer"><a href="/privacy">Privacy</a></nav>
	</div>
	<p class="footer-legal">{RIOT_DISCLAIMER}</p>
</footer>

<nav aria-label="Pages" class="tab-bar">
	{#each tabs as t (t.href)}
		<a href={t.href} aria-current={here(t.href)}>{@html t.icon}{t.label}</a>
	{/each}
</nav>
