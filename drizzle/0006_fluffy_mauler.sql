ALTER TABLE `seasons` ADD `max_players` integer DEFAULT 128 NOT NULL;--> statement-breakpoint
ALTER TABLE `seasons` ADD `group_size` integer DEFAULT 16 NOT NULL;