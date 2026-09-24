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
  uniqueIndex,
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

// Saved items. `kind` splits the two lists: "favorite" (loved it) and
// "watchlist" (want to watch). Same columns, same reads, so one table.
// ponytail: split into its own table if watchlist grows columns favorites
// never need (priority, reminders, added-from).
export const favorites = pgTable(
  "favorites",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tmdbId: integer("tmdb_id").notNull(),
    kind: text("kind")
      .$type<"favorite" | "watchlist">()
      .notNull()
      .default("favorite"),
    // Part of the key: TMDB ids are only unique per media type, so a movie and
    // a show can share one.
    mediaType: text("media_type")
      .$type<"movie" | "tv">()
      .notNull()
      .default("movie"),
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
  (table) => [
    primaryKey({
      columns: [table.userId, table.tmdbId, table.mediaType, table.kind],
    }),
  ],
);

// ponytail: one flat table. `tmdbId` is always the *show* id for TV;
// `season`/`episode` narrow it. Both null = whole movie or whole show. Add a
// unique index on (userId, tmdbId, season, episode, watchedOn) if duplicate
// logs become a problem — rewatches make that a judgement call, so it is left
// open.
export const watchLog = pgTable(
  "watch_log",
  {
    id: serial("id").primaryKey(),
    importKey: text("import_key"),
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
    notes: text("notes"),
    /** Date only — nobody logs the minute they watched something. */
    watchedOn: date("watched_on").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("watch_log_user_date_idx").on(
      table.userId,
      table.watchedOn,
      table.id,
    ),
    uniqueIndex("watch_log_import_idx").on(table.userId, table.importKey),
  ],
);

/** Reviews are separate from watch logs: one per user per movie/show. */
export const reviews = pgTable(
  "reviews",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tmdbId: integer("tmdb_id").notNull(),
    mediaType: text("media_type")
      .$type<"movie" | "tv">()
      .notNull()
      .default("movie"),
    title: text("title").notNull(),
    poster: text("poster"),
    subtitle: text("subtitle"),
    /** 0.5-5 stars in half-star increments, null when not rated. */
    rating: real("rating"),
    review: text("review"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("reviews_user_media_idx").on(
      table.userId,
      table.tmdbId,
      table.mediaType,
    ),
    index("reviews_user_updated_idx").on(
      table.userId,
      table.updatedAt,
      table.id,
    ),
  ],
);

export const movieNights = pgTable("movie_nights", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export const nightMembers = pgTable(
  "night_members",
  {
    nightId: text("night_id")
      .notNull()
      .references(() => movieNights.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.nightId, table.userId] }),
    index("night_members_user_idx").on(table.userId),
  ],
);
export const nightVotes = pgTable(
  "night_votes",
  {
    nightId: text("night_id")
      .notNull()
      .references(() => movieNights.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tmdbId: integer("tmdb_id").notNull(),
    mediaType: text("media_type").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.nightId, table.userId, table.tmdbId, table.mediaType],
    }),
  ],
);
export const viewingPreferences = pgTable("viewing_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  region: text("region").notNull().default("US"),
  providerIds: text("provider_ids").notNull().default("[]"),
  watchlistPublic: boolean("watchlist_public").notNull().default(false),
});
export const availabilitySnapshots = pgTable(
  "availability_snapshots",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tmdbId: integer("tmdb_id").notNull(),
    mediaType: text("media_type").notNull(),
    region: text("region").notNull(),
    providerIds: text("provider_ids").notNull(),
    checkedAt: timestamp("checked_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.tmdbId, table.mediaType, table.region],
    }),
  ],
);
export const availabilityAlerts = pgTable(
  "availability_alerts",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventKey: text("event_key").notNull(),
    title: text("title").notNull(),
    href: text("href").notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    readAt: timestamp("read_at"),
  },
  (table) => [
    index("availability_alerts_user_idx").on(table.userId, table.id),
    uniqueIndex("availability_alerts_event_idx").on(
      table.userId,
      table.eventKey,
    ),
  ],
);
