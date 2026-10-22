<script lang="ts">
	import { page } from '$app/state';
	import Avatar from '#lib/components/Avatar.svelte';
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import StandingsTable from '#lib/components/StandingsTable.svelte';
	import MatchCard from '#lib/components/MatchCard.svelte';
	import PhaseBar from '#lib/components/PhaseBar.svelte';
	import { date, day, tzName } from '#lib/format.ts';
	import { groupName, STATUS_LABEL } from '#lib/season.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const season = $derived(data.season);
	const user = $derived(data.user);
	const roundsText = ([a, b]: [number, number]) =>
		a === b ? `round ${a}` : b === a + 1 ? `rounds ${a} and ${b}` : `rounds ${a}–${b}`;
	const AVATARS = 12;
	const fresh = $derived(data.groups.every((g) => g.rows.every((r) => !r.played)));
	// Every match of this week is reported; flagged, void or overdue ones keep the cards showing.
	const allDone = $derived(
		data.myWeek.length > 0 && data.myWeek.every((c) => c.status === 'reported')
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
					<p class="lede">The schedule is out. Week 1 opens on the start date.</p>
				{:else if data.rounds && data.weekEnds}
					<h1>Week {data.week} is up.</h1>
					<p class="lede">
						This week: {roundsText(data.rounds)}. Aim to play your matches by {day(data.weekEnds)}
						and report each one here. Need more time? Agree a later date with your opponent. Only matches
						still unplayed when the season ends count as a double loss.
					</p>
				{:else}
					<h1>All rounds are out.</h1>
					<p class="lede">
						Report anything left before the deadline. Unplayed matches count as a double loss.
					</p>
				{/if}
			{:else if season.status === 'finished'}
				<span class="pb-badge">{season.name}</span>
				<h1>Final standings.</h1>
			{:else if season.status === 'signup'}
				<span class="pb-badge pb-badge-live">Signup open</span>
				<h1>Join the herd for {season.name}.</h1>
				<p class="lede">
					Open to everyone in the Porobound Discord. Signup stays open until an organizer closes it.
					Then we draw groups and play {season.roundsPerWeek} rounds a week, one Bo3 each, until the deadline.
				</p>
				<ul class="tiles">
					<li>
						<strong>Round-robin groups</strong>
						<span>One group, or two random groups if about 16 or more sign up.</span>
					</li>
					<li>
						<strong>Play on your schedule</strong>
						<span
							>{season.roundsPerWeek} rounds a week. Arrange each match with your opponent; each week
							ends at 23:59{season.deadline ? ` ${tzName(season.deadline)}` : ''}.</span
						>
					</li>
					<li>
						<strong>Report it yourself</strong>
						<span
							>Either player reports. Something off? Either of you can flag it for an organizer.</span
						>
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
			<div class="panel deadline">
				<span class="eyebrow">Season deadline</span>
				<span class="deadline-date">{date(season.deadline)} · 23:59 {tzName(season.deadline)}</span>
				{#if season.status !== 'finished'}
					<span class="muted small">Anything unplayed by then is a double loss.</span>
				{/if}
			</div>
		{/if}
	</section>
	{#if season.status !== 'draft'}
		<PhaseBar phases={data.phases} />
	{/if}

	{#if form?.message}
		<p class="pb-notice" role="status">{form.message}</p>
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
					<span>Your matches this week are reported.</span>
					<a href="/seasons/{season.slug}/players/{user?.id}">See your results</a>
				</div>
			{:else if data.myWeek.length}
				<div class="cards">
					{#each data.myWeek as c (c.id)}<MatchCard {...c.props} />{/each}
				</div>
			{:else if !data.myByes.length}
				<p class="empty">No matches for you this week.</p>
			{/if}
			{#if data.myByes.length}
				<div class="empty">
					<strong
						>You have a bye in round{data.myByes.length > 1 ? 's' : ''}
						{data.myByes.join(' and ')}</strong
					>
					<span>
						Your group has an odd number of players, so one player sits out each round. Byes aren't
						matches: no points either way.
					</span>
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
			<span class="count">{data.entries.length}</span>
			<span class="muted small">16 or more makes two groups</span>
			{#if data.entries.length}
				<div class="avatars">
					{#each data.entries.slice(0, AVATARS) as e (e.playerId)}
						<span title={e.displayName}><Avatar name={e.displayName} src={e.avatar} /></span>
					{/each}
					{#if data.entries.length > AVATARS}
						<span class="muted small">+{data.entries.length - AVATARS} more</span>
					{/if}
				</div>
			{/if}
			<hr />
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
		<p class="pb-notice">Signup is closed. Groups are being drawn; the schedule follows shortly.</p>
	{/if}

	{#if data.groups.length}
		<h2 class="standings-h">Groups &amp; standings</h2>
		{#if fresh}
			<p class="note">
				<strong>No results yet.</strong>
				<span class="muted"
					>Everyone starts on 0 points, so players are listed alphabetically for now. The tables
					sort themselves as soon as the first results are reported.</span
				>
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
								Dropped: {g.dropped.map((e) => e.displayName).join(', ')}. Their matches are void
								and left out of standings.
							</p>
						{/if}
					</section>
				{/each}
			</div>
		</div>
		<p class="muted small">
			Win 3 · Draw 1 · Loss 0. Ties break on points, then head-to-head, then game-win %, then an
			organizer decision.
		</p>
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
	.deadline .small {
		max-width: 240px;
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
	@media (max-width: 640px) {
		.hero h1 {
			font-size: 30px;
			line-height: 34px;
		}
		.lede {
			font-size: 15px;
			line-height: 22px;
		}
		.deadline {
			min-width: 0;
			padding: 12px 16px;
			gap: 2px;
		}
		.deadline .small {
			max-width: none;
		}
		.deadline-date {
			font-size: 17px;
			line-height: 22px;
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
