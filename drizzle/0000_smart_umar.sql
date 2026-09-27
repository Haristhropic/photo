CREATE TYPE "public"."layout_type" AS ENUM('STRIP_3', 'STRIP_4', 'GRID_4', 'SINGLE');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('USER', 'ADMIN');--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(160) NOT NULL,
	"slug" varchar(160) NOT NULL,
	"access_code" varchar(64),
	"retention_hours" integer DEFAULT 24 NOT NULL,
	"creator_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "frames" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"image_url" text NOT NULL,
	"layout_type" "layout_type" NOT NULL,
	"event_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid,
	"final_photo_url" text NOT NULL,
	"access_key" varchar(32) NOT NULL,
	"layout_type" "layout_type" NOT NULL,
	"filter_key" varchar(32) DEFAULT 'original' NOT NULL,
	"download_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "photo_sessions_access_key_unique" UNIQUE("access_key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(191) NOT NULL,
	"password_hash" varchar(191) NOT NULL,
	"name" varchar(120),
	"role" "role" DEFAULT 'USER' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frames" ADD CONSTRAINT "frames_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_sessions" ADD CONSTRAINT "photo_sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_creator_idx" ON "events" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "frames_event_idx" ON "frames" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "sessions_event_idx" ON "photo_sessions" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "photo_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");