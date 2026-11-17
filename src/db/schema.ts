import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["USER", "ADMIN"]);
export const layoutEnum = pgEnum("layout_type", [
  "STRIP_2",
  "STRIP_3",
  "STRIP_4",
  "GRID_4",
  "SINGLE",
]);

export type Role = (typeof roleEnum.enumValues)[number];
export type LayoutType = (typeof layoutEnum.enumValues)[number];

/** A photo window inside a server-stored frame, in source-image pixels. */
export type FrameWindow = { x: number; y: number; w: number; h: number };

// Neon runs in UTC and timestamp-without-timezone keeps stored values naive, so
// comparisons against now() stay unambiguous regardless of client timezone.
const createdAt = () =>
  timestamp("created_at", { withTimezone: false }).notNull().defaultNow();

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 191 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 191 }).notNull(),
    name: varchar("name", { length: 120 }),
    role: roleEnum("role").notNull().default("USER"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: false })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("users_role_idx").on(table.role)],
);

export const frames = pgTable(
  "frames",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 120 }).notNull(),
    imageUrl: text("image_url").notNull(),
    // Cloudinary public id. Null for legacy/local fallback files, which are
    // resolved through /api/files instead of the Cloudinary destroy API.
    imagePublicId: text("image_public_id"),
    // Source artwork dimensions and the transparent photo windows detected at
    // upload time. The studio uses these to paint photos into the overlay.
    imageWidth: integer("image_width").notNull().default(0),
    imageHeight: integer("image_height").notNull().default(0),
    windows: jsonb("windows").$type<FrameWindow[]>().notNull().default([]),
    category: varchar("category", { length: 24 }).notNull().default("cool"),
    layoutType: layoutEnum("layout_type").notNull(),
    createdAt: createdAt(),
  },
);

export const photoSessions = pgTable(
  "photo_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    finalPhotoUrl: text("final_photo_url").notNull(),
    accessKey: varchar("access_key", { length: 32 }).notNull().unique(),
    layoutType: layoutEnum("layout_type").notNull(),
    filterKey: varchar("filter_key", { length: 32 }).notNull().default("original"),
    downloadCount: integer("download_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: false }).notNull(),
    // Publishing is opt-in per guest. `publishedAt` is the single source of
    // truth for gallery membership so a photo can never appear publicly
    // because some other column happens to be set.
    publishedAt: timestamp("published_at", { withTimezone: false }),
    cloudinaryPublicId: varchar("cloudinary_public_id", { length: 191 }),
    cloudinaryUrl: text("cloudinary_url"),
    // Per-shot live clips: [{ slot, url, mime, durationMs, rect?, frameSrc? }].
    // `rect` is the printed photo window in layout-canvas pixels: a bitmap
    // frame draws the photos somewhere the layout's own slots do not describe,
    // and playback needs that window to cover the still exactly. `frameSrc` is
    // the frame artwork, painted above the photos at render time, so playback
    // repaints the part that overlaps the window over the video. Older rows have
    // neither and fall back to the layout slots.
    liveClips: jsonb("live_clips")
      .$type<
        {
          slot: number;
          url: string;
          mime: string;
          durationMs: number;
          rect?: FrameWindow;
          frameSrc?: string;
        }[]
      >()
      .notNull()
      .default([]),
    createdAt: createdAt(),
  },
  (table) => [
    index("sessions_expires_idx").on(table.expiresAt),
    index("sessions_published_idx").on(table.publishedAt),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Frame = typeof frames.$inferSelect;
export type NewFrame = typeof frames.$inferInsert;
export type PhotoSession = typeof photoSessions.$inferSelect;
export type NewPhotoSession = typeof photoSessions.$inferInsert;
