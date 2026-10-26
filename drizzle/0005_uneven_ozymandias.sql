ALTER TABLE `entries` ADD `seed` integer;--> statement-breakpoint
ALTER TABLE `entries` ADD `slot` integer;--> statement-breakpoint
ALTER TABLE `matches` ADD `slot` integer;--> statement-breakpoint
ALTER TABLE `matches` ADD `walkover_id` text REFERENCES players(id);--> statement-breakpoint
ALTER TABLE `seasons` ADD `top_cut_date` text;