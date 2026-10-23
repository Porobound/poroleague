<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import { groupName } from '#lib/season.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const status = $derived(data.season.status);
	const info = (n: number) =>
		`${n} players · ${n % 2 ? `${n} rounds, 1 bye per round` : `${n - 1} rounds`}`;
</script>

<svelte:head>
	<title>Groups · {data.season.name} · Poroleague</title>
</svelte:head>

<div class="page">
	<h1>{status === 'groups' ? 'Group draw preview' : 'Groups'}</h1>

	{#if form?.message}
		<p class="pb-notice" role="status">{form.message}</p>
	{/if}

	{#if status === 'draft' || status === 'signup'}
		<p class="muted">Groups are drawn at random when you close signup.</p>
	{:else}
		{#if status === 'groups'}
			<p class="muted">
				Drawn at random. Move players if needed, then lock. Locking builds the schedule and can't be
				undone.
			</p>
			<div class="actions">
				<ConfirmButton
					action="?/redraw"
					variant="secondary"
					label="Redraw at random"
					title="Redraw the groups?"
					confirmLabel="Redraw"
				>
					Everyone is drawn into groups at random again. Moves you made are lost.
				</ConfirmButton>
				<ConfirmButton
					action="?/lock"
					label="Lock groups & generate schedule"
					title="Lock groups and generate the schedule?"
					confirmLabel="Lock groups"
				>
					You can't move players between groups after this.
				</ConfirmButton>
				<ConfirmButton
					action="?/reopenSignup"
					variant="ghost"
					label="Reopen signup"
					title="Reopen signup?"
					confirmLabel="Reopen signup"
				>
					The draw is cleared and players can sign up or withdraw again. Closing signup draws new
					groups.
				</ConfirmButton>
			</div>
		{:else}
			<p class="pb-notice" role="status">
				Groups locked.{#if status === 'play' && !data.season.publishedRound}
					Publish week 1 from the <a href="/seasons/{data.season.slug}/admin">overview</a>.{/if}
			</p>
		{/if}

		<div class="grid-2">
			{#each data.groups as group, i (i)}
				<section class="panel">
					<h2>{groupName(i + 1)}</h2>
					<p class="muted">{info(group.length)}</p>
					<ul class="player-list">
						{#each group as e (e.playerId)}
							<li>
								<span class="grow"
									><a class="pb-pname" href="/seasons/{data.season.slug}/players/{e.playerId}"
										><Avatar name={e.displayName} src={e.avatar} /><span class="pb-pname-text"
											>{e.displayName}</span
										></a
									></span
								>
								{#if status === 'groups' && data.groups.length === 2}
									<form method="POST" action="?/move">
										<input type="hidden" name="playerId" value={e.playerId} />
										<input type="hidden" name="group" value={i + 1} />
										<button class="pb-btn pb-btn-ghost pb-btn-sm"
											>Move to {groupName(2 - i).slice(-1)}</button
										>
									</form>
								{/if}
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
	{/if}
</div>
