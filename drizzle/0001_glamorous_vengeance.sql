CREATE TABLE "favorites" (
	"user_id" text NOT NULL,
	"tmdb_id" integer NOT NULL,
	"title" text NOT NULL,
	"poster" text,
	"subtitle" text,
	"rating" real,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_id_tmdb_id_pk" PRIMARY KEY("user_id","tmdb_id")
);
