ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_admin" boolean DEFAULT false NOT NULL;

ALTER TABLE "user_reports" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'pending' NOT NULL;
ALTER TABLE "user_reports" ADD COLUMN IF NOT EXISTS "reviewed_by_id" text;
ALTER TABLE "user_reports" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone;

DO $$ BEGIN
 ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reviewed_by_id_users_id_fk"
   FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "user_reports_status_idx" ON "user_reports" ("status");
