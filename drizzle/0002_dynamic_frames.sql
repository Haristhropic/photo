ALTER TABLE "frames" ADD COLUMN IF NOT EXISTS "image_public_id" text;
--> statement-breakpoint
ALTER TABLE "frames" ADD COLUMN IF NOT EXISTS "image_width" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "frames" ADD COLUMN IF NOT EXISTS "image_height" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "frames" ADD COLUMN IF NOT EXISTS "windows" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "frames" ADD COLUMN IF NOT EXISTS "category" varchar(24) NOT NULL DEFAULT 'cool';
