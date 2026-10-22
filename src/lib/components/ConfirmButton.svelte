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
		inForm = false,
		confirmDisabled = false,
		children
	}: {
		action?: string;
		label: string;
		title: string;
		confirmLabel: string;
		variant?: 'primary' | 'secondary' | 'ghost';
		small?: boolean;
		fields?: Record<string, string>;
		// Inside another form: confirming submits that form (after its own validation passes).
		inForm?: boolean;
		confirmDisabled?: boolean;
		children?: Snippet;
	} = $props();

	const id = $props.id();
	let dialog = $state<HTMLDialogElement>();
</script>

<button
	type="button"
	class={['pb-btn', `pb-btn-${variant}`, small && 'pb-btn-sm']}
	onclick={(e) => {
		if (!inForm || e.currentTarget.form?.reportValidity()) dialog?.showModal();
	}}>{label}</button
>

<dialog bind:this={dialog} class="pb-dialog" aria-labelledby="{id}-title">
	<svelte:element
		this={inForm ? 'div' : 'form'}
		class="body"
		{...inForm ? {} : { method: 'POST', action }}
	>
		{#each Object.entries(fields) as [name, value] (name)}
			<input type="hidden" {name} {value} />
		{/each}
		<h2 id="{id}-title" class="pb-dialog-title">{title}</h2>
		<div class="pb-dialog-body">{@render children?.()}</div>
		<div class="pb-dialog-actions">
			<button type="button" class="pb-btn pb-btn-secondary" onclick={() => dialog?.close()}
				>Cancel</button
			>
			<button class="pb-btn pb-btn-primary" disabled={confirmDisabled}>{confirmLabel}</button>
		</div>
	</svelte:element>
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
	.body {
		display: contents;
	}
</style>
