import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { champion, key } from '#lib/league/achievements.ts';
import { LEGENDS } from '#lib/legends.ts';

const DDRAGON = 'https://ddragon.leagueoflegends.com/cdn/16.21.1';
const CDRAGON =
	'https://raw.communitydragon.org/16.21/plugins/rcp-fe-lol-static-assets/global/default/images';
const OUT = 'static/achievements';
const ITEMS = {
	'first-blood': 'spell/SummonerDot',
	seasons: 'item/3340',
	'perfect-group': 'item/3031',
	comeback: 'spell/SummonerHeal',
	'top-cut': 'spell/SummonerFlash',
	champion: 'item/3089'
};

async function get(url: string, file: string) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${res.status} ${url}`);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

const { data } = (await (await fetch(`${DDRAGON}/data/en_US/champion.json`)).json()) as {
	data: Record<string, { id: string; name: string }>;
};
const ids = new Map(Object.values(data).map((c) => [c.name, c.id]));
for (const name of new Set(LEGENDS.map(champion))) {
	const id = ids.get(name);
	if (!id) throw new Error(`No Data Dragon champion named ${name}`);
	await get(`${DDRAGON}/img/champion/${id}.png`, `${OUT}/champions/${key(name)}.png`);
}
for (const t of ['bronze', 'silver', 'gold']) {
	// The emblem sits in the middle of a 1280×720 canvas. The committed files are cropped to it:
	// magick <file> -crop 280x280+500+198 +repage -resize 160x160 <file>
	await get(`${CDRAGON}/ranked-emblem/emblem-${t}.png`, `${OUT}/tiers/${t}.png`);
}
for (const [id, path] of Object.entries(ITEMS))
	await get(`${DDRAGON}/img/${path}.png`, `${OUT}/items/${id}.png`);
console.log(`Icons saved to ${OUT}/.`);
