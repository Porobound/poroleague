<script lang="ts">
	import type { ApiReferenceConfiguration, createApiReference } from '@scalar/api-reference';
	import { onMount } from 'svelte';

	// Scalar renders the spec in the browser only, loaded here so it never ships to other pages.
	// Its colours come from our tokens, which already follow `data-theme`; dark mode follows it too.
	const customCss = `
		.scalar-app, .light-mode, .dark-mode {
			--scalar-background-1: var(--surface);
			--scalar-background-2: var(--surface-raised);
			--scalar-background-3: var(--frost);
			--scalar-background-accent: color-mix(in srgb, var(--accent) 15%, transparent);
			--scalar-border-color: var(--line);
			--scalar-color-1: var(--ink);
			--scalar-color-2: var(--ink-muted);
			--scalar-color-3: var(--ink-muted);
			--scalar-color-accent: var(--accent);
			--scalar-link-color: var(--accent);
			--scalar-button-1: var(--brand);
			--scalar-button-1-color: var(--on-brand);
			--scalar-button-1-hover: color-mix(in srgb, var(--brand) 85%, var(--ink));
			--scalar-font: var(--font-sans);
			--scalar-font-code: var(--font-mono);
			--scalar-radius: var(--radius-sm);
		}
		/* Toasts on phones: 100% wide plus side offsets would run off the right edge. */
		@media (max-width: 600px) {
			ol.scalar-toaster[data-sonner-toaster] { width: auto; }
		}`;
	// Code samples: curl, JS fetch and Python requests only.
	const hiddenClients: ApiReferenceConfiguration['hiddenClients'] = {
		...Object.fromEntries(
			[
				'c',
				'clojure',
				'csharp',
				'dart',
				'fsharp',
				'go',
				'http',
				'java',
				'julia',
				'kotlin',
				'node',
				'objc',
				'ocaml',
				'php',
				'powershell',
				'r',
				'ruby',
				'rust',
				'swift'
			].map((target) => [target, true])
		),
		shell: ['httpie', 'wget'],
		js: ['axios', 'jquery', 'ofetch', 'xhr'],
		python: ['python3', 'aiohttp', 'httpx_sync', 'httpx_async']
	};

	const config = (): Parameters<typeof createApiReference>[1] => ({
		url: '/api/v1/openapi.json',
		theme: 'none',
		customCss,
		forceDarkModeState: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
		hideDarkModeToggle: true,
		hideClientButton: true,
		withDefaultFonts: false,
		telemetry: false,
		showDeveloperTools: 'never',
		agent: { disabled: true },
		mcp: { disabled: true },
		hiddenClients,
		featuredClients: ['shell/curl', 'js/fetch', 'python/requests'],
		defaultHttpClient: { targetKey: 'shell', clientKey: 'curl' }
	});

	let el: HTMLElement;

	onMount(() => {
		let gone = false;
		let ref: ReturnType<typeof createApiReference> | undefined;
		let observer: MutationObserver | undefined;
		(async () => {
			const [{ createApiReference }] = await Promise.all([
				import('@scalar/api-reference'),
				import('@scalar/api-reference/style.css')
			]);
			if (gone) return;
			// Scalar reads its colour mode once, so a theme switch mounts it again.
			const mount = () => {
				ref?.destroy();
				ref = createApiReference(el, config());
			};
			mount();
			observer = new MutationObserver(mount);
			observer.observe(document.documentElement, { attributeFilter: ['data-theme'] });
		})();
		return () => {
			gone = true;
			observer?.disconnect();
			ref?.destroy();
		};
	});
</script>

<svelte:head>
	<title>API · Poroleague</title>
</svelte:head>

<div class="api-reference" bind:this={el}></div>
<noscript>
	<article class="page narrow">
		<h1>API</h1>
		<p>
			The interactive reference needs JavaScript. The spec is at
			<a href="/api/v1/openapi.json">/api/v1/openapi.json</a> (OpenAPI 3.1).
		</p>
	</article>
</noscript>
