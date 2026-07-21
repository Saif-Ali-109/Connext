# Progress

Task tracker for Connext. Each entry has a `name` and a one-line `description` so any agent can
tell what it is at a glance. Add new tasks under `pending`; move them to `completed` when done.
Keep this file current whenever a feature is finished or a task is created.

completed:
  - name: monorepo-setup
    description: npm-workspaces monorepo with apps/web, apps/server, packages/db, packages/types.
  - name: postgres-drizzle-migration
    description: Data layer moved from Mongoose/MongoDB to PostgreSQL with Drizzle ORM (models deleted).
  - name: auth-google-oauth
    description: Google OAuth sign-in via Auth.js (NextAuth v5), enabled when Google client vars are set.
  - name: auth-email-magic-code
    description: Passwordless email sign-in that emails a 6-digit code (10-min expiry) over SMTP.
  - name: auth-email-password
    description: Email + password sign-in via Credentials provider for returning users.
  - name: auth-anonymous-username
    description: Anonymous signup with just a username + password (no email); login accepts email or username via the Credentials provider.
  - name: auth-bridge
    description: HMAC-signed 60s bridge from Next.js Auth.js session to a stateless Express JWT cookie.
  - name: e2ee-scaffolding
    description: RSA-OAEP helpers (crypto.ts), public-key endpoint, and encrypted-content columns exist but are NOT wired up — messages are currently sent and stored as plaintext.
  - name: realtime-socketio
    description: Socket.IO gateway for message delivery, room joins, and online presence.
  - name: chat-requests
    description: Send/accept/decline/delete chat requests to connect two users before messaging.
  - name: invite-links
    description: Reusable invite links (valid 7 days) to connect via a shared link; each accepter gets a private room with the creator.
  - name: contact-management
    description: Per-user custom contact names, hiding contacts, and disconnecting.
  - name: unread-and-presence
    description: Unread message counts and online-status lookups per user.
  - name: media-sharing-r2
    description: Pre-signed upload/download URLs backed by Cloudflare R2 (optional, S3-compatible).
  - name: push-notifications-fcm
    description: Optional Firebase Cloud Messaging push notifications with device-token registration.
  - name: onboarding-flow
    description: Onboarding page to set username/display name (does not generate an E2EE key pair — see wire-up-e2ee).
  - name: security-hardening
    description: Helmet, CORS allowlist, rate limiting, httpOnly JWT cookies, and body-size limits.
  - name: readme-docs
    description: Comprehensive README covering architecture, setup, env vars, and API overview.
  - name: agent-docs
    description: CLAUDE.md and this progress.md so agents understand the project and track work.

  - name: refresh-stale-documentation
    description: documentation.md rewritten for the current Postgres/Auth.js app; README.md corrected to drop the false E2EE claim.

  - name: login-signup-redesign
    description: Login/signup redesigned with segmented tabs, animated gradient buttons, aurora backdrop, and "forgot password" email-code recovery (dark-only standalone theme).

  - name: ui-animation-pass
    description: Violet accent threaded through the CSS-variable theme (light+dark); framer-motion animations across nav, dashboard, requests, chat, onboarding, invite, verify, and home. Shared motion primitives in components/ui/motion.tsx; onboarding + login/verify migrated off hardcoded zinc to theme tokens.

pending:
  - name: wire-up-e2ee
    description: Connect the existing E2EE scaffolding (key generation at onboarding, public-key upload, encrypt on send, decrypt on receive) so the server stops seeing plaintext.
  - name: automated-tests
    description: No test suite exists yet; add unit/integration tests and wire them into workspace scripts.
  - name: rotate-leaked-api-key
    description: Rotate the hardcoded Anthropic API key in .claude/settings.json and keep it out of git.
  - name: fix-open-bug
    description: Investigate and resolve the issue captured in bugs/bug.png (details not yet triaged).
