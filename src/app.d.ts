declare global {
	namespace App {
		interface Locals {
			user: { id: string; displayName: string; avatar: string | null; isOrganizer: boolean } | null;
			session: { id: string; accessToken: string } | null;
			plain?: boolean; // the viewer chose to see no cosmetics
		}
	}
}

export {};
