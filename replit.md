# Temantiket — Travel Management App

Temantiket is a comprehensive travel management SPA for Umrah & Haji agencies — managing clients, orders, packages, agents, and AI-powered features.

## Run & Operate

- **Dev**: `npm run dev` — concurrently runs Express API (port 3001) + Vite (port 5000)
- **Build**: `npm run build`
- **Production run**: `node ./dist/index.cjs`
- **Required env vars (shared)**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_URL_BACKUP`, `NODE_ENV` (set in `.replit` `[userenv.shared]`)
- **Required secrets**: `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (invite/remove member), optionally `OPENROUTER_API_KEY` or `OPENAI_API_KEY` (AI features) — all stored in Replit Secrets
- Schema managed via Supabase SQL Editor — see `supabase/schema.sql` and `supabase/migrations/`

## Stack

- **Frontend**: React 18, Vite 5, TypeScript, shadcn/ui, Tailwind CSS, Framer Motion, Zustand, TanStack Query
- **Backend**: Express.js (CommonJS, `server/index.cjs`), Node 20
- **Auth & DB**: Supabase (Auth JWT, PostgreSQL with RLS, Realtime, Storage)
- **AI**: OpenRouter (primary) or OpenAI (fallback) — routed through Express server

## Where things live

- `src/` — React frontend (pages, features, components, store, lib)
- `server/index.cjs` — Express API server (bootstrap, invite-member, remove-member, ocr-passport, ai/chat, export)
- `api/` — Vercel serverless functions (alternative deploy target)
- `supabase/schema.sql` — canonical DB schema (do not edit)
- `supabase/migrations/` — incremental migrations (do not edit)
- `supabase/functions/` — Supabase Edge Functions (do not edit)

## Architecture decisions

- Supabase is the core BaaS — auth, RLS policies, realtime, and storage are all deeply integrated; not replaceable with Replit Postgres
- Service-role operations (invite/remove member, bootstrap) go through Express server to keep the service role key server-side only
- AI calls proxy through Express so API keys are never exposed to the browser
- Vite dev proxy routes `/api/*` to `localhost:3001` (Express); in production, Express serves static files and handles all routes
- Schema changes must be applied via Supabase SQL Editor; `supabase/schema.sql` is the source of truth
- `VITE_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are stored as Replit Secrets (not in `.replit` plaintext)

## Product

- Multi-tenant agency management (owner/staff/agent roles)
- Package & trip management with jamaah (pilgrim) tracking
- Universal order hub (umrah, flight, visa)
- Client CRM with document vault
- Agent gamification (points, missions, leaderboard, wallet)
- AI Command Center (chat, passport OCR, itinerary generation, ticket price extraction)
- PDF invoice & IGH document generation
- Financial reports & ledger
- WhatsApp broadcast templates

## User Preferences

- I want iterative development.
- I want you to ask before making major changes.
- I prefer detailed explanations.
- Do not change `supabase/schema.sql`, `supabase/migrations/`, `supabase/functions/`, or `public/templates/promo/`.

## Gotchas

- `server/index.cjs` uses CommonJS (`require`); `api/` ESM functions use dynamic `import()` for pdf-lib
- The splash screen IS the login screen — it transitions from loading spinner → login form after ~1050ms
- `bytedance/seed-2.0-mini` is text-only (no vision) — never use it for OCR
- Supabase RLS policies use `public.is_member()`, `public.is_owner()`, `public.is_agent()` security-definer helpers
- `npm run dev` must be run from project root (not `server/`)
- AI features (OCR, chat) require `OPENROUTER_API_KEY` or `OPENAI_API_KEY` in Replit Secrets

## Pointers

- Supabase schema: `supabase/schema.sql`
- Server routes: `server/index.cjs`
- Auth store: `src/store/authStore.ts`
- Supabase client: `src/lib/supabase.ts`
- AI fetch: `src/lib/aiFetch.ts`
