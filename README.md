# CivicLens

Government made legible. CivicLens tracks bills, school board meetings, and civic documents at every level of government — federal, state, county, city, and school district — and summarises them in plain English.

---

## Monorepo structure

```
civiclens/
├── apps/
│   ├── web/        React + Vite + Tailwind CSS v4 (web dashboard)
│   └── mobile/     React Native + Expo + Expo Router (iOS & Android)
├── packages/
│   ├── api/        Hono API server (Node.js / tsx)
│   ├── db/         Prisma schema + migrations
│   └── shared/     Shared TypeScript types
├── docker-compose.yml
├── turbo.json
└── .env.example
```

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 22 | https://nodejs.org |
| pnpm | ≥ 10 | `npm i -g pnpm` |
| Docker Desktop | latest | https://docker.com/products/docker-desktop |

> **No Docker?** Use [Supabase](https://supabase.com) for Postgres and [Upstash](https://upstash.com) for Redis (both have free tiers). See the `.env.example` for the connection string formats.

---

## Local setup

### 1. Clone and install

```bash
git clone https://github.com/jmcleod1208/civiclens.git
cd civiclens
pnpm install
```

### 2. Configure environment variables

```bash
cp .env.example packages/db/.env
```

Open `packages/db/.env` and fill in every value. At minimum you need:

- `DATABASE_URL` — Postgres connection string
- `REDIS_URL` or `REDIS_HOST` / `REDIS_PORT` — Redis connection
- `JWT_SECRET` — any long random string (see comment in `.env.example` for generator command)
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — from your Supabase project settings
- `OPENAI_API_KEY` — for document summarisation

API keys for scrapers (`CONGRESS_API_KEY`, `OPENSTATES_API_KEY`, etc.) are only needed when running the corresponding scrapers.

### 3. Start local services (Postgres + Redis)

```bash
docker compose up -d
```

Verify they are healthy:

```bash
docker compose ps
```

### 4. Run database migrations

```bash
cd packages/db
node_modules/.bin/prisma migrate deploy
cd ../..
```

### 5. Generate Prisma client

```bash
cd packages/db
node_modules/.bin/prisma generate
cd ../..
```

### 6. Start everything

```bash
pnpm turbo dev
```

This starts all three apps in parallel:

| App | URL |
|---|---|
| API | http://localhost:3000 |
| Web | http://localhost:5173 |
| Mobile | Expo DevTools (follow the terminal prompt) |

Or start individual apps:

```bash
pnpm --filter @civiclens/api dev
pnpm --filter @civiclens/web dev
pnpm --filter @civiclens/mobile dev
```

---

## Mobile development

The mobile app uses `react-native-purchases` (RevenueCat) and `expo-notifications`, both of which require native modules. **Expo Go is not supported** — you need a development build.

### Create a development build

```bash
# Install EAS CLI (once)
npm install -g eas-cli

# Log in
eas login

# Build for iOS simulator
eas build --profile development --platform ios

# Build for Android emulator
eas build --profile development --platform android
```

### Mobile environment variables

Create `apps/mobile/.env`:

```ini
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_REVENUECAT_IOS_KEY=your_ios_public_key
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=your_android_public_key
```

---

## Running the scrapers

Scrapers populate the database with real civic documents. Run them individually from the API package:

```bash
# Congress.gov bills (federal)
pnpm --filter @civiclens/api test:congress

# OpenStates bills (state — edit the test file to choose your state)
pnpm --filter @civiclens/api test:openstates

# BoardDocs school board meetings
pnpm --filter @civiclens/api test:boarddocs
```

In production, scrapers run on cron schedules via BullMQ (every 6 h for Congress, 12 h for OpenStates, 24 h for BoardDocs). Start workers alongside the API server.

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/api/auth/signup` | Create account + start trial |
| `POST` | `/api/auth/login` | Authenticate, return JWT |
| `POST` | `/api/subscriptions/verify` | Validate RevenueCat receipt |
| `GET` | `/api/subscriptions/status` | Re-check entitlement |
| `GET` | `/api/documents` | Paginated document list |
| `GET` | `/api/documents/:id` | Document detail + politicians |
| `GET` | `/api/politicians` | Paginated politician list |
| `GET` | `/api/politicians/:id` | Politician profile + documents |
| `GET` | `/api/jurisdictions/lookup?address=` | Geocode address → jurisdictions |
| `GET` | `/api/search?q=` | Full-text search |
| `GET` | `/api/topics/trending` | Top 10 trending topics |

Authenticated routes accept `Authorization: Bearer <jwt>` from `/api/auth/signup` or `/api/auth/login`.

---

## Architecture

```
┌─────────────────────────────┐
│  apps/web   apps/mobile     │   React + React Native clients
└───────────┬─────────────────┘
            │ HTTP (REST)
┌───────────▼─────────────────┐
│       packages/api          │   Hono, Node.js
│  routes · middleware · jobs │
└──────┬──────────────────────┘
       │
 ┌─────┴──────┐  ┌───────────────┐
 │  Postgres  │  │     Redis     │
 │ (Supabase) │  │  (Upstash)    │   BullMQ queues
 └────────────┘  └───────────────┘
       │
┌──────┴──────────────────────┐
│  External APIs              │
│  Congress.gov · OpenStates  │
│  BoardDocs · Gemini · GPT-4o│
│  Supabase Auth · RevenueCat │
└─────────────────────────────┘
```

---

## Subscription model

- **Trial**: 7-day free trial starting at signup — full access to Plain English summaries
- **Premium**: $4.99/month via RevenueCat (iOS App Store, Google Play, or web via Stripe)
- **Free tier**: full document text is always visible; summaries are paywalled after trial

---

## Tech stack

| Layer | Technology |
|---|---|
| Web frontend | React 19, Vite, Tailwind CSS v4, Framer Motion, React Query |
| Mobile | React Native 0.79, Expo 53, Expo Router, NativeWind |
| API | Hono, Node.js 22, tsx |
| Database | PostgreSQL 16, Prisma 6 |
| Job queues | BullMQ, Redis |
| Auth | Supabase Auth + custom JWT |
| Subscriptions | RevenueCat |
| AI — summaries | OpenAI GPT-4o |
| AI — PDF extraction | Google Gemini 2.5 Flash |
| Scrapers | Congress.gov API, OpenStates API, BoardDocs |
| Notifications | Expo Push Notifications |
| Monorepo | Turborepo, pnpm workspaces |
