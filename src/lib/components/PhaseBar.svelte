<script lang="ts">
	import type { Phase } from '#lib/season.ts';

	let { phases }: { phases: Phase[] } = $props();
</script>

<ol class="pb-phase" aria-label="Season progress">
	{#each phases as p (p.label)}
		<li
			class={[
				'pb-phase-step',
				p.state === 'done' && 'is-done',
				p.state === 'current' && 'is-current'
			]}
			aria-current={p.state === 'current' ? 'step' : undefined}
		>
			<span class="pb-phase-bar"></span>
			<span class="pb-phase-label">{p.label}</span>
			<span class="pb-phase-detail">{p.detail}</span>
		</li>
	{/each}
</ol>

<style>
	@media (max-width: 600px) {
		.pb-phase {
			grid-auto-flow: row;
		}
	}
</style>
