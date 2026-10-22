<script lang="ts">
	import type { FieldErrors, SeasonField } from '#lib/season.ts';

	let {
		values,
		errors = {},
		editable,
		submit
	}: {
		values: Record<SeasonField, string | number>;
		errors?: FieldErrors;
		editable: SeasonField[];
		submit: string;
	} = $props();

	const fields: {
		name: SeasonField;
		label: string;
		type: string;
		hint: string;
		min?: number;
		max?: number;
	}[] = [
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
		{ name: 'startDate', label: 'Start date', type: 'date', hint: 'Week 1 starts on this day.' },
		{
			name: 'roundsPerWeek',
			label: 'Rounds per week',
			type: 'number',
			min: 1,
			max: 4,
			hint: 'A 12-player group plays 11 rounds, about 6 weeks at 2 a week.'
		},
		{
			name: 'deadline',
			label: 'Season deadline',
			type: 'date',
			hint: 'Ends 23:59 Helsinki time. Unplayed matches after this are double losses unless you enter a result.'
		},
		{
			name: 'topCutSize',
			label: 'Top cut per group',
			type: 'number',
			min: 0,
			max: 16,
			hint: 'Marked in standings; the top cut itself comes later.'
		}
	];
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
			{:else}
				<span class="pb-hint">{locked ? 'Locked at this stage of the season.' : f.hint}</span>
			{/if}
		</label>
	{/each}
	{#if editable.length}
		<div class="foot"><button class="pb-btn pb-btn-primary">{submit}</button></div>
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
