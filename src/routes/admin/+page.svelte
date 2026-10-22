<script lang="ts">
	import SeasonForm from '#lib/components/SeasonForm.svelte';
	import { editableFields, NEW_SEASON, STATUS_LABEL } from '#lib/season.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Admin · Poroleague</title>
</svelte:head>

<div class="page">
	<span class="eyebrow">Organizer</span>
	<h1>Seasons</h1>

	{#if data.seasons.length}
		<ul class="player-list">
			{#each data.seasons as s (s.id)}
				<li>
					<a class="grow" href="/seasons/{s.slug}/admin">{s.name}</a>
					<span class="pb-badge">{STATUS_LABEL[s.status]}</span>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="muted">No seasons yet.</p>
	{/if}

	<h2>New season</h2>
	<p class="muted">
		It starts as a draft that only organizers can see. Open signup when you're ready.
	</p>
	<form method="POST" action="?/create" class="panel">
		<SeasonForm
			values={form?.raw ?? NEW_SEASON}
			errors={form?.errors}
			editable={editableFields('draft')}
			submit="Create season"
		/>
	</form>
</div>
