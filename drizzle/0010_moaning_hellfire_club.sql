ALTER TABLE "favorites" ADD COLUMN "kind" text DEFAULT 'favorite' NOT NULL;--> statement-breakpoint
ALTER TABLE "favorites" DROP CONSTRAINT "favorites_user_id_tmdb_id_media_type_pk";--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_tmdb_id_media_type_kind_pk" PRIMARY KEY("user_id","tmdb_id","media_type","kind");
