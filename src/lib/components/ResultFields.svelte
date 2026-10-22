<script lang="ts">
	import { LEGENDS } from '#lib/legends.ts';

	type Who = { id: string; name: string };
	type Values = {
		p1Games: string;
		p2Games: string;
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

<div class="grid-2">
	{#each sides as [k, who] (k)}
		<label class="pb-field">
			{who.name} games
			<select class="pb-input pb-select" name="{k}Games" required>
				<option value="" disabled selected={!values[`${k}Games`]}>–</option>
				{#each ['0', '1', '2'] as n (n)}
					<option value={n} selected={values[`${k}Games`] === n}>{n}</option>
				{/each}
			</select>
		</label>
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
