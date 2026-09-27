import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["USER", "ADMIN"]);
export const layoutEnum = pgEnum("layout_type", [
  "STRIP_3",
  "STRIP_4",
  "GRID_4",
  "SINGLE",
]);

export type Role = (typeof roleEnum.enumValues)[number];
export type LayoutType = (typeof layoutEnum.enumValues)[number];

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

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 160 }).notNull().unique(),
    accessCode: varchar("access_code", { length: 64 }),
    retentionHours: integer("retention_hours").notNull().default(24),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [index("events_creator_idx").on(table.creatorId)],
);

export const frames = pgTable(
  "frames",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 120 }).notNull(),
    imageUrl: text("image_url").notNull(),
    layoutType: layoutEnum("layout_type").notNull(),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [index("frames_event_idx").on(table.eventId)],
);

export const photoSessions = pgTable(
  "photo_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    finalPhotoUrl: text("final_photo_url").notNull(),
    accessKey: varchar("access_key", { length: 32 }).notNull().unique(),
    layoutType: layoutEnum("layout_type").notNull(),
    filterKey: varchar("filter_key", { length: 32 }).notNull().default("original"),
    downloadCount: integer("download_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: false }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("sessions_event_idx").on(table.eventId),
    index("sessions_expires_idx").on(table.expiresAt),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  events: many(events),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  creator: one(users, {
    fields: [events.creatorId],
    references: [users.id],
  }),
  frames: many(frames),
  photoSessions: many(photoSessions),
}));

export const framesRelations = relations(frames, ({ one }) => ({
  event: one(events, {
    fields: [frames.eventId],
    references: [events.id],
  }),
}));

export const photoSessionsRelations = relations(photoSessions, ({ one }) => ({
  event: one(events, {
    fields: [photoSessions.eventId],
    references: [events.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Frame = typeof frames.$inferSelect;
export type NewFrame = typeof frames.$inferInsert;
export type PhotoSession = typeof photoSessions.$inferSelect;
export type NewPhotoSession = typeof photoSessions.$inferInsert;
