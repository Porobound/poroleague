<svelte:head>
	<title>Members only · Porobound</title>
</svelte:head>

<section class="message-card">
	<span class="pb-badge pb-badge-rank">Members only</span>
	<h1>This account isn't in Porobound</h1>
	<p>
		Porobound is a private Discord server, and only its members can sign up or report. The Discord
		account you logged in with isn't a member. If you use another Discord account for Porobound, log
		in with that one.
	</p>
	<div class="actions">
		<a class="pb-btn pb-btn-primary" href="/auth/login" data-sveltekit-reload
			>Log in with another account</a
		>
		<a class="pb-btn pb-btn-secondary" href="/">Back to the season</a>
	</div>
	<p class="small">
		Standings, schedules and results stay public, so you can keep browsing without logging in.
	</p>
</section>
