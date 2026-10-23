const VALID = new Set(['2-0', '2-1', '1-0', '1-1', '0-1', '0-2', '1-2']);

export function isValidScore(a: number, b: number): boolean {
	return VALID.has(`${a}-${b}`);
}

export function matchPoints(a: number, b: number): [number, number] {
	return a > b ? [3, 0] : a < b ? [0, 3] : [1, 1];
}
