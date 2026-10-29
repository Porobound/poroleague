<script lang="ts">
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import {
		DEFAULT_GROUP_SIZE,
		MAX_GROUPS,
		MAX_PLAYERS,
		maxPlayersFor
	} from '#lib/league/groups.ts';
	import type { FieldErrors, SeasonField } from '#lib/season.ts';

	let {
		values,
		errors = {},
		editable,
		submit,
		confirm = ''
	}: {
		values: Record<SeasonField, string | number>;
		errors?: FieldErrors;
		editable: SeasonField[];
		submit: string;
		// Set to ask before saving; the text goes in the dialog.
		confirm?: string;
	} = $props();

	// Follows the saved (or just submitted) group size; the server re-checks on save.
	const gs = $derived(Number(values.groupSize) || DEFAULT_GROUP_SIZE);
	const fields: {
		name: SeasonField;
		label: string;
		type: string;
		hint?: string;
		lockedHint?: string;
		min?: number;
		max?: number;
	}[] = $derived([
		{
			name: 'name',
			label: 'Season name',
			type: 'text',
			hint: 'Shown on every page of the season.'
		},
		{
			name: 'slug',
			label: 'Slug',
			type: 'text',
			hint: 'Used in links: /seasons/<slug>. Leave empty to make it from the name.'
		},
		{ name: 'startDate', label: 'Start date', type: 'date' },
		{
			name: 'roundsPerWeek',
			label: 'Rounds per week',
			type: 'number',
			min: 1,
			max: 4
		},
		{
			name: 'deadline',
			label: 'Season deadline',
			type: 'date',
			hint: 'Ends 23:59 Helsinki time.'
		},
		{
			name: 'topCutSize',
			label: 'Top cut per group',
			type: 'number',
			min: 0,
			max: 16,
			hint: 'The top cut itself comes later.'
		},
		{
			name: 'maxPlayers',
			label: 'Max players',
			type: 'number',
			min: 2,
			max: MAX_PLAYERS,
			hint: `Up to ${maxPlayersFor(gs)} with groups of ${gs} (at most ${MAX_GROUPS} groups).`,
			lockedHint: 'Locked once groups are drawn.'
		},
		{
			name: 'groupSize',
			label: 'Players per group',
			type: 'number',
			min: 4,
			max: 32,
			lockedHint: 'Locked once groups are drawn.'
		}
	]);
</script>

<div class="season-form">
	{#each fields as f (f.name)}
		{@const locked = !editable.includes(f.name)}
		<label class="pb-field">
			{f.label}
			<input
				class="pb-input"
				name={f.name}
				type={f.type}
				min={f.min}
				max={f.max}
				value={values[f.name]}
				disabled={locked}
				required={f.name !== 'slug'}
			/>
			{#if errors[f.name]}
				<span class="pb-hint is-error">{errors[f.name]}</span>
			{:else if !locked && f.hint}
				<span class="pb-hint">{f.hint}</span>
			{:else if locked && f.lockedHint && editable.length}
				<span class="pb-hint">{f.lockedHint}</span>
			{/if}
		</label>
	{/each}
	{#if editable.length}
		<div class="foot">
			{#if confirm}
				<ConfirmButton inForm label={submit} title="Save season changes?" confirmLabel={submit}>
					<p>{confirm}</p>
				</ConfirmButton>
			{:else}
				<button class="pb-btn pb-btn-primary">{submit}</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.season-form {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 20px;
	}
	.foot {
		grid-column: 1 / -1;
		border-top: 1px solid var(--line);
		padding-top: 20px;
	}
</style>
