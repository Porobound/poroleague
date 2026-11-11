<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import Flair from '#lib/components/Flair.svelte';
	import MatchRows from '#lib/components/MatchRows.svelte';
	import PlayerLegends from '#lib/components/PlayerLegends.svelte';
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
	// One muted line under the name: group · rank · season. Chips are kept for states that need a look.
	const meta = $derived(
		[
			player.group && groupName(player.group),
			!player.dropped && row && `#${data.rank} in group`,
			season.name
		]
			.filter(Boolean)
			.join(' · ')
	);
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

	<section class="player-head" aria-labelledby="player-h">
		<Avatar
			name={player.displayName}
			src={player.avatar}
			size={72}
			former={player.former}
			frame={data.cosmetics.frame}
		/>
		<div class="head-text">
			<div class="name-row">
				<h1 id="player-h" class={[player.former && 'pb-former']}>{player.displayName}</h1>
				{#if data.cosmetics.badge}<Flair badge={data.cosmetics.badge} />{/if}
			</div>
			<p class="head-meta muted small">
				<span
					>{#if data.cosmetics.title}<span class="cos-title">{data.cosmetics.title}</span
						>{' · '}{/if}{meta}</span
				>
				{#if player.dropped}<span class="pb-badge pb-badge-loss">Dropped</span>{/if}
				{#if data.away}<span class="pb-badge">On holiday · {data.away}</span>{/if}
				{#if player.former}<span>· Account erased.</span>{/if}
			</p>
		</div>
		<div class="head-actions">
			<a href="/players/{player.playerId}">Career</a>
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
						Once an organizer approves it, your matches in those weeks unlock so you can play them
						before you go.
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

	{#if row}
		<section class="stats" aria-label="Season stats">
			<div class="panel"><span class="eyebrow">Points</span><strong>{row.points}</strong></div>
			<div class="panel">
				<span class="eyebrow">W–D–L</span><strong>{row.wins}–{row.draws}–{row.losses}</strong>
			</div>
			<div class="panel">
				<span class="eyebrow">Game-win %</span><strong>{row.played ? pct(row.gwp) : '—'}</strong>
			</div>
			<div class="panel">
				<span class="eyebrow">Dice rolls won</span><strong>{data.dice.won} / {data.dice.of}</strong>
			</div>
		</section>
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
	.player-head {
		display: flex;
		flex-wrap: wrap;
		gap: 24px;
		align-items: center;
	}
	.name-row {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}
	.name-row h1 {
		margin: 0;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.head-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 8px;
		margin: 4px 0 0;
	}
	.head-actions {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-left: auto;
	}
	.head-text {
		flex: 1 1 200px;
		min-width: 0;
	}
	@media (max-width: 640px) {
		.player-head {
			gap: 14px;
		}
		.head-actions {
			flex: 1 1 100%;
		}
	}
</style>
