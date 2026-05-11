ALTER TABLE "soul_twin_actions" ADD COLUMN IF NOT EXISTS "attempt_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "soul_twin_actions" ADD COLUMN IF NOT EXISTS "last_attempt_at" timestamp;
ALTER TABLE "soul_twin_actions" ADD COLUMN IF NOT EXISTS "last_error" text;
