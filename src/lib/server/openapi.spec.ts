// Contract tests: the spec (openapi.json) is the API's docs, so it has to match what the handlers
// actually send. Every object schema is closed (`additionalProperties: false`), so a new field
// fails here until it's documented.
import { Ajv2020 } from 'ajv/dist/2020.js';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { GET as specGet } from '../../routes/api/v1/openapi.json/+server.ts';
import { GET as seasonGet } from '../../routes/api/v1/seasons/[slug]/+server.ts';
import { GET as seasonsGet } from '../../routes/api/v1/seasons/+server.ts';
import { GET as legendsGet } from '../../routes/api/v1/seasons/[slug]/legends/+server.ts';
import { GET as matchesGet } from '../../routes/api/v1/seasons/[slug]/matches/+server.ts';
import { GET as topCutGet } from '../../routes/api/v1/seasons/[slug]/top-cut/+server.ts';
import { flagMatch, keepResult, saveReport } from '#lib/server/matches.ts';
import { cutState, publishCut, walkover } from '#lib/server/topCut.ts';
import { db } from '#lib/server/db/index.ts';
import { matches, players, seasons } from '#lib/server/db/schema.ts';
import { erasePlayer } from '#lib/server/players.ts';
import { dropPlayer } from '#lib/server/seasons.ts';
import { seedEntries, seedMatch, seedPlayers, seedSeason } from '#lib/server/test/seed.ts';
import spec from './openapi.json';
// OpenAPI 3.1 meta-schema, https://spec.openapis.org/oas/3.1/schema/2022-10-07
import metaSchema from './test/openapi-3.1.schema.json';

type Json = Record<string, unknown>;

// Ajv resolves `$dynamicRef: #meta` to the document root, not to `$defs/schema` where the anchor
// is; without the schema-validating dialect on top, a plain `$ref` means the same.
const meta = JSON.parse(
	JSON.stringify(metaSchema).replaceAll('"$dynamicRef":"#meta"', '"$ref":"#/$defs/schema"')
);

it('is a valid OpenAPI 3.1 document', () => {
	const ajv = new Ajv2020({ strict: false, validateFormats: false });
	const valid = ajv.validate(meta, spec);
	expect(ajv.errors ?? []).toEqual([]);
	expect(valid).toBe(true);
});

it('closes every object schema', () => {
	const open: string[] = [];
	const walk = (x: unknown, at: string) => {
		if (!x || typeof x !== 'object') return;
		const o = x as Json;
		if ('properties' in o && o.additionalProperties !== false) open.push(at);
		for (const [k, v] of Object.entries(o)) walk(v, `${at}/${k}`);
	};
	walk(spec, '#');
	expect(open).toEqual([]);
});

it('documents every API route and nothing else', () => {
	const routes = Object.keys(import.meta.glob('../../routes/api/v1/**/+server.ts'))
		.map((f) => f.slice('../../routes/api/v1'.length, -'/+server.ts'.length))
		.filter((p) => !p.includes('[...'))
		.map((p) => p.replace(/\[(\w+)\]/g, '{$1}'));
	expect(routes.sort()).toEqual(Object.keys(spec.paths).sort());
});

