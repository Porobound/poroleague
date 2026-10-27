import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: { description: 'The database connection string.' },
	DISCORD_CLIENT_ID: { description: 'Discord application client id.' },
	DISCORD_CLIENT_SECRET: { description: 'Discord application client secret.' },
	DISCORD_REDIRECT_URI: { description: 'OAuth redirect, e.g. http://localhost:5173/auth/callback' },
	GUILD_ID: { description: 'Porobound Discord server id.' },
	ORGANIZER_ROLE_ID: { description: 'Discord role id of league organizers.' },
	WEBHOOK_RESULTS_URL: { description: 'Discord webhook for the results channel. Empty = off.' },
	WEBHOOK_ORGANIZERS_URL: {
		description: 'Discord webhook for the organizer channel. Empty = off.'
	},
	WEBHOOK_PAIRINGS_URL: { description: 'Discord webhook for the pairings channel. Empty = off.' },
	// Optional so deploys without them keep starting.
	DISCORD_BOT_TOKEN: {
		description: 'Bot token for player role sync. Empty = off.',
		schema: (v) => v ?? ''
	},
	PLAYER_ROLE_ID: {
		description: 'Discord role given to signed-up players. Empty = off.',
		schema: (v) => v ?? ''
	}
});
