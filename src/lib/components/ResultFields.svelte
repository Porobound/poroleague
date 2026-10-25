<script lang="ts">
	import GameRows from '#lib/components/GameRows.svelte';
	import { LEGENDS } from '#lib/legends.ts';

	type Who = { id: string; name: string };
	type Values = {
		game1: string;
		game2: string;
		game3: string;
		p1Legend: string;
		p2Legend: string;
		dice: string;
	};
	let { p1, p2, values }: { p1: Who; p2: Who; values: Values } = $props();
	const sides = $derived([
		['p1', p1],
		['p2', p2]
	] as const);
</script>

<GameRows {p1} {p2} {values} compact />
<div class="grid-2">
	{#each sides as [k, who] (k)}
		<label class="pb-field">
			{who.name} legend
			<select class="pb-input pb-select" name="{k}Legend" required>
				<option value="" disabled selected={!values[`${k}Legend`]}>Pick a legend</option>
				{#each LEGENDS as l (l)}
					<option value={l} selected={values[`${k}Legend`] === l}>{l}</option>
				{/each}
			</select>
		</label>
	{/each}
</div>
<fieldset class="opts">
	<legend class="eyebrow">Dice roll won by</legend>
	{#each sides as [k, who] (k)}
		<label class="opt who">
			<input type="radio" name="dice" value={who.id} checked={values.dice === who.id} required />
			{who.name}
		</label>
	{/each}
</fieldset>
