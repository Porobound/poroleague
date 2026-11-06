// Loaded into the app server: it always believes it's the fictional moment, so pages don't change by date.
import { NOW } from './now.ts';

const RealDate = Date;
globalThis.Date = class extends RealDate {
	constructor(...args: []) {
		if (args.length) super(...args);
		else super(NOW);
	}
	static now() {
		return NOW;
	}
} as DateConstructor;
