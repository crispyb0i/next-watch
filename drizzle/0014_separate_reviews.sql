CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tmdb_id" integer NOT NULL,
	"media_type" text DEFAULT 'movie' NOT NULL,
	"title" text NOT NULL,
	"poster" text,
	"subtitle" text,
	"rating" real,
	"review" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watch_log" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_user_media_idx" ON "reviews" USING btree ("user_id","tmdb_id","media_type");--> statement-breakpoint
CREATE INDEX "reviews_user_updated_idx" ON "reviews" USING btree ("user_id","updated_at","id");--> statement-breakpoint
INSERT INTO "reviews" ("user_id", "tmdb_id", "media_type", "title", "poster", "subtitle", "rating", "review", "created_at", "updated_at")
SELECT DISTINCT ON ("user_id", "tmdb_id", "media_type") "user_id", "tmdb_id", "media_type", "title", "poster", "subtitle", "rating", "review", "created_at", "created_at"
FROM "watch_log"
WHERE "rating" IS NOT NULL OR "review" IS NOT NULL
ORDER BY "user_id", "tmdb_id", "media_type", "watched_on" DESC, "id" DESC;--> statement-breakpoint
ALTER TABLE "watch_log" DROP COLUMN "rating";--> statement-breakpoint
ALTER TABLE "watch_log" DROP COLUMN "review";--> statement-breakpoint
ALTER TABLE "watch_log" DROP COLUMN "rewatch";--> statement-breakpoint
ALTER TABLE "watch_log" DROP COLUMN "venue";