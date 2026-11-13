CREATE TABLE `replays` (
	`match_id` integer NOT NULL,
	`game` integer NOT NULL,
	`replay_id` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`data` blob NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`match_id`, `game`),
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `replays_replay_id_unique` ON `replays` (`replay_id`);--> statement-breakpoint
ALTER TABLE `matches` ADD `p1_publish_replay` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `matches` ADD `p2_publish_replay` integer DEFAULT false NOT NULL;