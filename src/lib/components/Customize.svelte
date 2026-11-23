<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import Flair from '#lib/components/Flair.svelte';
	import OptionPicker, { type Choice } from '#lib/components/OptionPicker.svelte';
	import PlayerName from '#lib/components/PlayerName.svelte';
	import type { Tier } from '#lib/league/achievements.ts';
	import type { Choices, Option, Picks } from '#lib/league/cosmetics.ts';

	// The owner's Customize panel: a title, a badge and a frame out of what they earned, previewed
	// live. `error` is a refused save: the panel stays open and says so.
	let {
		name,
		avatar,
		choices,
		equipped,
		left,
		open = false,
		error = null
	}: {
		name: string;
		avatar: string | null;
		choices: Choices;
		equipped: Picks;
		left: number;
		open?: boolean;
		error?: string | null;
	} = $props();
	let title = $derived(equipped.title ?? '');
	let badge = $derived(equipped.badge ?? '');
	let frame = $derived(equipped.frame ?? '');
	const TIER = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' } as const;
	const choice = (o: Option): Choice => ({
		value: o.id,
		label: o.label,
		group: o.group,
		badge: o.badge
	});
	const flair = $derived(choices.badges.find((o) => o.id === badge)?.badge ?? null);
	const text = $derived(choices.titles.find((o) => o.id === title)?.label ?? null);
	const ring = $derived(choices.frames.includes(frame as Tier) ? (frame as Tier) : null);
	const empty = $derived(!choices.badges.length);
</script>

<details class="cz" open={open || !!error}>
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
		{#if error}<p class="pb-notice pb-notice-error" role="alert">{error}</p>{/if}
		<div class="cz-body">
			<div class="pv" aria-live="polite">
				<span class="eyebrow">Preview</span>
				<div class="pv-head">
					<Avatar {name} src={avatar} size={56} frame={ring} />
					<div class="pv-who">
						<span class="pv-name"
							>{name}{#if flair}<Flair badge={flair} inert />{/if}</span
						>
						{#if text}<span class="muted small">{text}</span>{/if}
					</div>
				</div>
				<span class="eyebrow">In standings and the bracket</span>
				<div class="pv-row"><PlayerName {name} {avatar} badge={flair} /></div>
			</div>
			{#if !empty}
				<div class="cz-fields">
					<OptionPicker
						label="Title"
						name="title"
						bind:value={title}
						options={choices.titles.map(choice)}
					/>
					<OptionPicker
						label="Badge"
						name="badge"
						bind:value={badge}
						options={choices.badges.map(choice)}
					/>
					<OptionPicker
						label="Avatar frame"
						name="frame"
						bind:value={frame}
						options={choices.frames.map((t) => ({ value: t, label: TIER[t], frame: t }))}
						avatar={{ name, src: avatar }}
					/>
				</div>
			{/if}
		</div>
		<div><button class="pb-btn pb-btn-primary" disabled={empty}>Save</button></div>
	</form>
</details>
