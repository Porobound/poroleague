<script lang="ts">
	import { tick } from 'svelte';
	import { scoreGames } from '#lib/league/score.ts';

	type Who = { name: string };
	type Values = { game1?: string; game2?: string; game3?: string };
	// One labelled radio group per game: p1 · Draw · p2, or p2 first with `flip` (the viewer's side
	// first). Form fields game1..3 hold '1', '2' or 'D' either way.
	let {
		p1,
		p2,
		values,
		compact = false,
		flip = false
	}: { p1: Who; p2: Who; values: Values; compact?: boolean; flip?: boolean } = $props();

	// The pre-fill only seeds the rows; after that they are the form's own state.
	// svelte-ignore state_referenced_locally
	let picks = $state([values.game1 ?? '', values.game2 ?? '', values.game3 ?? '']);
	const uid = $props.id();
	const score = $derived(scoreGames(picks));
	const bad = $derived(!score.ok && !!picks[0] ? score.game : -1);
	const result = $derived.by(() => {
		if (!score.ok) return score.error;
		if (score.p1 === score.p2) return `Result: Draw ${score.p1}–${score.p2}`;
		const [w, l] = score.p1 > score.p2 ? [p1, p2] : [p2, p1];
		return `Result: ${w.name} ${Math.max(score.p1, score.p2)}–${Math.min(score.p1, score.p2)} ${l.name}`;
	});
	const opts = $derived(
		flip
			? [
					['2', p2.name],
					['D', 'Draw'],
					['1', p1.name]
				]
			: [
					['1', p1.name],
					['D', 'Draw'],
					['2', p2.name]
				]
	);

	// Clear isn't a form input, so tell the form its values changed.
	async function clear(i: number, el: HTMLElement) {
		picks[i] = '';
		await tick();
		el.closest('form')?.dispatchEvent(new Event('change', { bubbles: true }));
	}
</script>

<div class={['pb-games', compact && 'pb-games-compact']}>
	{#each [0, 1, 2] as i (i)}
		<div
			class={['pb-game', bad === i && 'is-error']}
			role="radiogroup"
			aria-labelledby="{uid}-g{i}"
			aria-required={i === 0 || undefined}
			aria-invalid={bad === i || undefined}
		>
			<span id="{uid}-g{i}" class="pb-game-label"
				>Game {i + 1}<span class="pb-game-req">{i === 0 ? 'Required' : 'Optional'}</span></span
			>
			<div class="pb-game-opts">
				{#each opts as [v, label] (v)}
					<label class={['pb-game-opt', v === 'D' && 'is-draw']}>
						<input
							type="radio"
							name="game{i + 1}"
							value={v}
							bind:group={picks[i]}
							required={i === 0}
						/>
						<span class="pb-game-opt-text" title={label}>{label}</span>
					</label>
				{/each}
			</div>
			{#if i > 0}
				<button
					type="button"
					class="pb-game-clear"
					disabled={!picks[i]}
					aria-label="Clear game {i + 1}"
					onclick={(e) => clear(i, e.currentTarget)}>Clear</button
				>
			{:else}
				<span class="pb-game-clear" aria-hidden="true"></span>
			{/if}
		</div>
	{/each}
	<p
		class={['pb-games-result', !picks[0] ? 'is-incomplete' : !score.ok && 'is-error']}
		role={bad >= 0 ? 'alert' : 'status'}
	>
		{result}
	</p>
</div>
