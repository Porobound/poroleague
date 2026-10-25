ALTER TABLE `players` ADD `discord_id` text;--> statement-breakpoint
ALTER TABLE `players` ADD `erased_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `players_discord_id_unique` ON `players` (`discord_id`);--> statement-breakpoint
-- Data: the Discord id moves to discord_id; every player reference gets a random id instead.
-- Foreign keys are checked at commit, so ids can change table by table.
PRAGMA defer_foreign_keys = ON;--> statement-breakpoint
UPDATE `players` SET `discord_id` = `id`;--> statement-breakpoint
CREATE TEMP TABLE `player_ids` AS SELECT `id` AS `old`, lower(hex(randomblob(8))) AS `new` FROM `players`;--> statement-breakpoint
UPDATE `players` SET `id` = (SELECT `new` FROM `player_ids` WHERE `old` = `players`.`id`);--> statement-breakpoint
UPDATE `sessions` SET `player_id` = (SELECT `new` FROM `player_ids` WHERE `old` = `player_id`);--> statement-breakpoint
UPDATE `entries` SET `player_id` = (SELECT `new` FROM `player_ids` WHERE `old` = `player_id`);--> statement-breakpoint
UPDATE `seasons` SET `deleted_by` = (SELECT `new` FROM `player_ids` WHERE `old` = `deleted_by`) WHERE `deleted_by` IS NOT NULL;--> statement-breakpoint
UPDATE `matches` SET
	`p1_id` = (SELECT `new` FROM `player_ids` WHERE `old` = `p1_id`),
	`p2_id` = (SELECT `new` FROM `player_ids` WHERE `old` = `p2_id`),
	`dice_winner_id` = (SELECT `new` FROM `player_ids` WHERE `old` = `dice_winner_id`),
	`reported_by` = (SELECT `new` FROM `player_ids` WHERE `old` = `reported_by`),
	`flagged_by` = (SELECT `new` FROM `player_ids` WHERE `old` = `flagged_by`),
	`flag_resolved_by` = (SELECT `new` FROM `player_ids` WHERE `old` = `flag_resolved_by`);--> statement-breakpoint
UPDATE `audit` SET `actor_id` = (SELECT `new` FROM `player_ids` WHERE `old` = `actor_id`);--> statement-breakpoint
-- Ids inside audit JSON: diceWinnerId (results), dropped / undropped, order (tiebreak).
UPDATE `audit` SET `before` = json_set(`before`, '$.diceWinnerId', (SELECT `new` FROM `player_ids` WHERE `old` = json_extract(`before`, '$.diceWinnerId'))) WHERE json_extract(`before`, '$.diceWinnerId') IS NOT NULL;--> statement-breakpoint
UPDATE `audit` SET `after` = json_set(`after`, '$.diceWinnerId', (SELECT `new` FROM `player_ids` WHERE `old` = json_extract(`after`, '$.diceWinnerId'))) WHERE json_extract(`after`, '$.diceWinnerId') IS NOT NULL;--> statement-breakpoint
UPDATE `audit` SET `after` = json_set(`after`, '$.dropped', (SELECT `new` FROM `player_ids` WHERE `old` = json_extract(`after`, '$.dropped'))) WHERE json_extract(`after`, '$.dropped') IS NOT NULL;--> statement-breakpoint
UPDATE `audit` SET `after` = json_set(`after`, '$.undropped', (SELECT `new` FROM `player_ids` WHERE `old` = json_extract(`after`, '$.undropped'))) WHERE json_extract(`after`, '$.undropped') IS NOT NULL;--> statement-breakpoint
UPDATE `audit` SET `after` = json_set(`after`, '$.order', json((SELECT json_group_array(p.`new` ORDER BY CAST(j.`key` AS integer)) FROM json_each(`audit`.`after`, '$.order') j JOIN `player_ids` p ON p.`old` = j.`value`))) WHERE json_type(`after`, '$.order') = 'array';--> statement-breakpoint
DROP TABLE `player_ids`;
