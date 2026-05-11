CREATE TABLE "chat_screenshot_events" (
"id" serial PRIMARY KEY NOT NULL,
"conversation_id" integer NOT NULL,
"screenshotter_id" text NOT NULL,
"peer_id" text NOT NULL,
"platform" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "chat_screenshots_taken" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_screenshot_events" ADD CONSTRAINT "chat_screenshot_events_conversation_id_direct_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."direct_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_screenshot_events" ADD CONSTRAINT "chat_screenshot_events_screenshotter_id_users_id_fk" FOREIGN KEY ("screenshotter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_screenshot_events" ADD CONSTRAINT "chat_screenshot_events_peer_id_users_id_fk" FOREIGN KEY ("peer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_screenshot_events_screenshotter_idx" ON "chat_screenshot_events" USING btree ("screenshotter_id");--> statement-breakpoint
CREATE INDEX "chat_screenshot_events_conversation_idx" ON "chat_screenshot_events" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "chat_screenshot_events_taker_created_idx" ON "chat_screenshot_events" USING btree ("screenshotter_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_screenshot_events_peer_created_idx" ON "chat_screenshot_events" USING btree ("peer_id","created_at");
