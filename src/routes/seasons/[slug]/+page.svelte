<script lang="ts">
	import { page } from '$app/state';
	import Avatar from '#lib/components/Avatar.svelte';
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import StandingsTable from '#lib/components/StandingsTable.svelte';
	import { date } from '#lib/format.ts';
	import { groupName, STATUS_LABEL } from '#lib/season.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const season = $derived(data.season);
	const user = $derived(data.user);
	const nameOf = $derived(new Map(data.entries.map((e) => [e.playerId, e.displayName])));
</script>

<svelte:head>
	<title>{season.name} · Poroleague</title>
</svelte:head>

<div class="page">
	<span class="eyebrow">{STATUS_LABEL[season.status]}</span>
	<h1>{season.name}</h1>
	<p class="muted">
		Starts {date(season.startDate)} · season deadline {date(season.deadline)}, 23:59 Helsinki time ·
		{season.roundsPerWeek} rounds a week
	</p>

	{#if form?.message}
		<p class="status" role="status">{form.message}</p>
	{/if}

	{#if data.myMatches.length}
		<section class="panel">
			<h2>
				Your matches <a class="small" href="/seasons/{season.slug}/players/{user?.id}">Your page</a>
			</h2>
			<ul class="player-list">
				{#each data.myMatches as m (m.id)}
					{@const opp = m.p1Id === user?.id ? m.p2Id : m.p1Id}
					{@const mine = m.p1Id === user?.id ? [m.p1Games, m.p2Games] : [m.p2Games, m.p1Games]}
					<li>
						<span class="muted">Round {m.round}</span>
						<span class="grow"
							>vs <a href="/seasons/{season.slug}/players/{opp}">{nameOf.get(opp)}</a></span
						>
						{#if m.flaggedBy}<span class="pb-badge pb-badge-rank">Flagged</span>{/if}
						{#if m.reportedBy}
							<span class="pb-num">{mine[0]}-{mine[1]}</span>
							<a href="/seasons/{season.slug}/matches/{m.id}">View</a>
						{:else}
							<a
								class="pb-btn pb-btn-primary pb-btn-sm"
								href="/seasons/{season.slug}/matches/{m.id}">Report</a
							>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if season.status === 'draft'}
		<p class="status">
			Draft: only organizers can see this page. <a href="/seasons/{season.slug}/admin">Open admin</a
			>
		</p>
	{:else if season.status === 'signup'}
		<section class="panel signup">
			<span class="eyebrow">Signed up so far</span>
			<span class="count">{data.entries.length}</span>
			<p class="muted">
				Open to everyone in the Porobound Discord until an organizer closes signup. 16 or more
				players makes two groups.
			</p>
			{#if !user}
				<a
					class="pb-btn pb-btn-primary"
					href="/auth/login?returnTo={encodeURIComponent(page.url.pathname)}"
					data-sveltekit-reload>Log in with Discord to sign up</a
				>
			{:else if data.signedUp}
				<p>
					<span class="pb-badge pb-badge-win">You're in</span> Signed up as
					<strong>{user.displayName}</strong>. You can withdraw until signup closes.
				</p>
				<ConfirmButton
					action="?/withdraw"
					variant="secondary"
					label="Withdraw"
					title="Withdraw from {season.name}?"
					confirmLabel="Withdraw"
				>
					You'll be taken off the signup list. You can sign up again while signup is open.
				</ConfirmButton>
			{:else}
				<p>You'll play as <strong>{user.displayName}</strong>, your nickname on the server.</p>
				<form method="POST" action="?/join">
					<button class="pb-btn pb-btn-primary">Sign up for {season.name}</button>
				</form>
			{/if}
		</section>
	{:else if season.status === 'groups'}
		<p class="status">Signup is closed. Groups are being drawn; the schedule follows shortly.</p>
	{/if}

	{#if data.groups.length}
		<p class="muted small">
			Win 3 · Draw 1 · Loss 0. Ties break on points, then head-to-head, then game-win %, then an
			organizer decision.
		</p>
		<div class="grid-2">
			{#each data.groups as g (g.group)}
				<section class="panel standings">
					<h2>{groupName(g.group)}</h2>
					<span class="muted small">
						{g.size} players · {g.rounds} rounds{g.dropped.length
							? ` · ${g.dropped.length} dropped`
							: ''}
					</span>
					<StandingsTable
						rows={g.rows}
						cut={season.topCutSize ?? 0}
						slug={season.slug}
						me={user?.id}
					/>
					{#if g.dropped.length}
						<p class="muted small">
							Dropped: {g.dropped.map((e) => e.displayName).join(', ')}. Their matches are void and
							left out of standings.
						</p>
					{/if}
				</section>
			{/each}
		</div>
		<p class="small">
			{#if season.topCutSize}<span class="muted"
					>Dashed line: top {season.topCutSize} per group (top cut comes later).</span
				>{/if}
			<a href="/seasons/{season.slug}/audit">Audit log</a>
		</p>
	{:else if data.entries.length}
		<section>
			<h2>Players</h2>
			<ul class="player-list">
				{#each data.entries as e (e.playerId)}
					<li>
						<Avatar name={e.displayName} src={e.avatar} /> <span class="grow">{e.displayName}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<style>
	.signup {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
		max-width: 480px;
	}
	.signup p {
		margin: 0;
	}
	.count {
		font: 500 40px/44px var(--font-mono);
	}
</style>
