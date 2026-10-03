ALTER TABLE "reviews" DROP CONSTRAINT "reviews_episode_check";--> statement-breakpoint
ALTER TABLE "favorites" DROP CONSTRAINT "favorites_user_id_tmdb_id_media_type_kind_pk";--> statement-breakpoint
ALTER TABLE "favorites" ADD COLUMN "season" integer DEFAULT -1 NOT NULL;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_tmdb_id_media_type_kind_season_pk" PRIMARY KEY("user_id","tmdb_id","media_type","kind","season");--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_season_check" CHECK ("favorites"."season" = -1 or ("favorites"."media_type" = 'tv' and "favorites"."season" >= 0));--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_episode_check" CHECK (("reviews"."season" is null and "reviews"."episode" is null) or ("reviews"."media_type" = 'tv' and "reviews"."season" is not null and "reviews"."season" >= 0 and ("reviews"."episode" is null or "reviews"."episode" > 0)));
