ALTER TABLE "message" ADD COLUMN "encryptedContent" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "encryptedContentForSender" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "publicKey" text;