<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import Flair from '#lib/components/Flair.svelte';
	import MatchRows from '#lib/components/MatchRows.svelte';
	import PlayerLegends from '#lib/components/PlayerLegends.svelte';
	import RankChart from '#lib/components/RankChart.svelte';
	import SeasonHistory from '#lib/components/SeasonHistory.svelte';
	import { pct } from '#lib/format.ts';
	import { coversLabel, holidayWeeks, requestError } from '#lib/league/holiday.ts';
	import { groupName } from '#lib/season.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let typed = $state('');
	const { season, player, row } = $derived(data);
	const played = $derived(
		data.matches.filter((c) => c.status === 'reported' || c.status === 'flagged').length
	);
	let from = $state('');
	let to = $state('');
	const cal = $derived(data.calendar);
	const problem = $derived(cal && from && to ? requestError({ from, to }, cal, cal.own) : null);
	const covers = $derived(
		cal && from && to && !problem
			? coversLabel(holidayWeeks({ from, to }, cal), cal.roundsPerWeek, cal.maxRound)
			: ''
	);
	const stats = $derived(data.stats);
	const pts = (n: number) => `${n} ${n === 1 ? 'pt' : 'pts'}`;
	const RESULT = { W: 'Won', D: 'Drew', L: 'Lost' } as const;
	const share = (wins: number, played: number) => (played ? pct(wins / played) : '—');
	const RUN = { W: 'wins', D: 'draws', L: 'losses' } as const;
	const HOLIDAY = {
		pending: { h: 'Holiday requested', badge: 'Pending', tone: '' },
		approved: { h: 'Holiday approved', badge: 'Approved', tone: 'pb-badge-win' },
		rejected: { h: 'Holiday not approved', badge: 'Not approved', tone: 'pb-badge-loss' },
		revoked: { h: 'Holiday revoked', badge: 'Revoked', tone: 'pb-badge-loss' },
		cancelled: { h: 'Request cancelled', badge: 'Cancelled', tone: '' }
	} as const;
</script>

<svelte:head>
	<title>{player.displayName} · {season.name} · Poroleague</title>
</svelte:head>

