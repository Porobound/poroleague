<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import type { Card } from '#lib/matchCard.ts';
	import { povRow, vsRow, type VsRow } from '#lib/matchRow.ts';

	let {
		cards,
		player = null,
		label,
		header = true
	}: {
		cards: Card[];
		// Set: rows read from this player's side. Unset: head-to-head rows.
		player?: string | null;
		label: string;
		header?: boolean;
	} = $props();
	const WORD = { W: 'Won', L: 'Lost', D: 'Drew' } as const;
</script>

{#snippet die()}
	<svg
		class="pb-die"
		width="14"
		height="14"
		viewBox="0 0 14 14"
		role="img"
		aria-label="Won the dice roll"
	>
		<title>Won the dice roll</title>
		<rect
			x="1.5"
			y="1.5"
			width="11"
			height="11"
			rx="3"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
		/>
		<circle cx="5" cy="5" r="1.2" fill="currentColor" />
		<circle cx="9" cy="9" r="1.2" fill="currentColor" />
	</svg>
{/snippet}
{#snippet replay()}
	<span class="pb-mrow-rp">
		<svg
			class="pb-ico-play"
			width="12"
			height="12"
			viewBox="0 0 24 24"
			fill="currentColor"
			aria-hidden="true"
			><path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5z" /></svg
		><span class="pb-mrow-rp-t">Replay</span><span class="pb-sr">{' available'}</span>
	</span>
{/snippet}
{#snippet badges(list: (string | null)[])}
	{#each list as t (t)}
		{#if t}<span class="pb-badge pb-badge-sm">{t}</span>{/if}
	{/each}
{/snippet}
{#snippet side(s: VsRow['sides'][number], i: number)}
	<span
		class={[
			'pb-mrow-side',
			i ? 'is-b' : 'is-a',
			s.result === 'won' && 'is-winner',
			s.result === 'lost' && 'is-loser',
			s.former && 'is-former'
		]}
	>
		<Avatar name={s.name} src={s.avatar} former={s.former} size={28} />
		<span class="pb-mrow-tx">
			<span class="pb-mrow-who">
				<span class="pb-mrow-nm">{s.name}</span>
				{#if s.you}<span class="pb-you">You</span>{/if}
				{#if s.dice}{@render die()}{/if}
				{#if s.result}<span class="pb-sr">{' ' + s.result}</span>{/if}
			</span>
			{#if s.legend || s.tag}
				<span class="pb-mrow-sub">
					{#if s.legend}<span>{s.legend}</span>{/if}
					{@render badges([s.tag])}
				</span>
			{/if}
		</span>
	</span>
{/snippet}

<div class={['pb-mrows', player ? 'pb-mrows-pov' : 'pb-mrows-vs']}>
	{#if player && header}
		<div class="pb-mrow-head" aria-hidden="true">
			<span>Round</span><span>Opponent</span><span>Played as</span><span>Dice</span><span
				>Result</span
			>
		</div>
	{/if}
	<ul aria-label={label}>
		{#each cards as c (c.id)}
			<li>
				{#if player}
					{@const r = povRow(c, player)}
					<a class={['pb-mrow pb-mrow-pov', r.void && 'is-void']} href={r.href}>
						<span class="pb-mrow-rd">
							{#if typeof r.round === 'number'}
								<span aria-hidden="true">R{r.round}</span><span class="pb-sr">Round {r.round}</span>
							{:else}<span aria-hidden="true">{r.round}</span><span class="pb-sr"
									>{c.props.head}</span
								>{/if}
						</span>
						<span class={['pb-mrow-opp', r.opponent.former && 'is-former']}>
							<Avatar
								name={r.opponent.name}
								src={r.opponent.avatar}
								former={r.opponent.former}
								size={28}
							/>
							<span class="pb-mrow-tx">
								<span class="pb-mrow-who">
									<span class="pb-sr">{'against '}</span><span class="pb-mrow-nm"
										>{r.opponent.name}</span
									>
									{#if r.overdue}<span class="pb-mrow-note is-warn">Overdue</span>{/if}
									{@render badges([r.opponent.tag, ...r.chips])}
								</span>
								{#if r.legend || r.opponent.legend || r.replay}
									<span class="pb-mrow-sub">
										{#if r.legend || r.opponent.legend}
											<span class="pb-mrow-legs">
												{#if r.legend}<span class="pb-mrow-as">as {r.legend} · vs{' '}</span>{/if}{r
													.opponent.legend}
											</span>
										{/if}
										{#if r.replay}{@render replay()}{/if}
									</span>
								{/if}
							</span>
						</span>
						<span class="pb-mrow-ascol">
							{#if r.legend}<span class="pb-sr">{'played as '}</span>{r.legend}{/if}
						</span>
						<span class="pb-mrow-dice">
							{#if r.dice}{@render die()}{/if}
						</span>
						<span class="pb-mrow-res">
							{#if r.score && r.letter}
								<span class={['pb-mrow-l', `is-${r.letter.toLowerCase()}`]} aria-hidden="true"
									>{r.letter}</span
								><span class="pb-sr">{WORD[r.letter] + ' '}</span><span
									>{r.score[0]}–{r.score[1]}</span
								>
							{:else if r.text === 'Report'}
								<span class="pb-mrow-go">Report<span class="pb-sr">{' result'}</span></span>
							{:else if r.text}
								<span class="pb-mrow-mut">{r.text}</span>
							{/if}
						</span>
					</a>
				{:else}
					{@const r = vsRow(c)}
					<a class={['pb-mrow pb-mrow-vs', r.mine && 'is-mine', r.void && 'is-void']} href={r.href}>
						{@render side(r.sides[0], 0)}
						<span class="pb-mrow-mid">
							{#if r.score}
								<span class="pb-mrow-sc">
									<span class={[r.sides[0].result === 'won' && 'is-win']}>{r.score[0]}</span><span
										aria-hidden="true">–</span
									><span class="pb-sr">{' to '}</span><span
										class={[r.sides[1].result === 'won' && 'is-win']}>{r.score[1]}</span
									>{#if !r.sides[0].result}<span class="pb-sr">, draw</span>{/if}
								</span>
							{:else if r.mid === 'Report'}
								<span class="pb-mrow-go">Report<span class="pb-sr">{' result'}</span></span>
							{:else}
								<span class="pb-mrow-mut">{r.mid}</span>
							{/if}
							{#if r.replay}{@render replay()}{/if}
						</span>
						{@render side(r.sides[1], 1)}
						{#if r.note || r.chips.length}
							<span class="pb-mrow-meta">
								{#if r.note}<span class={['pb-mrow-note', r.warn && 'is-warn']}>{r.note}</span>{/if}
								{@render badges(r.chips)}
							</span>
						{/if}
					</a>
				{/if}
			</li>
		{/each}
	</ul>
</div>
