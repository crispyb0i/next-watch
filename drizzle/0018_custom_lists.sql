CREATE TABLE "custom_list_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"list_id" text NOT NULL,
	"tmdb_id" integer NOT NULL,
	"media_type" text NOT NULL,
	"season" integer DEFAULT -1 NOT NULL,
	"episode" integer DEFAULT -1 NOT NULL,
	"title" text NOT NULL,
	"poster" text,
	"subtitle" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "custom_list_items_media_check" CHECK ("custom_list_items"."tmdb_id" > 0 and "custom_list_items"."media_type" in ('movie', 'tv')),
	CONSTRAINT "custom_list_items_coordinates_check" CHECK (("custom_list_items"."season" = -1 and "custom_list_items"."episode" = -1) or ("custom_list_items"."media_type" = 'tv' and "custom_list_items"."season" >= 0 and ("custom_list_items"."episode" = -1 or "custom_list_items"."episode" > 0))),
	CONSTRAINT "custom_list_items_title_check" CHECK (length(trim("custom_list_items"."title")) between 1 and 300)
);
--> statement-breakpoint
CREATE TABLE "custom_lists" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "custom_lists_title_check" CHECK (length(trim("custom_lists"."title")) between 1 and 100),
	CONSTRAINT "custom_lists_description_check" CHECK (length("custom_lists"."description") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "custom_list_items" ADD CONSTRAINT "custom_list_items_list_id_custom_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."custom_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_lists" ADD CONSTRAINT "custom_lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_list_items_identity_idx" ON "custom_list_items" USING btree ("list_id","tmdb_id","media_type","season","episode");--> statement-breakpoint
CREATE INDEX "custom_lists_user_idx" ON "custom_lists" USING btree ("user_id","updated_at");