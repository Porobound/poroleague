<script lang="ts">
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import ResultFields from '#lib/components/ResultFields.svelte';
	import type { AdminRow } from '#lib/server/matches.ts';

	// `query` keeps the page's own query string (e.g. a filter) across the post.
	let { row: r, query = '' }: { row: AdminRow; query?: string } = $props();
	const action = (name: string) => `?${query ? `${query}&` : ''}/${name}`;
</script>

<ConfirmButton
	action={action('edit')}
	small
	variant={r.flag ? 'primary' : 'secondary'}
	fields={{ matchId: String(r.id) }}
	label={r.reported ? 'Edit result' : 'Enter result'}
	title={r.flag
		? 'Change this result?'
		: r.reported
			? 'Edit this result?'
			: 'Enter result as organizer?'}
	confirmLabel="Save result"
>
	<p>
		{r.p1.name} vs {r.p2.name}, round {r.round}.
		{r.flag
			? "This replaces the reported result. It can't be flagged again."
			: r.reported
				? 'This replaces the reported result.'
				: 'For a match that was played but never reported.'}
	</p>
	<ResultFields p1={r.p1} p2={r.p2} values={r.values} />
</ConfirmButton>
{#if r.flag}
	<ConfirmButton
		action={action('keep')}
		small
		variant="secondary"
		fields={{ matchId: String(r.id) }}
		label="Keep as reported"
		title="Keep the result as reported?"
		confirmLabel="Keep result"
	>
		The reported score stands. It can't be flagged again.
	</ConfirmButton>
{/if}
