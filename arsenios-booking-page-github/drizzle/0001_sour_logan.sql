CREATE TABLE `admin_login_attempts` (
	`fingerprint` text PRIMARY KEY NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`window_started_at` integer NOT NULL,
	`locked_until` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
DROP TABLE `teacher_settings`;