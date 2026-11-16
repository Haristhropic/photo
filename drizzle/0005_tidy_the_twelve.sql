-- Events are gone: the booth is one shared surface, so frames and sessions no
-- longer carry an owner. The constraints and indexes are dropped before the
-- columns so this file works in order; the server-side index on each column
-- disappears with the column itself.
ALTER TABLE "frames" DROP CONSTRAINT IF EXISTS "frames_event_id_events_id_fk";--> statement-breakpoint
ALTER TABLE "photo_sessions" DROP CONSTRAINT IF EXISTS "photo_sessions_event_id_events_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "frames_event_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "sessions_event_idx";--> statement-breakpoint
ALTER TABLE "frames" DROP COLUMN IF EXISTS "event_id";--> statement-breakpoint
ALTER TABLE "photo_sessions" DROP COLUMN IF EXISTS "event_id";--> statement-breakpoint
DROP TABLE IF EXISTS "events";
