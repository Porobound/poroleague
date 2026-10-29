<script lang="ts">
	import { page } from '$app/state';
	import Avatar from '#lib/components/Avatar.svelte';
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import StandingsTable from '#lib/components/StandingsTable.svelte';
	import MatchCard from '#lib/components/MatchCard.svelte';
	import PhaseBar from '#lib/components/PhaseBar.svelte';
	import { date, day, tzName } from '#lib/format.ts';
	import { groupName, signupInfo, STATUS_LABEL } from '#lib/season.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const season = $derived(data.season);
	const user = $derived(data.user);
	const roundsText = ([a, b]: [number, number]) =>
		a === b ? `round ${a}` : b === a + 1 ? `rounds ${a} and ${b}` : `rounds ${a}–${b}`;
	const AVATARS = 12;
	const info = $derived(signupInfo(data.entries.length, season));
	const fresh = $derived(data.groups.every((g) => g.rows.every((r) => !r.played)));
	// Every match of this week is reported; flagged, void or overdue ones keep the cards showing.
	const allDone = $derived(
		!data.pending && data.myWeek.length > 0 && data.myWeek.every((c) => c.status === 'reported')
	);
</script>

<svelte:head>
	<title>{season.name} · Poroleague</title>
</svelte:head>

<div class="page">
	<section class="hero">
		<div class="hero-text">
			{#if season.status === 'play'}
				<span class="pb-badge">{season.name}</span>
				{#if data.closed}
					<h1>Reporting is closed.</h1>
					<p class="lede">Organizers are entering the last results and breaking any ties.</p>
				{:else if data.week < 1}
					<h1>Starts {date(season.startDate)}.</h1>
					<p class="lede">Pairings come out week by week. Week 1 opens on the start date.</p>
				{:else if data.pending}
					<h1>Week {data.week} pairings are coming.</h1>
					<p class="lede">
						They're posted here and in the pairings channel once organizers publish them.
					</p>
				{:else if data.rounds && data.weekEnds}
					<h1>Week {data.week} is up.</h1>
					<p class="lede">
						This week: {roundsText(data.rounds)}. Aim to play your matches by {day(data.weekEnds)}
						and report them here.<span class="desk">
							Only matches unplayed at the end of the season count as a double loss.</span
						>
					</p>
				{:else}
					<h1>All rounds are out.</h1>
					<p class="lede">
						Report anything left before the deadline. Unplayed matches count as a double loss.
					</p>
				{/if}
			{:else if season.status === 'topcut'}
				<span class="pb-badge">{season.name}</span>
				<h1>
					{data.topCut?.round
						? `Top cut: ${data.topCut.round}`
						: data.topCut
							? 'The top cut is decided.'
							: 'The top cut is being set up.'}
				</h1>
				<p class="lede">
					{data.topCut ? 'Single elimination, Bo3.' : 'The group stage is final.'}{season.topCutDate
						? ` Top cut on ${date(season.topCutDate)}.`
						: ''}
					{#if data.topCut}<a href="/seasons/{season.slug}/top-cut">See the bracket</a>{/if}
				</p>
			{:else if season.status === 'finished'}
				<span class="pb-badge">{season.name}</span>
				<h1>Final standings.</h1>
			{:else if season.status === 'signup'}
				<span class="pb-badge pb-badge-live">Signup open</span>
				<h1>Join the herd for {season.name}.</h1>
				<p class="lede">
					Open to everyone in the Porobound Discord. One Bo3 per round, until the deadline.
				</p>
				<ul class="tiles">
					<li>
						<strong>Groups of up to {season.groupSize}</strong>
						<span>{info.groups}</span>
					</li>
					<li>
						<strong>{season.roundsPerWeek} rounds a week</strong>
						<span>{info.length} Starts {date(season.startDate)}.</span>
					</li>
				</ul>
			{:else}
				<span class="eyebrow">{STATUS_LABEL[season.status]}</span>
				<h1>{season.name}</h1>
				<p class="muted">
					Starts {date(season.startDate)} · {season.roundsPerWeek} rounds a week
				</p>
			{/if}
		</div>
		{#if season.deadline}
			<div class={['panel deadline', season.status !== 'draft' && 'desk-block']}>
				<span class="eyebrow">Season deadline</span>
				<span class="deadline-date">{date(season.deadline)} · 23:59 {tzName(season.deadline)}</span>
			</div>
		{/if}
	</section>
	{#if season.status !== 'draft'}
		{@const now =
			data.phases.find((p) => p.state === 'current') ??
			data.phases.findLast((p) => p.state === 'done')}
		<div class="desk-block"><PhaseBar phases={data.phases} /></div>
		<div class="panel stat">
			{#if now}
				<div class="stat-head">
					<span class="stat-label">{now.label}</span>
					<span class="muted small stat-detail">{now.detail}</span>
				</div>
			{/if}
			<div class="segs" aria-hidden="true">
				{#each data.phases as p (p.label)}<span class="seg-{p.state}"></span>{/each}
			</div>
			{#if season.deadline}
				<span class="stat-end"
					>{season.status === 'finished' || data.closed ? 'Season ended' : 'Season ends'}
					{date(season.deadline)} · 23:59 {tzName(season.deadline)}</span
				>
			{/if}
			<details class="steps">
				<summary>All steps</summary>
				<PhaseBar phases={data.phases} />
			</details>
		</div>
	{/if}

	{#if form?.message}
		<p class="pb-notice" role="status">{form.message}</p>
	{/if}

	{#if data.topCut?.champion && season.status === 'finished'}
		<div class="champ">
			<span class="eyebrow signal">{season.name} champion</span>
			<strong>{data.topCut.champion}</strong>
			<a href="/seasons/{season.slug}/top-cut">See the bracket</a>
		</div>
	{/if}

	{#if data.topCut?.myMatch}
		<section>
			<div class="section-head"><h2>Your top cut match</h2></div>
			<div class="cards"><MatchCard {...data.topCut.myMatch} /></div>
		</section>
	{/if}

	{#if data.signedUp && season.status === 'play'}
		<section>
			<div class="section-head">
				<h2>Your matches this week</h2>
				<a href="/seasons/{season.slug}/players/{user?.id}">Your page</a>
			</div>
			{#if allDone}
				<div class="empty">
					<strong>All done for this week</strong>
					<a href="/seasons/{season.slug}/players/{user?.id}">See your results</a>
				</div>
			{:else if data.myWeek.length}
				<div class="cards">
					{#each data.myWeek as c (c.id)}<MatchCard {...c.props} />{/each}
				</div>
			{:else if data.pending}
				<p class="empty">This week's pairings aren't out yet. Watch the pairings channel.</p>
			{:else if !data.myByes.length}
				<p class="empty">No matches for you this week.</p>
			{/if}
			{#if data.myByes.length}
				<div class="empty">
					<strong
						>You have a bye in round{data.myByes.length > 1 ? 's' : ''}
						{data.myByes.join(' and ')}</strong
					>
					<span>No points either way.</span>
					<a href="/seasons/{season.slug}/schedule">See the schedule</a>
				</div>
			{/if}
		</section>
	{/if}

	{#if season.status === 'draft'}
		<p class="pb-notice">
			Draft: only organizers can see this page. <a href="/seasons/{season.slug}/admin">Open admin</a
			>
		</p>
	{:else if season.status === 'signup'}
		<section class="panel signup">
			<span class="eyebrow">Signed up so far</span>
			<span class="count">{info.count}</span>
			{#if info.spots}<span class="muted">{info.spots}</span>{/if}
			{#if data.entries.length}
				<div class="avatars">
					{#each data.entries.slice(0, AVATARS) as e (e.playerId)}
						<span title={e.displayName}
							><Avatar name={e.displayName} src={e.avatar} former={e.former} /></span
						>
					{/each}
					{#if data.entries.length > AVATARS}
						<span class="muted small">+{data.entries.length - AVATARS} more</span>
					{/if}
				</div>
			{/if}
			<hr />
			<div class="signup-action action-bar">
				{#if data.full}
					<p>
						<strong>Season is full.</strong>
						<span class="muted"
							>All {season.maxPlayers} spots are taken; one opens if someone withdraws.</span
						>
					</p>
				{:else if !user}
					<a
						class="pb-btn pb-btn-primary"
						href="/auth/login?returnTo={encodeURIComponent(page.url.pathname)}"
						data-sveltekit-reload>Log in with Discord to sign up</a
					>
				{:else if data.signedUp}
					<p>
						<span class="pb-badge pb-badge-win">You're in</span> Signed up as
						<strong>{user.displayName}</strong>. You can withdraw until groups are drawn.
					</p>
					<ConfirmButton
						action="?/withdraw"
						variant="secondary"
						label="Withdraw"
						title="Withdraw from {season.name}?"
						confirmLabel="Withdraw"
					>
						You can sign up again while signup is open.
					</ConfirmButton>
				{:else}
					<form method="POST" action="?/join">
						<button class="pb-btn pb-btn-primary">Sign up for {season.name}</button>
					</form>
					<p class="muted small">
						By signing up you agree to the <a href="/rules">rules</a> and the
						<a href="/privacy">privacy notice</a>.
					</p>
				{/if}
			</div>
		</section>
	{:else if season.status === 'groups'}
		<p class="pb-notice">Signup is closed. Groups are being drawn; the schedule follows shortly.</p>
	{/if}

	{#if data.groups.length}
		<h2 class="standings-h">Groups &amp; standings</h2>
		{#if fresh}
			<p class="note">
				<strong>No results yet.</strong>
				<span class="muted">Players are listed alphabetically for now.</span>
			</p>
		{/if}
		<div class="groups">
			{#if data.groups.length > 1}
				<div class="group-switch" role="radiogroup" aria-label="Group">
					{#each data.groups as g, i (g.group)}
						<label
							><input type="radio" name="group" value={g.group} checked={i === 0} />{groupName(
								g.group
							)}</label
						>
					{/each}
				</div>
			{/if}
			<div class="grid-2">
				{#each data.groups as g (g.group)}
					<section class="panel standings" data-group={g.group}>
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
							showTies={data.showTies}
						/>
						{#if g.dropped.length}
							<p class="muted small">
								Dropped: {g.dropped.map((e) => e.displayName).join(', ')}. Their matches are void.
							</p>
						{/if}
					</section>
				{/each}
			</div>
		</div>
		<p class="small">
			{#if season.topCutSize}<span class="muted"
					>Top {season.topCutSize}{data.groups.length > 1 ? ' of each group' : ''} go to the top cut.</span
				>{/if}
			<a href="/seasons/{season.slug}/audit">Audit log</a>
			· <a href="/rules#4-points-and-standings">How standings work</a>
		</p>
	{:else if data.entries.length && season.status !== 'signup'}
		<section>
			<h2>Players</h2>
			<ul class="player-list">
				{#each data.entries as e (e.playerId)}
					<li>
						<Avatar name={e.displayName} src={e.avatar} former={e.former} />
						<span class={['grow', e.former && 'pb-former']}>{e.displayName}</span>
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
	.signup-action {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
	}
	.signup-action p {
		margin: 0;
	}
	.signup hr {
		align-self: stretch;
		margin: 8px 0 0;
		border: 0;
		border-top: 1px solid var(--line);
	}
	.avatars {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}
	.tiles {
		list-style: none;
		margin: 0;
		padding: 0;
		align-self: stretch;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 16px;
	}
	.tiles li {
		display: flex;
		flex-direction: column;
		gap: 4px;
		border-top: 2px solid var(--line);
		padding-top: 12px;
	}
	.tiles span {
		font-size: 13px;
		line-height: 18px;
		color: var(--ink-muted);
	}
	.hero {
		display: flex;
		flex-wrap: wrap;
		gap: 24px;
		align-items: flex-end;
		justify-content: space-between;
	}
	.hero-text {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
		flex: 1 1 520px;
		min-width: 0;
	}
	.hero h1 {
		margin: 0;
		font: 700 56px/60px var(--font-display);
		letter-spacing: -0.02em;
	}
	.hero p {
		margin: 0;
	}
	.champ {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 20px 24px;
		border: 1px solid var(--signal);
		border-radius: var(--radius-md);
		background: var(--surface-raised);
	}
	.champ strong {
		font: 700 24px/30px var(--font-display);
	}
	.signal {
		color: var(--signal);
	}
	.lede {
		max-width: 600px;
		font-size: 18px;
		line-height: 28px;
		color: var(--ink-muted);
	}
	.deadline {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 240px;
		padding: 16px 20px;
	}
	.deadline-date {
		font: 400 20px/24px var(--font-mono);
		color: var(--signal);
	}
	.section-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 16px;
	}
	.section-head h2 {
		margin: 0;
	}
	.stat {
		display: none;
	}
	@media (max-width: 640px) {
		.desk-block {
			display: none;
		}
		.stat {
			display: flex;
			flex-direction: column;
			gap: 8px;
			padding: 12px 16px;
		}
		.stat-head {
			display: flex;
			justify-content: space-between;
			align-items: baseline;
			gap: 12px;
		}
		.stat-label {
			font: 600 14px/20px var(--font-sans);
		}
		.stat-detail {
			text-align: right;
		}
		.segs {
			display: grid;
			grid-auto-flow: column;
			grid-auto-columns: minmax(0, 1fr);
			gap: 4px;
		}
		.segs span {
			height: 4px;
			border-radius: var(--radius-pill);
			background: var(--line);
		}
		.segs .seg-done {
			background: var(--accent);
		}
		.segs .seg-current {
			background: var(--brand);
		}
		.stat-end {
			font: 13px/18px var(--font-mono);
			color: var(--signal);
		}
		.steps > summary {
			cursor: pointer;
			font-size: 13px;
			color: var(--accent);
			min-height: 32px;
			display: inline-flex;
			align-items: center;
			list-style: none;
		}
		.steps > summary::-webkit-details-marker {
			display: none;
		}
		.steps[open] > summary {
			margin-bottom: 4px;
		}
		.hero h1 {
			font-size: 28px;
			line-height: 32px;
		}
		.lede {
			font-size: 15px;
			line-height: 22px;
		}
		.desk {
			display: none;
		}
		.signup-action {
			align-items: stretch;
		}
	}
	.standings-h {
		margin: 0;
	}
	.note {
		margin: 0;
		background: var(--surface-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		padding: 14px 16px;
	}
	.count {
		font: 500 40px/44px var(--font-mono);
	}
</style>
