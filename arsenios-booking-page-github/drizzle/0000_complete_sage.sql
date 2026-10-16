CREATE TABLE `booking_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`student_name` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `booking_slots_start_idx` ON `booking_slots` (`start_at`);--> statement-breakpoint
CREATE INDEX `booking_slots_status_idx` ON `booking_slots` (`status`);--> statement-breakpoint
CREATE TABLE `teacher_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`created_at` integer NOT NULL
);
