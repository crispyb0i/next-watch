CREATE TABLE "watch_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tmdb_id" integer NOT NULL,
	"media_type" text DEFAULT 'movie' NOT NULL,
	"title" text NOT NULL,
	"poster" text,
	"subtitle" text,
	"rating" integer,
	"review" text,
	"watched_on" date NOT NULL,
	"rewatch" boolean DEFAULT false NOT NULL,
	"venue" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
