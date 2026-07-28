CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "chat_request" (
	"id" text PRIMARY KEY NOT NULL,
	"fromUserId" text NOT NULL,
	"toUserId" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"fromCustomName" text,
	"toCustomName" text,
	"hiddenBy" text[] DEFAULT '{}' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_code_rate_limit" (
	"identifier" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"windowStart" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"createdById" text NOT NULL,
	"acceptedById" text,
	"expiresAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invite_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" text PRIMARY KEY NOT NULL,
	"senderId" text NOT NULL,
	"roomId" text NOT NULL,
	"content" text,
	"read" boolean DEFAULT false NOT NULL,
	"deliveredAt" timestamp,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"emailVerified" timestamp,
	"image" text,
	"username" text,
	"passwordHash" text,
	"displayName" text,
	"avatarUrl" text,
	"fcmToken" text,
	"lastSeenAt" timestamp DEFAULT now(),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verification_code" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"email" text NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"usedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_request" ADD CONSTRAINT "chat_request_fromUserId_user_id_fk" FOREIGN KEY ("fromUserId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_request" ADD CONSTRAINT "chat_request_toUserId_user_id_fk" FOREIGN KEY ("toUserId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_createdById_user_id_fk" FOREIGN KEY ("createdById") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_acceptedById_user_id_fk" FOREIGN KEY ("acceptedById") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_senderId_user_id_fk" FOREIGN KEY ("senderId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_code" ADD CONSTRAINT "verification_code_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "account" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_request_pair_idx" ON "chat_request" USING btree ("fromUserId","toUserId");--> statement-breakpoint
CREATE INDEX "chat_requests_status_idx" ON "chat_request" USING btree ("status");--> statement-breakpoint
CREATE INDEX "messages_room_id_idx" ON "message" USING btree ("roomId");--> statement-breakpoint
CREATE INDEX "messages_room_id_timestamp_idx" ON "message" USING btree ("roomId","timestamp");--> statement-breakpoint
CREATE INDEX "messages_sender_id_idx" ON "message" USING btree ("senderId");--> statement-breakpoint
CREATE INDEX "messages_read_room_id_idx" ON "message" USING btree ("roomId","read");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "verification_codes_user_id_idx" ON "verification_code" USING btree ("userId");