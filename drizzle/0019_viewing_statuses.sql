CREATE TABLE "show_statuses" (
	"user_id" text NOT NULL,
	"tmdb_id" integer NOT NULL,
	"status" text NOT NULL,
	"title" text NOT NULL,
	"poster" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "show_statuses_user_id_tmdb_id_pk" PRIMARY KEY("user_id","tmdb_id"),
	CONSTRAINT "show_statuses_id_check" CHECK ("show_statuses"."tmdb_id" > 0),
	CONSTRAINT "show_statuses_status_check" CHECK ("show_statuses"."status" in ('want_to_watch', 'watching', 'paused', 'finished', 'dropped')),
	CONSTRAINT "show_statuses_title_check" CHECK (length(trim("show_statuses"."title")) between 1 and 300)
);
--> statement-breakpoint
ALTER TABLE "show_statuses" ADD CONSTRAINT "show_statuses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;