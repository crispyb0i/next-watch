import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  serial,
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

// ponytail: no `status` column — follows are public and instant, so a row means
// "following". Add status plus a pending state if private accounts land.
export const follows = pgTable(
  "follows",
  {
    followerId: text("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followeeId: text("followee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.followerId, table.followeeId] }),
    // The feed reads "who does X follow", the profile reads "who follows X".
    // The PK covers the first direction; this index covers the second.
    index("follows_followee_idx").on(table.followeeId),
    // Self-follow would put the user in their own feed.
    check("follows_no_self", sql`${table.followerId} <> ${table.followeeId}`),
  ],
);

// ponytail: movies only. Add a `mediaType` column when TV favorites land.
export const favorites = pgTable(
  "favorites",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tmdbId: integer("tmdb_id").notNull(),
    // ponytail: one text column instead of (mediaType, season, episode) — the
    // favorites grid only ever needs somewhere to link. Break it into typed
    // columns if favorites ever need filtering or grouping by media type.
    href: text("href"),
    title: text("title").notNull(),
    poster: text("poster"),
    subtitle: text("subtitle"),
    rating: real("rating"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.tmdbId] })],
);

// ponytail: one flat table. `tmdbId` is always the *show* id for TV;
// `season`/`episode` narrow it. Both null = whole movie or whole show. Add a
// unique index on (userId, tmdbId, season, episode, watchedOn) if duplicate
// logs become a problem — rewatches make that a judgement call, so it is left
// open.
export const watchLog = pgTable("watch_log", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tmdbId: integer("tmdb_id").notNull(),
  mediaType: text("media_type")
    .$type<"movie" | "tv">()
    .notNull()
    .default("movie"),
  /** TV only. Null on movies and whole-show logs. */
  season: integer("season"),
  /** TV only. Null on movies, whole-show and whole-season logs. */
  episode: integer("episode"),
  title: text("title").notNull(),
  poster: text("poster"),
  subtitle: text("subtitle"),
  /** 0.5-5 stars in half-star increments, null when not rated. */
  rating: real("rating"),
  review: text("review"),
  /** Date only — nobody logs the minute they watched something. */
  watchedOn: date("watched_on").notNull(),
  rewatch: boolean("rewatch").notNull().default(false),
  venue: text("venue"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
