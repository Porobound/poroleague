import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: { description: 'The database connection string.' },
	DISCORD_CLIENT_ID: { description: 'Discord application client id.' },
	DISCORD_CLIENT_SECRET: { description: 'Discord application client secret.' },
	DISCORD_REDIRECT_URI: { description: 'OAuth redirect, e.g. http://localhost:5173/auth/callback' },
	GUILD_ID: { description: 'Porobound Discord server id.' },
	ORGANIZER_ROLE_ID: { description: 'Discord role id of league organizers.' }
});
