ALTER TABLE "photo_sessions" ADD COLUMN IF NOT EXISTS "published_at" timestamp;
--> statement-breakpoint
ALTER TABLE "photo_sessions" ADD COLUMN IF NOT EXISTS "cloudinary_public_id" varchar(191);
--> statement-breakpoint
ALTER TABLE "photo_sessions" ADD COLUMN IF NOT EXISTS "cloudinary_url" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_published_idx" ON "photo_sessions" ("published_at");