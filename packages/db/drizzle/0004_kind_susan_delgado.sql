CREATE TABLE "chat_clear" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"roomId" text NOT NULL,
	"clearedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_clear" ADD CONSTRAINT "chat_clear_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_clears_user_room_idx" ON "chat_clear" USING btree ("userId","roomId");--> statement-breakpoint
CREATE INDEX "chat_clears_room_id_idx" ON "chat_clear" USING btree ("roomId");