<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import Flair from '#lib/components/Flair.svelte';
	import PlayerName from '#lib/components/PlayerName.svelte';
	import type { Choices, Option, Picks } from '#lib/league/cosmetics.ts';

	// The owner's Customize panel: three selects over earned achievements, previewed live.
	let {
		name,
		avatar,
		choices,
		equipped,
		left
	}: { name: string; avatar: string | null; choices: Choices; equipped: Picks; left: number } =
		$props();
	let title = $derived(equipped.title ?? '');
	let badge = $derived(equipped.badge ?? '');
	let frame = $derived(equipped.frame ?? '');
	const find = (l: Option[], id: string) => l.find((o) => o.id === id) ?? null;
	const t = $derived(find(choices.titles, title));
	const b = $derived(find(choices.badges, badge));
	const f = $derived(find(choices.frames, frame));
	const flair = $derived(b && { name: b.label, icon: b.icon, tier: b.tier });
	const empty = $derived(!choices.badges.length);
</script>

{#snippet options(list: Option[])}
	<option value="">None</option>
	{#each list as o (o.id)}<option value={o.id}>{o.label}</option>{/each}
{/snippet}

<details class="cz">
	<summary class="pb-btn pb-btn-secondary pb-btn-sm">Customize profile</summary>
	<form method="POST" action="?/customize" aria-labelledby="cz-h">
		<div class="cz-head">
			<h2 id="cz-h">Customize your profile</h2>
			<p class="muted small">
				{empty
					? 'Nothing earned yet. Titles, badges and frames unlock with the achievements below.'
					: `Only what you’ve earned shows here. ${left} more to earn below.`}
			</p>
		</div>
		<div class="pv" aria-live="polite">
			<span class="eyebrow">Preview</span>
			<div class="pv-head">
				<Avatar {name} src={avatar} size={56} frame={f?.tier ?? null} />
				<div class="pv-who">
					<span class="pv-name"
						>{name}{#if flair}<Flair badge={flair} />{/if}</span
					>
					{#if t}<span class="cos-title" data-tier={t.tier}>{t.label}</span>{/if}
				</div>
			</div>
			<span class="eyebrow">In standings and the bracket</span>
			<div class="pv-row"><PlayerName {name} {avatar} badge={flair} /></div>
		</div>
		{#if !empty}
			<label class="pb-field"
				>Title
				<select class="pb-input pb-select" name="title" bind:value={title}>
					{@render options(choices.titles)}
				</select>
			</label>
			<label class="pb-field"
				>Badge
				<select class="pb-input pb-select" name="badge" bind:value={badge}>
					{@render options(choices.badges)}
				</select>
			</label>
			<label class="pb-field"
				>Avatar frame
				<select class="pb-input pb-select" name="frame" bind:value={frame}>
					{@render options(choices.frames)}
				</select>
			</label>
		{/if}
		<div><button class="pb-btn pb-btn-primary" disabled={empty}>Save</button></div>
	</form>
</details>
