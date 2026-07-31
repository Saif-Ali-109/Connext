ALTER TABLE "message" ADD COLUMN "reaction" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "reactedByUserId" text;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_reactedByUserId_user_id_fk" FOREIGN KEY ("reactedByUserId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_content_trgm_idx" ON "message" USING gin ("content" gin_trgm_ops);