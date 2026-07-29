ALTER TABLE "message" ADD COLUMN IF NOT EXISTS "encryptedContent" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN IF NOT EXISTS "encryptedContentForSender" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "publicKey" text;
