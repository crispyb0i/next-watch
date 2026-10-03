ALTER TABLE "reviews" ADD COLUMN "document" jsonb;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "status" text DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_status_check" CHECK ("reviews"."status" in ('draft', 'published'));