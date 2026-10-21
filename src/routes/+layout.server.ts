import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => ({
	user: null as { displayName: string; avatar: string | null } | null
});
