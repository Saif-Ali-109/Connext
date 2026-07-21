# Connext

Connext is a real-time, one-to-one messaging application built with Next.js, Express, Socket.IO, and PostgreSQL (via Drizzle ORM). It provides a seamless path from user registration, finding contacts, accepting requests, and instant real-time chat.

## Key Features

- **Flexible Authentication**: Sign up with username & password (no email required) or email & password.
- **OAuth & Email Sign-In**: Supports Google OAuth 2.0 and 6-digit SMTP email verification codes.
- **User Discovery & Requests**: Search for users by username or email, send connection requests, and approve pairs before messaging.
- **Shareable Invites**: Generate 7-day reusable invite links for quick connection onboarding.
- **Real-Time WebSockets Messaging**: Instant 1-on-1 chat powered by Socket.IO with automatic fallback.
- **Live Message Receipts**: Sent (`✓`), Delivered (`✓✓`), and Read (`✓✓` blue) live status updates.
- **Browser Notifications**: Real-time pop-up notification alerts when messages arrive while the app is active.
- **Modern UI & Aesthetic**: Dynamic dark mode interface built with React 19, Next.js 15, Framer Motion, and Tailwind CSS.

## Screenshots

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

## Project Architecture

| Workspace | Description | Technology Stack |
| --- | --- | --- |
| `apps/web` | Frontend Web Client & NextAuth UI | Next.js 15, React 19, Tailwind CSS, Socket.IO Client |
| `apps/server` | Backend REST API & Socket.IO Server | Express, Socket.IO 4, JWT, Helmet |
| `packages/db` | Database Schema & Client | PostgreSQL, Drizzle ORM |
| `packages/types` | Shared TypeScript interfaces | TypeScript |

## Getting Started

### Prerequisites

- Node.js LTS (v18+)
- npm
- PostgreSQL database (or Supabase instance)

### Installation & Environment Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Saif-Ali-109/Connext.git
   cd Connext
   npm install
   ```

2. **Configure environment variables:**

   Create `apps/web/.env.local`:
   ```env
   DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/postgres
   AUTH_SECRET=your-random-auth-secret
   NEXT_PUBLIC_SERVER_URL=http://localhost:4001
   ```

   Create `apps/server/.env`:
   ```env
   DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/postgres
   AUTH_SECRET=your-random-auth-secret
   JWT_SECRET=your-random-jwt-secret
   ALLOWED_ORIGINS=http://localhost:3000
   PORT=4001
   ```

3. **Push Database Schema & Run Development:**
   ```bash
   npm run db:push
   npm run dev
   ```

- Web App: `http://localhost:3000`
- API Server: `http://localhost:4001`

## Available Commands

```bash
npm run dev          # Runs database build, then web + server concurrently
npm run dev:web      # Runs Next.js web frontend
npm run dev:server   # Runs Express API & Socket.IO backend
npm run db:push      # Applies Drizzle schema to PostgreSQL
npm run build        # Builds all workspaces for production
npm run lint         # Runs ESLint checks across workspaces
```
