CREATE INDEX IF NOT EXISTS "soul_twin_actions_retry_idx" ON "soul_twin_actions" ("status", "executed_at", "attempt_count");
