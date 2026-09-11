import {
  boolean,
  date,
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

// ponytail: movies only, and `userId` is the auth `sub` with no FK to `users`
// (nothing populates that table yet). Add the FK plus a `mediaType` column when
// user profiles or TV favorites land.
export const favorites = pgTable(
  "favorites",
  {
    userId: text("user_id").notNull(),
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

// ponytail: one flat table, `userId` is the auth `sub` with no FK (same as
// `favorites`). `tmdbId` is always the *show* id for TV; `season`/`episode`
// narrow it. Both null = whole movie or whole show. Add a unique index on
// (userId, tmdbId, season, episode, watchedOn) if duplicate logs become a
// problem — rewatches make that a judgement call, so it is left open.
export const watchLog = pgTable("watch_log", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  tmdbId: integer("tmdb_id").notNull(),
  mediaType: text("media_type").notNull().default("movie"),
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
