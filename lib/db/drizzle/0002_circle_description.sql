-- Add description/rules field to circles table
ALTER TABLE "circles" ADD COLUMN IF NOT EXISTS "description" text;
