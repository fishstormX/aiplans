-- Targeted migration: earlier schema changes were applied by the raw SQL runner,
-- so generating a full diff against Drizzle's initial snapshot is inappropriate.
-- Idempotent because scripts/migrate-data-accuracy.ts runs DDL on every deploy.
DO $$ BEGIN
  CREATE TYPE "public"."third_party_coverage" AS ENUM ('none', 'partial', 'full', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "third_party_coverage" "public"."third_party_coverage" DEFAULT 'unknown' NOT NULL;
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "third_party_coverage_note" text;
