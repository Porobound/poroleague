<script lang="ts">
	import SeasonForm from '#lib/components/SeasonForm.svelte';
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import { editableFields, seasonFields, STATUS_LABEL } from '#lib/season.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const season = $derived(data.season);
	const hasResults = $derived(season.status === 'play' || season.status === 'finished');
</script>

<svelte:head>
	<title>{season.name} · Admin · Poroleague</title>
</svelte:head>

<div class="page">
	<span class="eyebrow"
		>{STATUS_LABEL[season.status]}{season.status === 'draft'
			? ' · only organizers can see it'
			: ''}</span
	>
	<h1>{season.name}</h1>

	{#if form && 'message' in form && form.message}
		<p class="status" role="status">{form.message}</p>
	{:else if form && 'saved' in form}
		<p class="status" role="status">Saved.</p>
	{/if}

	{#if season.status === 'draft' && data.running}
		<p class="muted">
			<a href="/seasons/{data.running.slug}/admin">{data.running.name}</a> is still running. Only one
			season can be open at a time, so signup for this one opens once that season is finished.
		</p>
	{:else if season.status === 'draft'}
		<ConfirmButton
			action="?/openSignup"
			label="Open signup"
			title="Open signup for {season.name}?"
			confirmLabel="Open signup"
		>
			The season goes public and anyone in the Porobound Discord can sign up until you close signup.
			You can still edit the dates and top cut until groups are locked.
		</ConfirmButton>
	{:else if season.status === 'groups'}
		<p class="muted">
			Signup is closed. Check the draw on <a href="/seasons/{season.slug}/admin/groups">Groups</a>,
			then lock it, or reopen signup from there.
		</p>
	{:else if season.status === 'signup'}
		<ConfirmButton
			action="?/closeSignup"
			label="Close signup & draw groups"
			title="Close signup and draw the groups?"
			confirmLabel="Close signup"
		>
			Players can no longer sign up or withdraw. Groups are drawn at random; you can adjust them
			before locking.
		</ConfirmButton>
	{/if}

	<form method="POST" action="?/save" class="panel">
		<SeasonForm
			values={form && 'raw' in form && form.raw ? form.raw : seasonFields(season)}
			errors={form && 'errors' in form ? form.errors : undefined}
			editable={editableFields(season.status)}
			submit="Save changes"
		/>
	</form>

	<section class="danger">
		<h2>Delete season</h2>
		<p class="muted">
			Removes the season for everyone: {data.entryCount} signups{data.matchCount
				? ` and ${data.matchCount} matches with their results`
				: ''}. This can't be undone.
		</p>
		<ConfirmButton
			action="?/delete"
			variant="secondary"
			label="Delete season"
			title="Delete {season.name}?"
			confirmLabel="Delete season"
		>
			This removes {season.name}, its {data.entryCount} signups{data.matchCount
				? `, ${data.matchCount} matches and every reported result`
				: ''}. It can't be undone.
			{#if hasResults}
				<label class="pb-field">
					Type {season.slug} to confirm
					<input
						class="pb-input"
						name="confirmSlug"
						required
						pattern={season.slug}
						autocomplete="off"
					/>
				</label>
			{/if}
		</ConfirmButton>
	</section>
</div>

<style>
	.danger {
		border-top: 1px solid var(--line);
		padding-top: 24px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
	}
</style>
