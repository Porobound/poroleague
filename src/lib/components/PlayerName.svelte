<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';

	// An erased player keeps the muted "Former player N" name and gets no link.
	let {
		name,
		avatar = null,
		href = null,
		former = false,
		size = 24
	}: {
		name: string;
		avatar?: string | null;
		href?: string | null;
		former?: boolean;
		size?: number;
	} = $props();
</script>

<svelte:element
	this={href && !former ? 'a' : 'span'}
	class={['pb-pname', former && 'is-former']}
	href={former ? undefined : (href ?? undefined)}
	><Avatar {name} src={avatar} {size} {former} /><span class="pb-pname-text">{name}</span
	></svelte:element
>
