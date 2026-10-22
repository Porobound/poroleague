ALTER TABLE `seasons` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `seasons` ADD `deleted_by` text REFERENCES players(id);