-- Run this once in the Cloudflare D1 console before deploying the email update.
ALTER TABLE booking_slots ADD COLUMN student_email TEXT;
