<script lang="ts">
	import SeasonForm from '#lib/components/SeasonForm.svelte';
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import { editableFields, seasonFields, STATUS_LABEL } from '#lib/season.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const season = $derived(data.season);
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

	{#if season.status === 'draft'}
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
</div>
