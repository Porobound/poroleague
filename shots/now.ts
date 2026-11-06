// The fictional moment every run happens at, so images don't change with the date.
export const NOW = Date.UTC(2040, 0, 2, 12);

export const day = (offset: number) =>
	new Date(NOW + offset * 86_400_000).toISOString().slice(0, 10);
