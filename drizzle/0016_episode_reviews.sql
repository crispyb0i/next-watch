DROP INDEX "reviews_user_media_idx";--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "season" integer;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "episode" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_user_media_idx" ON "reviews" USING btree ("user_id","tmdb_id","media_type",coalesce("season", -1),coalesce("episode", -1));--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_episode_check" CHECK (("reviews"."season" is null and "reviews"."episode" is null) or ("reviews"."media_type" = 'tv' and "reviews"."season" is not null and "reviews"."episode" is not null and "reviews"."season" >= 0 and "reviews"."episode" > 0));