<div class="page">
	{#if form?.message}
		<p class="pb-notice" role="status">{form.message}</p>
	{/if}
	{#if form?.holidayError}
		<p class="pb-notice" role="alert">{form.holidayError}</p>
	{/if}

	<section class="profile" aria-labelledby="player-h">
		<div class="profile-head">
			<Avatar
				name={player.displayName}
				src={player.avatar}
				size={96}
				former={player.former}
				ring
				frame={data.cosmetics.frame}
			/>
			<div class="head-text">
				<div class="name-row">
					<h1 id="player-h" class={['profile-name', player.former && 'pb-former']}>
						{player.displayName}
					</h1>
					{#if data.cosmetics.badge}<Flair badge={data.cosmetics.badge} />{/if}
					<a class="tap" href="/players/{player.playerId}">Career</a>
					{#if data.canRequest && cal}
						<ConfirmButton
							action="?/requestHoliday"
							variant="ghost"
							small
							label="Going away?"
							title="Going away?"
							confirmLabel="Request holiday"
							confirmDisabled={!from || !to || !!problem}
						>
							<p>
								Once an organizer approves it, your matches in those weeks unlock so you can play
								them before you go.
							</p>
							<label class="pb-field">
								First day away
								<input
									class="pb-input"
									type="date"
									name="from"
									min={cal.today}
									max={cal.deadline}
									bind:value={from}
								/>
							</label>
							<label class="pb-field">
								Last day away
								<input
									class="pb-input"
									type="date"
									name="to"
									min={from || cal.today}
									max={cal.deadline}
									bind:value={to}
								/>
							</label>
							{#if problem}
								<p role="alert" class="small">{problem}</p>
							{:else if covers}
								<p aria-live="polite" class="muted small">Covers {covers}.</p>
							{/if}
						</ConfirmButton>
					{/if}
				</div>
				{#if data.cosmetics.title}
					<p class="cos-title">{data.cosmetics.title}</p>
				{/if}
				<div class="badges">
					{#if player.group}<span class="pb-badge">{groupName(player.group)}</span>{/if}
					{#if player.dropped}
						<span class="pb-badge pb-badge-loss">Dropped</span>
					{:else if row?.played}
						<span class="pb-badge pb-badge-rank">#{data.rank} in group</span>
					{/if}
					{#if data.away}
						<span class="pb-badge">On holiday · {data.away}</span>
					{/if}
					<span class="muted small">{season.name}</span>
					{#if player.former}<span class="muted small">· Account erased.</span>{/if}
				</div>
			</div>
			{#if row?.played}
				<div class="place">
					<span class="eyebrow">Group position</span>
					<strong>#{data.rank} <span>of {data.groupSize}</span></strong>
					{#if data.line && season.status === 'play'}
						<span class={['line-note', data.line.inside && 'is-in']}>
							{#if data.line.inside}
								In the top {data.cut}{data.line.points > 0
									? ` · ${pts(data.line.points)} clear`
									: ' · level on points'}
							{:else if data.line.points > 0}
								{pts(data.line.points)} off the top {data.cut}
							{:else}
								Level on points with the top {data.cut}
							{/if}
						</span>
					{/if}
				</div>
			{/if}
		</div>

		{#if row}
			<div class="profile-stats" role="group" aria-label="Season stats">
				<div class="profile-stat is-lead">
					<span class="eyebrow">Points</span><strong>{row.points}</strong>
				</div>
				<div class="profile-stat">
					<span class="eyebrow">W–D–L</span><strong>{row.wins}–{row.draws}–{row.losses}</strong>
				</div>
				<div class="profile-stat">
					<span class="eyebrow">Win rate</span><strong>{pct(stats.winRate)}</strong>
				</div>
				<div class="profile-stat">
					<span class="eyebrow">Game-win %</span><strong>{row.played ? pct(row.gwp) : '—'}</strong>
				</div>
				<div class="profile-stat">
					<span class="eyebrow">Games</span><strong>{stats.games.won}–{stats.games.lost}</strong>
				</div>
				<div class="profile-stat">
					<span class="eyebrow">Dice rolls won</span><strong
						>{data.dice.won} / {data.dice.of}</strong
					>
				</div>
			</div>
		{/if}

		{#if stats.played}
			<div class="form">
				<span class="eyebrow">Form</span>
				<ol aria-label="Results, oldest first">
					{#each stats.form as f (f.round)}
						{@const what = f.unplayed
							? 'not played, a loss'
							: `${RESULT[f.letter].toLowerCase()} ${f.won}–${f.lost}`}
						<li class="is-{f.letter.toLowerCase()}">
							<span aria-hidden="true">{f.letter}</span><span class="pb-sr"
								>Round {f.round}: {what}</span
							>
						</li>
					{/each}
				</ol>
				<span class="muted small">latest →</span>
				{#if stats.streak && stats.streak.length > 1}
					<span class={['run', `is-${stats.streak.letter.toLowerCase()}`]}>
						{stats.streak.length}
						{RUN[stats.streak.letter]} in a row
					</span>
				{/if}
			</div>
		{/if}
	</section>

	{#each data.holidays as h (h.id)}
		{@const s = HOLIDAY[h.status]}
		<section class="panel holiday" aria-labelledby="hol-{h.id}">
			<div class="holiday-h">
				<h2 id="hol-{h.id}">{s.h}</h2>
				<span class={['pb-badge', s.tone]}>{s.badge}</span>
			</div>
			{#if h.status === 'pending'}
				<p>{h.away}{h.covers && ` · covers ${h.covers}`}. An organizer will look at it.</p>
				<div>
					<ConfirmButton
						action="?/cancelHoliday"
						fields={{ id: String(h.id) }}
						variant="secondary"
						label="Withdraw request"
						title="Withdraw your holiday request?"
						confirmLabel="Withdraw request"
					>
						<p>Your matches stay in their normal weeks. You can ask again later.</p>
					</ConfirmButton>
				</div>
			{:else if h.status === 'approved'}
				<p>
					You’re away {h.away}{h.covers && ` · covers ${h.covers}`}. These matches are unlocked now.
					Results stay out of the standings until their week is published.
				</p>
			{:else if h.status === 'rejected'}
				<p>Your request for {h.away} wasn’t approved.</p>
				{#if h.reason}
					<figure class="reason">
						<figcaption class="eyebrow">Organizer’s reason</figcaption>
						<blockquote>“{h.reason}”</blockquote>
					</figure>
				{/if}
			{:else if h.status === 'revoked'}
				<p>Your holiday for {h.away} was revoked. Matches already unlocked stay unlocked.</p>
			{/if}
		</section>
	{/each}

	{#if stats.played}
		<div class="insights">
			{#if data.progress.length > 1}
				<section class="panel" aria-labelledby="position-h">
					<div class="panel-h">
						<h2 id="position-h">Group position</h2>
						<span class="muted small">after each round</span>
					</div>
					<RankChart
						points={data.progress}
						size={data.groupSize}
						cut={data.cut < data.groupSize ? data.cut : 0}
					/>
				</section>
			{/if}
			<section class="panel" aria-labelledby="shape-h">
				<div class="panel-h">
					<h2 id="shape-h">How matches went</h2>
					<!-- "matches", not "played": after the deadline the count includes matches nobody played. -->
					<span class="muted small">{stats.played} match{stats.played === 1 ? '' : 'es'}</span>
				</div>
				<div class="shape-bar" aria-hidden="true">
					{#each stats.shapes.filter((x) => x.count) as x (x.key)}
						<span class="is-{x.key}" style:flex-grow={x.count}></span>
					{/each}
				</div>
				<ul class="shape-key">
					{#each stats.shapes.filter((x) => x.key !== 'unplayed' || x.count) as x (x.key)}
						<li class={[!x.count && 'is-none']}>
							<i class="is-{x.key}"></i>
							<span>{x.label}</span>
							<strong>{x.count}</strong>
						</li>
					{/each}
				</ul>
				<dl class="facts">
					<div>
						<dt>Best win streak</dt>
						<dd>{stats.bestWins || '—'}</dd>
					</div>
					<div>
						<dt>Went to game 3</dt>
						<dd>
							{stats.deciders.played
								? `${stats.deciders.wins} of ${stats.deciders.played} won`
								: '—'}
						</dd>
					</div>
					<div>
						<dt>Won with the dice roll</dt>
						<dd>{share(stats.dice.with.wins, stats.dice.with.played)}</dd>
					</div>
					<div>
						<dt>Won without it</dt>
						<dd>{share(stats.dice.without.wins, stats.dice.without.played)}</dd>
					</div>
				</dl>
			</section>
		</div>
	{/if}

	<section class="matches" aria-labelledby="matches-h">
		<div class="matches-h">
			<h2 id="matches-h">Matches this season</h2>
			{#if data.matches.length}
				<span class="muted small">{played} of {data.matches.length} played</span>
			{/if}
		</div>
		{#if data.matches.some((c) => c.early)}
			<p class="muted">
				A holiday opened some of these before their week. Results stay hidden from everyone else
				until the week is published.
			</p>
		{/if}
		{#if data.matches.length}
			<div class="panel rows">
				<MatchRows cards={data.matches} player={player.playerId} label="Matches this season" />
			</div>
		{:else}
			<p class="muted">The schedule appears once the groups are locked.</p>
		{/if}
	</section>

	<section>
		<h2>
			Legends <a class="small" href="/seasons/{season.slug}/legends">All legends this season</a>
		</h2>
		{#if data.legends.playedAs.length}
			<PlayerLegends legends={data.legends} />
		{:else}
			<p class="empty">No reported matches yet.</p>
		{/if}
	</section>

	<section>
		<h2>Other seasons</h2>
		{#if data.history.length > 1}
			<SeasonHistory rows={data.history} playerId={player.playerId} current={season.slug} />
		{:else}
			<p class="muted">First season</p>
		{/if}
	</section>

	{#if data.canErase}
		<section class="erase" aria-labelledby="erase-h">
			<div class="erase-h">
				<h2 id="erase-h">Erase player</h2>
				<span class="pb-badge pb-badge-rank">Organizers only</span>
			</div>
			<div class="danger">
				<p class="muted">
					Removes their name, avatar, Discord link and logins for good. Their results in finished
					seasons stay, shown as “Former player”; a season still running loses them.
				</p>
				<ConfirmButton
					action="?/erase"
					variant="danger"
					confirmVariant="danger"
					label="Erase player…"
					title="Erase {player.displayName}?"
					confirmLabel="Erase player"
					confirmDisabled={typed.trim() !== player.displayName}
				>
					<div class="list">
						<strong>Removed</strong>
						<ul>
							<li>Name and avatar</li>
							<li>Discord link and logins</li>
							<li>Their flag reasons</li>
							<li>Their place in seasons still in signup or groups</li>
						</ul>
					</div>
					<div class="list">
						<strong>Dropped</strong>
						<ul>
							<li>From seasons in play: their matches there are void</li>
						</ul>
					</div>
					<div class="list">
						<strong>Kept</strong>
						<ul>
							<li>Their results in finished seasons, shown as “Former player”</li>
						</ul>
					</div>
					<p class="final">This can't be undone.</p>
					<label class="pb-field">
						Type {player.displayName} to confirm
						<input class="pb-input" name="confirm" autocomplete="off" bind:value={typed} />
					</label>
				</ConfirmButton>
			</div>
		</section>
	{/if}
</div>

<style>
	.matches {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.matches p {
		margin: 0;
	}
	.matches-h {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 4px 12px;
	}
	.rows {
		padding: 0;
		overflow: hidden;
	}
	.holiday {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.holiday p,
	.holiday h2 {
		margin: 0;
	}
	.holiday-h {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.reason {
		margin: 0;
		border-left: 3px solid var(--line);
		padding: 2px 0 2px 12px;
	}
	.reason blockquote {
		margin: 4px 0 0;
		color: var(--ink);
	}
	.erase {
		margin-top: 24px;
		padding-top: 32px;
		border-top: 1px solid var(--line);
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.erase-h {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.erase-h h2 {
		margin: 0;
	}
	.danger {
		border: 1px solid color-mix(in srgb, var(--brand) 55%, var(--line));
		border-radius: var(--radius-md);
		padding: 20px 24px;
		display: flex;
		flex-wrap: wrap;
		gap: 12px 24px;
		align-items: center;
		justify-content: space-between;
	}
	.danger p {
		margin: 0;
		max-width: 640px;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.list strong,
	.final {
		color: var(--ink);
	}
	.list ul {
		margin: 0;
		padding-left: 18px;
	}
	.final {
		margin: 0;
		font-weight: 600;
	}
	.place {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
		text-align: right;
	}
	.place strong {
		font: 700 56px/1 var(--font-display);
		letter-spacing: -0.04em;
	}
	.place strong span {
		font: 500 16px/1 var(--font-sans);
		letter-spacing: 0;
		color: var(--ink-muted);
	}
	.line-note {
		font: 600 13px/18px var(--font-sans);
		color: var(--signal);
	}
	.line-note.is-in {
		color: var(--accent);
	}
	.form {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
		padding: 14px 20px;
		border-top: 1px solid var(--line);
		background: color-mix(in srgb, var(--surface) 35%, transparent);
	}
	.form ol {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.form li {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 7px;
		font: 700 12px/1 var(--font-sans);
		border: 1px solid var(--line);
		color: var(--ink-muted);
	}
	.form li.is-w {
		background: color-mix(in srgb, var(--accent) 16%, transparent);
		border-color: color-mix(in srgb, var(--accent) 55%, transparent);
		color: var(--accent);
	}
	.form li.is-l {
		background: color-mix(in srgb, var(--brand) 14%, transparent);
		border-color: color-mix(in srgb, var(--brand) 50%, transparent);
		color: var(--brand);
	}
	.run {
		margin-left: auto;
		font: 600 13px/18px var(--font-sans);
		color: var(--ink-muted);
	}
	.run.is-w {
		color: var(--accent);
	}
	.run.is-l {
		color: var(--brand);
	}
	.name-row {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 14px;
		margin-bottom: 6px;
	}
	.name-row h1 {
		margin: 0;
	}
	.cos-title {
		margin: 0 0 8px;
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}
	.head-text {
		flex: 1 1 200px;
		min-width: 0;
	}
	.insights {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr));
		gap: 24px;
	}
	.insights .panel {
		display: flex;
		flex-direction: column;
		gap: 16px;
		min-width: 0;
	}
	.panel-h {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 4px 12px;
	}
	.shape-bar {
		display: flex;
		gap: 2px;
		height: 14px;
	}
	.shape-bar span {
		flex-basis: 0;
		border-radius: 4px;
	}
	.is-sweep {
		background: var(--accent);
	}
	.is-close-win {
		background: color-mix(in srgb, var(--accent) 50%, var(--surface-raised));
	}
	.is-draw {
		background: var(--ink-muted);
	}
	.is-close-loss {
		background: color-mix(in srgb, var(--brand) 50%, var(--surface-raised));
	}
	.is-swept {
		background: var(--brand);
	}
	.is-unplayed {
		background: var(--line);
	}
	.shape-key {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
		gap: 6px 20px;
		font-size: 14px;
	}
	.shape-key li {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.shape-key li.is-none {
		color: var(--ink-muted);
	}
	.shape-key i {
		flex: none;
		width: 10px;
		height: 10px;
		border-radius: 3px;
	}
	.shape-key span {
		flex: 1;
	}
	.shape-key strong {
		font-variant-numeric: tabular-nums;
	}
	.facts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0;
		margin: auto 0 0;
		border-top: 1px solid var(--line);
	}
	.facts div {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 12px 0;
	}
	.facts div:nth-child(n + 3) {
		border-top: 1px solid var(--line);
	}
	.facts div:nth-last-child(-n + 2) {
		padding-bottom: 0;
	}
	.facts dt {
		font-size: 13px;
		line-height: 18px;
		color: var(--ink-muted);
	}
	.facts dd {
		margin: 0;
		font: 600 18px/24px var(--font-display);
		font-variant-numeric: tabular-nums;
	}
	@media (max-width: 640px) {
		.place {
			flex: 1 1 100%;
			flex-direction: row;
			flex-wrap: wrap;
			align-items: baseline;
			gap: 4px 10px;
			text-align: left;
		}
		.place strong {
			font-size: 32px;
		}
		.form {
			padding: 12px 14px;
		}
		.run {
			margin-left: 0;
		}
	}
</style>
