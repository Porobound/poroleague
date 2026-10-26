<script lang="ts">
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import MatchCard from '#lib/components/MatchCard.svelte';
	import ResultActions from '#lib/components/ResultActions.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const season = $derived(data.season);
	let date = $state('');
</script>

<svelte:head><title>Top cut · {season.name} · Admin · Poroleague</title></svelte:head>

<div class="page">
	<h1>{data.published ? 'Top cut' : 'Set up the top cut'}</h1>
	{#if form?.message}<p class="pb-notice" role="status">{form.message}</p>{/if}

	{#if data.preview}
		{@const p = data.preview}
		<p class="muted">{season.name}'s group stage is final. Dropped players can't qualify.</p>
		<section class="step" aria-labelledby="size-h">
			<div class="step-head">
				<span class="stepno">1</span>
				<h2 id="size-h">Size</h2>
			</div>
			<div class="size">
				<strong class="pb-num">{p.size.total}</strong>
				<span>Top {p.size.per} per group</span>
				<span class="muted"
					>{p.size.byes ? `${p.size.byes} byes for the top seeds` : 'Full bracket'}</span
				>
			</div>
			<p class="muted small">
				Change the top cut per group on <a href="/seasons/{season.slug}/admin/season">Season</a>.
			</p>
		</section>
		{#if p.problem}
			<p class="pb-notice" role="alert">{p.problem}</p>
		{:else}
			<section class="step" aria-labelledby="seed-h">
				<div class="step-head">
					<span class="stepno">2</span>
					<h2 id="seed-h">Seeding</h2>
				</div>
				<p class="muted">
					Seeds go A1, B1, A2, B2…; players from the same group don't meet in the first round. A
					level result sends the higher seed through.
				</p>
				<ul class="pairs" aria-label="First round">
					{#each p.firstRound as m, i (i)}
						<li>
							<span class="sd">{m.p1?.label ?? ''}</span><span class="nm"
								>{m.p1?.name ?? 'Bye'}</span
							>
							<span class="sd">vs</span>
							<span class="nm"
								>{m.p2?.name ?? 'Bye'} <span class="sd">{m.p2?.label ?? ''}</span></span
							>
						</li>
					{/each}
				</ul>
			</section>
			<section class="step" aria-labelledby="date-h">
				<div class="step-head">
					<span class="stepno">3</span>
					<h2 id="date-h">Date</h2>
				</div>
				<label class="pb-field"
					>Top cut date (optional)<input class="pb-input" type="date" bind:value={date} /></label
				>
			</section>
			<ConfirmButton
				action="?/publish"
				label="Publish top cut"
				title="Publish the top cut?"
				confirmLabel="Publish top cut"
				fields={{ date }}
			>
				{p.size.total} players. The bracket goes public{data.discord
					? ' and the first round is posted in the pairings channel'
					: ''}; seeds can't change after this.
			</ConfirmButton>
		{/if}
	{:else}
		{#if data.champion}
			<p class="pb-notice">Champion: <strong>{data.champion}</strong></p>
			{#if season.status === 'topcut'}
				<ConfirmButton
					action="?/finish"
					label="Finish season"
					title="Finish {season.name}?"
					confirmLabel="Finish season"
				>
					{data.openFlags
						? 'A top-cut result is still flagged; resolve it first.'
						: `${data.champion} is announced as champion and the season goes to the archive.`}
				</ConfirmButton>
			{/if}
		{/if}
		<p><a href="/seasons/{season.slug}/top-cut">Public bracket ↗</a></p>
		{#each data.rounds as r (r.name)}
			<section aria-label={r.name}>
				<h2>{r.name}</h2>
				{#if !r.rows.length}<p class="muted">Waiting for the round before.</p>{/if}
				<div class="cards">
					{#each r.rows as row (row.id)}
						<div class="row">
							<MatchCard {...row.card} flag={row.flag} />
							<div class="actions">
								{#if row.walkoverOpen}
									{#each [row.p1, row.p2] as p (p.id)}
										<ConfirmButton
											action="?/walkover"
											variant={p.id === row.higher ? 'secondary' : 'ghost'}
											label="Walkover: {p.name}"
											title="{p.name} advances without playing?"
											confirmLabel="{p.name} advances"
											fields={{ matchId: String(row.id), winnerId: p.id }}
										>
											Logged in the audit log and posted in the results channel.
										</ConfirmButton>
									{/each}
								{/if}
								{#if season.status === 'topcut'}<ResultActions {row} />{/if}
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/each}
	{/if}
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.step {
		background: var(--surface-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.step-head {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.step-head h2 {
		margin: 0;
	}
	.stepno {
		display: inline-grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-pill);
		background: var(--frost);
		font: 600 14px/1 var(--font-mono);
	}
	.size {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 14px 16px;
		border: 1px solid var(--accent);
		border-radius: var(--radius-md);
		background: var(--frost);
		max-width: 240px;
	}
	.size strong {
		font: 600 20px/26px var(--font-mono);
	}
	.pairs {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 8px;
	}
	.pairs li {
		display: grid;
		grid-template-columns: 28px minmax(0, 1fr) 24px minmax(0, 1fr);
		gap: 8px;
		align-items: center;
		padding: 8px 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
	}
	.sd {
		font: 500 12px/16px var(--font-mono);
		color: var(--ink-muted);
	}
	.nm {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 16px;
	}
	.row {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
</style>
