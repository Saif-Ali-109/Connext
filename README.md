# Connext

Connext is a one-to-one, real-time messaging app. It gives people a simple path from creating an account, to finding someone, approving a connection, and having a live conversation.

The project is an npm-workspaces monorepo with a Next.js web app, an Express and Socket.IO server, and a PostgreSQL database managed with Drizzle ORM.

## Security status

Connext is **not end-to-end encrypted** right now. The active chat client sends message text as `content`; the server receives it and stores it in PostgreSQL in `message.content`. HTTPS and WSS protect traffic in transit when the app is deployed securely, but the server and anyone with database access can read message contents.

The codebase does contain E2EE groundwork: RSA-OAEP browser helpers, a public-key endpoint, and encrypted-content fields. That groundwork is not connected to onboarding or the chat send/receive path, so it is not a working privacy feature yet.

## A quick look

<p align="center">
  <img src="Screenshots/Signin.png" alt="Connext sign-in screen" width="48%" />
  <img src="Screenshots/Sign-up.png" alt="Connext account creation screen" width="48%" />
</p>

<p align="center">
  <img src="Screenshots/Dashboard.png" alt="Connext chat dashboard" width="48%" />
  <img src="Screenshots/Chatbox.png" alt="Connext conversation screen" width="48%" />
</p>

<p align="center">
  <img src="Screenshots/Requests.png" alt="Connext connection requests screen" width="48%" />
  <img src="Screenshots/Search.png" alt="Connext people search screen" width="48%" />
</p>

## What is working

- Username-and-password signup with no email required.
- Sign-in with a username or email and password.
- Optional Google OAuth and six-digit email-code sign-in when configured.
- Password recovery through the email-code flow.
- Username onboarding, people search, and chat requests.
- Reusable invite links that expire after seven days.
- One-to-one real-time text chat through Socket.IO.
- Unread counts plus sent, delivered, and read message states.
- Browser notifications for live incoming messages while the app is open.

People can only message after they have an accepted connection. Each pair has a stable room ID and a separate conversation history.

### Implemented on the server, not yet exposed in chat

The server has Cloudflare R2 media endpoints, Firebase Cloud Messaging endpoints, contact renaming/disconnecting, and typing events. The checked-in chat UI is text-only: it has no file picker, does not register an FCM token, and does not show typing indicators or contact-management controls. These are API capabilities, not completed web-app features.

## Project layout

| Path | Purpose |
| --- | --- |
| `apps/web` | Next.js web app, Auth.js sign-in, onboarding, dashboard, and chat |
| `apps/server` | Express API, Socket.IO gateway, media, and notification endpoints |
| `packages/db` | PostgreSQL schema, Drizzle client, room helpers, and password helpers |
| `packages/types` | Shared TypeScript types |
| `Screenshots` | Images used in this README |

The web app normally runs on port `3000`; the API and Socket.IO server run on port `4001`.

## Run locally

### Prerequisites

- A current Node.js LTS release
- npm
- PostgreSQL

Google OAuth and SMTP are optional. Username-and-password signup does not need either provider.

### Install and configure

```bash
git clone https://github.com/saif634/Connext.git
cd Connext
npm install
```

Create `apps/web/.env.local` and `apps/server/.env`. Keep them local. The web app and API need the same `AUTH_SECRET`; the API also needs a strong `JWT_SECRET`.

```dotenv
# apps/web/.env.local
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/connext
AUTH_SECRET=replace-with-a-long-random-value
NEXT_PUBLIC_SERVER_URL=http://localhost:4001

# apps/server/.env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/connext
AUTH_SECRET=replace-with-the-same-auth-secret
JWT_SECRET=replace-with-another-long-random-value
ALLOWED_ORIGINS=http://localhost:3000
```

Add `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` in the web environment for Google sign-in. Add `EMAIL_SERVER` and optionally `EMAIL_FROM` for email-code sign-in.

```bash
npm run db:push
npm run dev
```

Use `npm run dev:web` or `npm run dev:server` to run one side independently. Once PostgreSQL is reachable and the API has started, `http://localhost:4001/health` returns `{ "ok": true }`.

## Configuration

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | web, server | PostgreSQL connection string |
| `AUTH_SECRET` | web, server | Auth.js secret and API-bridge signing key |
| `JWT_SECRET` | server | Signs the API session cookie |
| `JWT_EXPIRES_DAYS` | server | API JWT lifetime, default `7d` |
| `NEXT_PUBLIC_SERVER_URL` | web | Public API URL |
| `PORT` | server | API port, default `4001` |
| `ALLOWED_ORIGINS` | server | Production CORS allowlist |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | web | Enables Google OAuth |
| `EMAIL_SERVER`, `EMAIL_FROM` | web | Enables the SMTP email-code provider |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | server | Enables the R2 media API |
| `R2_REGION`, `R2_SIGNED_URL_TTL_SECONDS`, `MAX_MEDIA_FILE_BYTES` | server | R2 settings |
| `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` | server | Enables the FCM API |

## How sign-in reaches the API

Auth.js handles browser sign-in. After a person signs in, the web app asks `/api/auth/bridge` for a 60-second HMAC-signed payload and posts it to the Express server at `/auth/bridge`. The server verifies that payload, creates or updates the user, and sets an `httpOnly` JWT cookie. Later REST calls and Socket.IO connections use that API cookie.

## Commands

```bash
npm run dev          # Build the database package, then run web and server
npm run dev:web      # Build the database package, then run Next.js
npm run dev:server   # Build the database package, then run Express and Socket.IO
npm run db:push      # Apply the Drizzle schema to PostgreSQL
npm run build        # Build all workspaces
npm run lint         # Run workspace lint scripts
```

At the current revision, `npm run lint --workspace=connext-web` fails before linting because the legacy `next lint` command cannot serialize `apps/web/.eslintrc.json` (a circular ESLint configuration error). The lint setup needs migration to the ESLint CLI.

## Deployment

Deploy `apps/web` as a Next.js application and `apps/server` as a Node.js service. Both need the same PostgreSQL database. In production, use HTTPS, set an exact `ALLOWED_ORIGINS` value, configure `NEXT_PUBLIC_SERVER_URL` with the public API URL, and make OAuth redirect URLs match the web deployment.

Before presenting Connext as a private messenger, complete and independently review the E2EE work. Until then, it is accurately described as a real-time chat app with encrypted transport in an HTTPS deployment, not an end-to-end encrypted messenger.
