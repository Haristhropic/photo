ALTER TABLE "photo_sessions" ADD COLUMN "published_at" timestamp;
--> statement-breakpoint
ALTER TABLE "photo_sessions" ADD COLUMN "cloudinary_public_id" varchar(191);
--> statement-breakpoint
ALTER TABLE "photo_sessions" ADD COLUMN "cloudinary_url" text;
--> statement-breakpoint
CREATE INDEX "sessions_published_idx" ON "photo_sessions" ("published_at");