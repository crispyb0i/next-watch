CREATE TABLE "availability_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"href" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "availability_snapshots" (
	"user_id" text NOT NULL,
	"tmdb_id" integer NOT NULL,
	"media_type" text NOT NULL,
	"region" text NOT NULL,
	"provider_ids" text NOT NULL,
	"checked_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "availability_snapshots_user_id_tmdb_id_media_type_region_pk" PRIMARY KEY("user_id","tmdb_id","media_type","region")
);
--> statement-breakpoint
CREATE TABLE "movie_nights" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "night_members" (
	"night_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "night_members_night_id_user_id_pk" PRIMARY KEY("night_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "night_votes" (
	"night_id" text NOT NULL,
	"user_id" text NOT NULL,
	"tmdb_id" integer NOT NULL,
	"media_type" text NOT NULL,
	CONSTRAINT "night_votes_night_id_user_id_tmdb_id_media_type_pk" PRIMARY KEY("night_id","user_id","tmdb_id","media_type")
);
--> statement-breakpoint
CREATE TABLE "viewing_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"region" text DEFAULT 'US' NOT NULL,
	"provider_ids" text DEFAULT '[]' NOT NULL,
	"watchlist_public" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watch_log" ADD COLUMN "import_key" text;--> statement-breakpoint
ALTER TABLE "availability_alerts" ADD CONSTRAINT "availability_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_snapshots" ADD CONSTRAINT "availability_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movie_nights" ADD CONSTRAINT "movie_nights_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_members" ADD CONSTRAINT "night_members_night_id_movie_nights_id_fk" FOREIGN KEY ("night_id") REFERENCES "public"."movie_nights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_members" ADD CONSTRAINT "night_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_votes" ADD CONSTRAINT "night_votes_night_id_movie_nights_id_fk" FOREIGN KEY ("night_id") REFERENCES "public"."movie_nights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_votes" ADD CONSTRAINT "night_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewing_preferences" ADD CONSTRAINT "viewing_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_alerts_user_idx" ON "availability_alerts" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "night_members_user_idx" ON "night_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "watch_log_user_date_idx" ON "watch_log" USING btree ("user_id","watched_on","id");--> statement-breakpoint
CREATE UNIQUE INDEX "watch_log_import_idx" ON "watch_log" USING btree ("user_id","import_key");