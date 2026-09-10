import {
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ponytail: movies only, and `userId` is the auth `sub` with no FK to `users`
// (nothing populates that table yet). Add the FK plus a `mediaType` column when
// user profiles or TV favorites land.
export const favorites = pgTable(
  "favorites",
  {
    userId: text("user_id").notNull(),
    tmdbId: integer("tmdb_id").notNull(),
    title: text("title").notNull(),
    poster: text("poster"),
    subtitle: text("subtitle"),
    rating: real("rating"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.tmdbId] })],
);
