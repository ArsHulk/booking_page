CREATE TABLE `student_notes` (
	`student_email` text PRIMARY KEY NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL
);
