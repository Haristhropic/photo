ALTER TABLE "frames" ADD COLUMN IF NOT EXISTS "image_public_id" text;
ALTER TABLE "frames" ADD COLUMN IF NOT EXISTS "image_width" integer NOT NULL DEFAULT 0;
ALTER TABLE "frames" ADD COLUMN IF NOT EXISTS "image_height" integer NOT NULL DEFAULT 0;
ALTER TABLE "frames" ADD COLUMN IF NOT EXISTS "windows" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "frames" ADD COLUMN IF NOT EXISTS "category" varchar(24) NOT NULL DEFAULT 'cool';
