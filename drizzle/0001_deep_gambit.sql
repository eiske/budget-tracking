CREATE TABLE `recurring_skips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recurring_id` integer NOT NULL,
	`month` text NOT NULL,
	FOREIGN KEY (`recurring_id`) REFERENCES `recurring_rules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recurring_skips_uq` ON `recurring_skips` (`recurring_id`,`month`);