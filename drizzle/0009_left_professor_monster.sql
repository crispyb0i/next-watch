-- Column first: the new primary key references it. drizzle-kit emitted these
-- in the opposite order, which fails on an existing table.
ALTER TABLE "favorites" ADD COLUMN "media_type" text DEFAULT 'movie' NOT NULL;--> statement-breakpoint
ALTER TABLE "favorites" DROP CONSTRAINT "favorites_user_id_tmdb_id_pk";--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_tmdb_id_media_type_pk" PRIMARY KEY("user_id","tmdb_id","media_type");
