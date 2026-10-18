-- Run this once in the Cloudflare D1 console before deploying this update.
ALTER TABLE booking_slots ADD COLUMN completed_at INTEGER;
ALTER TABLE booking_slots ADD COLUMN cleared_at INTEGER;
