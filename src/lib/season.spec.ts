import { describe, expect, it } from 'vitest';
import { editableFields, NEW_SEASON, parseSeasonForm, slugify, type SeasonFields } from './season';

const form = (o: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.set(k, v);
	return f;
};
const valid = {
	name: 'Season 1',
	slug: '',
	startDate: '2026-11-02',
	roundsPerWeek: '2',
	deadline: '2026-12-20',
	topCutSize: '4'
};
const all = editableFields('draft');

describe('slugify', () => {
	it('lowercases, strips accents and joins words with dashes', () => {
		expect(slugify('  Season 1: Kevät Ähky! ')).toBe('season-1-kevat-ahky');
	});
});

describe('parseSeasonForm', () => {
	it('parses a valid form and derives the slug from the name', () => {
		expect(parseSeasonForm(form(valid), NEW_SEASON, all)).toEqual({
			ok: true,
			values: {
				name: 'Season 1',
				slug: 'season-1',
				startDate: '2026-11-02',
				roundsPerWeek: 2,
				deadline: '2026-12-20',
				topCutSize: 4
			}
		});
	});

	it('reports each invalid field', () => {
		const result = parseSeasonForm(
			form({
				...valid,
				name: '',
				slug: 'Bad Slug!',
				startDate: '2026-02-30',
				roundsPerWeek: '0',
				topCutSize: '17'
			}),
			NEW_SEASON,
			all
		);
		expect(result.ok).toBe(false);
		expect(Object.keys(result.ok ? {} : result.errors).sort()).toEqual([
			'name',
			'roundsPerWeek',
			'slug',
			'startDate',
			'topCutSize'
		]);
	});

	it('requires the deadline to be after the start date', () => {
		const result = parseSeasonForm(form({ ...valid, deadline: '2026-11-02' }), NEW_SEASON, all);
		expect(result.ok ? null : result.errors).toEqual({
			deadline: 'The deadline must be after the start date.'
		});
	});

	it('keeps current values for locked fields, whatever the form says', () => {
		const current: SeasonFields = {
			name: 'Season 1',
			slug: 'season-1',
			startDate: '2026-11-02',
			roundsPerWeek: 2,
			deadline: '2026-12-20',
			topCutSize: 4
		};
		const result = parseSeasonForm(
			form({
				name: 'Autumn',
				slug: 'hacked',
				roundsPerWeek: '4',
				deadline: '2026-12-27',
				topCutSize: '6'
			}),
			current,
			editableFields('play')
		);
		expect(result).toEqual({
			ok: true,
			values: { ...current, name: 'Autumn', deadline: '2026-12-27', topCutSize: 6 }
		});
	});
});

describe('editableFields', () => {
	it('narrows as the season progresses', () => {
		expect(editableFields('signup')).not.toContain('slug');
		expect(editableFields('play')).toEqual(['name', 'deadline', 'topCutSize']);
		expect(editableFields('finished')).toEqual([]);
	});
});