describe('responses match the spec', () => {
	const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });
	ajv.addSchema({ ...spec, $id: 'spec' });
	const pointer = (s: string) => s.replaceAll('~', '~0').replaceAll('/', '~1');

	// The schema for `path`'s GET answering `status`, following a shared response's $ref.
	const validator = (path: string, status: number) => {
		const paths = spec.paths as Record<string, { get: { responses: Record<string, Json> } }>;
		const res = paths[path].get.responses[status];
		expect(res, `${path} documents ${status}`).toBeDefined();
		const base =
			typeof res.$ref === 'string'
				? `spec${res.$ref}`
				: `spec#/paths/${pointer(path)}/get/responses/${status}`;
		return ajv.compile({ $ref: `${base}/content/application~1json/schema` });
	};

	const check = async (
		path: string,
		get: (e: never) => Response | Promise<Response>,
		params: Record<string, string> = {}
	) => {
		const res = await get({ params } as never);
		const body = await res.json();
		const validate = validator(path, res.status);
		validate(body);
		expect(validate.errors ?? [], `${path} ${JSON.stringify(params)}`).toEqual([]);
		return { status: res.status, body };
	};

	// One season in the top cut with every shape the API can send: reported, score-only, flagged,
	// resolved, unreported and void matches, a dropped and an erased player, a bracket with byes
	// and a reported playoff. A second season still in signup has the nulls and empty groups.
	beforeEach(() => {
		seedPlayers(10);
		db.insert(players).values({ id: 'org', displayName: 'Org' }).run();
		const id = seedSeason({
			slug: 'cut',
			status: 'topcut',
			topCutSize: 2,
			publishedRound: 9,
			startDate: '2026-01-05',
			deadline: '2026-03-01'
		}).id;
		const groups = [
			['p1', 'p2', 'p3', 'p10'],
			['p4', 'p5', 'p6'],
			['p7', 'p8', 'p9']
		];
		groups.forEach((g, i) => seedEntries(id, g, i + 1));
		const ms = groups.flatMap(([a, b, c], i) =>
			[
				[a, b],
				[a, c],
				[b, c]
			].map(([p1Id, p2Id]) => seedMatch({ seasonId: id, group: i + 1, round: 1, p1Id, p2Id }))
		);
		const report = (m: (typeof ms)[number], games: string | null) =>
			saveReport(m, m.p1Id, {
				games,
				p1Games: 2,
				p2Games: games?.includes('D') ? 0 : 1,
				p1Legend: 'Jinx',
				p2Legend: 'Ahri',
				diceWinnerId: m.p2Id
			});
		ms.forEach((m, i) => report(m, i % 2 ? '121' : null));
		flagMatch(ms[0], ms[0].p2Id, 'Wrong score.');
		flagMatch(ms[1], ms[1].p2Id, 'Typo.');
		keepResult(ms[1], 'org');
		seedMatch({ seasonId: id, group: 1, round: 2, p1Id: 'p1', p2Id: 'p10' });
		dropPlayer(id, 'p10', 'org');

		const season = () => db.select().from(seasons).where(eq(seasons.id, id)).get()!;
		publishCut(season(), '2026-03-08', 'org');
		const [played, skipped] = cutState(season())
			.rounds[0].filter((x) => x.match)
			.map((x) => db.select().from(matches).where(eq(matches.id, x.match!.id)).get()!);
		report(played, '1D1');
		walkover(season(), skipped, skipped.p1Id, 'org');
		erasePlayer('p9', 'org');

		const early = seedSeason({ slug: 'early', status: 'signup' }).id;
		seedEntries(early, ['p1', 'p2']);
	});

	it('/seasons', async () => {
		expect((await check('/seasons', seasonsGet)).body).toHaveLength(2);
	});

	it('/seasons/{slug}', async () => {
		for (const slug of ['cut', 'early']) await check('/seasons/{slug}', seasonGet, { slug });
		expect((await check('/seasons/{slug}', seasonGet, { slug: 'nope' })).status).toBe(404);
	});

	it('/seasons/{slug}/matches', async () => {
		const { body } = await check('/seasons/{slug}/matches', matchesGet, { slug: 'cut' });
		expect(body.some((m: Json) => m.stage === 'playoff' && m.result)).toBe(true);
		expect(body.some((m: Json) => m.walkover && m.void === false)).toBe(true);
		expect(body.some((m: Json) => m.void && m.flag === null)).toBe(true);
		await check('/seasons/{slug}/matches', matchesGet, { slug: 'early' });
		await check('/seasons/{slug}/matches', matchesGet, { slug: 'nope' });
	});

	it('/seasons/{slug}/top-cut', async () => {
		const { body } = await check('/seasons/{slug}/top-cut', topCutGet, { slug: 'cut' });
		expect(body.rounds[0].slots.some((s: Json) => s.bye)).toBe(true);
		expect((await check('/seasons/{slug}/top-cut', topCutGet, { slug: 'early' })).status).toBe(404);
	});

	it('/seasons/{slug}/legends', async () => {
		expect(
			(await check('/seasons/{slug}/legends', legendsGet, { slug: 'cut' })).body.length
		).toBeGreaterThan(0);
		await check('/seasons/{slug}/legends', legendsGet, { slug: 'nope' });
	});

	it('/openapi.json', async () => {
		expect((await check('/openapi.json', specGet)).body).toEqual(spec);
	});
});
