<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const canRemove = $derived(data.season.status === 'signup');
</script>

<svelte:head>
	<title>Players · {data.season.name} · Poroleague</title>
</svelte:head>

<div class="page">
	<span class="eyebrow">{data.entries.length} signed up</span>
	<h1>Players</h1>
	<p class="muted">
		{canRemove
			? 'Everyone who signed up. You can remove someone while signup is open; 16 or more players makes two groups.'
			: 'Signup is closed. Dropping players comes with the in-season admin tools.'}
	</p>

	{#if form?.message}
		<p class="status" role="status">{form.message}</p>
	{/if}

	<ul class="player-list">
		{#each data.entries as e (e.playerId)}
			<li>
				<Avatar name={e.displayName} src={e.avatar} />
				<span class="grow">{e.displayName}</span>
				{#if canRemove}
					<ConfirmButton
						action="?/remove"
						variant="ghost"
						small
						fields={{ playerId: e.playerId }}
						label="Remove"
						title="Remove {e.displayName} from signups?"
						confirmLabel="Remove"
					>
						They can sign up again while signup is open.
					</ConfirmButton>
				{/if}
			</li>
		{:else}
			<li class="muted">Nobody has signed up yet.</li>
		{/each}
	</ul>
</div>
