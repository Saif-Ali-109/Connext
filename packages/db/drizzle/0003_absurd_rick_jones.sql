ALTER TABLE "message" ADD COLUMN "senderKeyFingerprint" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "keyFingerprint" text;