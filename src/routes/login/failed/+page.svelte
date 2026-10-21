<svelte:head>
	<title>Login didn't go through · Porobound</title>
</svelte:head>

<section class="message-card">
	<h1>Login didn't go through</h1>
	<p>
		Discord login was cancelled or didn't finish. Nothing was changed. Try again, and allow access
		when Discord asks.
	</p>
	<div class="actions">
		<a class="pb-btn pb-btn-primary" href="/auth/login" data-sveltekit-reload
			>Try again with Discord</a
		>
		<a class="pb-btn pb-btn-secondary" href="/">Back to the season</a>
	</div>
</section>
