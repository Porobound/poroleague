<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		action,
		label,
		title,
		confirmLabel,
		variant = 'primary',
		small = false,
		fields = {},
		children
	}: {
		action: string;
		label: string;
		title: string;
		confirmLabel: string;
		variant?: 'primary' | 'secondary' | 'ghost';
		small?: boolean;
		fields?: Record<string, string>;
		children?: Snippet;
	} = $props();

	const id = $props.id();
	let dialog = $state<HTMLDialogElement>();
</script>

<button
	type="button"
	class={['pb-btn', `pb-btn-${variant}`, small && 'pb-btn-sm']}
	onclick={() => dialog?.showModal()}>{label}</button
>

<dialog bind:this={dialog} class="pb-dialog" aria-labelledby="{id}-title">
	<form method="POST" {action}>
		{#each Object.entries(fields) as [name, value] (name)}
			<input type="hidden" {name} {value} />
		{/each}
		<h2 id="{id}-title" class="pb-dialog-title">{title}</h2>
		<div class="pb-dialog-body">{@render children?.()}</div>
		<div class="pb-dialog-actions">
			<button type="button" class="pb-btn pb-btn-secondary" onclick={() => dialog?.close()}
				>Cancel</button
			>
			<button class="pb-btn pb-btn-primary">{confirmLabel}</button>
		</div>
	</form>
</dialog>

<style>
	/* .pb-dialog sets display:flex, which would override the browser hiding a closed <dialog>. */
	dialog:not([open]) {
		display: none;
	}
	dialog {
		margin: auto;
	}
	dialog::backdrop {
		background: rgba(5, 8, 12, 0.72);
	}
	form {
		display: contents;
	}
</style>
