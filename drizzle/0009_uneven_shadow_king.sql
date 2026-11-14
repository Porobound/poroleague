DELETE FROM replays;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_replays` (
	`match_id` integer NOT NULL,
	`game` integer NOT NULL,
	`replay_id` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`both_sides` integer NOT NULL,
	`data` blob NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`match_id`, `game`, `uploaded_by`),
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
DROP TABLE `replays`;--> statement-breakpoint
ALTER TABLE `__new_replays` RENAME TO `replays`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `replays_replay_id_idx` ON `replays` (`replay_id`);