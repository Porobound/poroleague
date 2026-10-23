ALTER TABLE `seasons` ADD `published_round` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `seasons` SET `published_round` = COALESCE((SELECT MAX(`round`) FROM `matches` WHERE `matches`.`season_id` = `seasons`.`id`), 0);
