# Temantiket — Travel Management App

Aplikasi manajemen trip Umrah & Haji berbasis React + Vite + TypeScript + shadcn/ui.

## Replit Environment Setup

- **Stack**: Pure frontend SPA (React + Vite), Supabase as BaaS (auth, database, realtime, storage, edge functions)
- **Dev server**: `npm run dev` on port 5000 (workflow: "Start application")
- **Environment variables** (set as Replit shared env vars):
  - `VITE_SUPABASE_URL` — Supabase project URL (required)
  - `VITE_SUPABASE_ANON_KEY` — Supabase anon/public key (required)
  - `VITE_OPENAI_API_KEY` — Optional: enables direct browser→OpenAI passport OCR, itinerary AI,
    and ticket price AI. App gracefully falls back to Tesseract.js when not set.

## Running the App

```bash
npm install
npm run dev
```

App serves on port 5000. The workflow "Start application" handles this automatically.

## Architecture

This is a **Supabase-native SPA** — no separate backend server. All data and auth goes through Supabase:
- **Auth**: Supabase Auth with multi-tenant RLS roles (owner/staff/agent)
- **Database**: Supabase PostgreSQL with Row Level Security
- **Realtime**: Supabase Realtime subscriptions for live sync across devices
- **Edge Functions**: Deployed on Supabase (bootstrap, invite-member, remove-member, ocr-passport)
- **Storage**: Supabase Storage buckets for photos/docs

## Database Schema

Schema managed via Supabase SQL Editor. To initialize:
1. Run `supabase/schema.sql` in Supabase SQL Editor
2. Apply migrations in `supabase/migrations/` in chronological order
3. Deploy Edge Functions (see `supabase/functions/README.md`)
4. Visit `/bootstrap` to create the first agency + owner account

## Replit Migration Notes

- Migrated from Replit Agent to Replit environment (May 2026)
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are stored as Replit shared env vars
- Supabase Auth kept intentionally — custom multi-tenant RLS roles are incompatible with Replit Auth
- No server-side layer added — correct architecture for a Supabase-native SPA
- OpenAI integration is optional and user-configurable via `VITE_OPENAI_API_KEY` env var

## Key Pages & Routes

| Route | Description |
|-------|-------------|
| `/login` | Login page |
| `/bootstrap` | One-time setup: create first agency + owner |
| `/` | Dashboard (owner/staff) or redirect to `/agent` |
| `/packages` | Package management |
| `/clients` | Client (jamaah) management |
| `/orders` | Order Hub (umrah/flight/visa) |
| `/calculator` | Umrah cost calculator |
| `/reports` | Financial reports (owner only) |
| `/agent` | Mitra/Agent dashboard |
| `/agent-center` | Agent management (owner only) |
| `/m/:slug` | Public member card |
| `/leaderboard` | Public leaderboard |
| `/harga-tiket` | Public ticket price list (no auth) |
| `/settings` | App settings |

## Fase 19.2: Deep Data Extraction for Ticket Prices (May 2026)

- Extended AI prompt: now extracts flight number, ETD, ETA, terminal, transit code/city/duration
- Extended `ticket_prices` table: 7 new columns (flight_number, etd, eta, terminal, transit_code, transit_city, transit_duration)
- Boarding-pass style card UI with large ETD/ETA times, transit indicator, tear-off divider
- Airline logos auto-fetched from airhex CDN by IATA code
- Direct/Transit badge on every card
- Public share page `/harga-tiket` (no auth) — Temantiket branded, shows harga jual only (no modal)
- Share Link Publik button in admin page + URL info bar with copy/open actions
- Admin sees base price + markup breakdown; public sees harga jual only
- Migration SQL: `supabase/migrations/2026_05_19_ticket_prices_v2.sql`

## Fase 21: Public Access Link for Ticket Price List (May 2, 2026)

- Public routes: `/harga-tiket`, `/promo`, `/prices` — no auth required
- Dynamic SEO meta injection in `PublicTicketPrices.tsx` (title, description, og:title, og:description, og:url, twitter:*, robots)
- `SharePanel` component in admin `TicketPrices.tsx`:
  - Shows `/promo` (short, recommended) and `/harga-tiket` (full) with per-row Copy buttons + "Tersalin!" feedback
  - Native Web Share API button (falls back to clipboard on desktop)
  - WhatsApp share button with pre-filled message template
  - "Pratinjau" button opens public page in new tab
  - Informational note: only published tickets shown, harga modal hidden
- Supabase migration needed: `supabase/migrations/2026_05_19_ticket_prices_v2.sql` (7 new columns — must run manually in SQL Editor)

## Fase 19: AI Ticket Price List (May 19, 2026)

- `ticket_prices` table for storing airline ticket base prices per agency
- AI screenshot extraction via OpenAI gpt-4o-mini Vision
- RLS: member select, non-agent insert/update, owner delete
- Schema: `supabase/migrations/2026_05_19_ticket_prices.sql`

## Fase 17: Community Referral Hub (May 17, 2026)

- `clients.referral_stamps` column for bonus stamps from referrals
- RPC `get_member_card` updated to return `referralStamps`
- RPC `get_top_members(p_limit)` — public leaderboard data
- RPC `increment_referral_stamp(p_client_id)` — admin-only, atomic +1 referral stamp
- Schema: `supabase/migrations/2026_05_17_referral_hub.sql`

## Fase 15: Client Document Vault (May 15, 2026)

- `client_documents` table for per-client document storage (base64 data_url)
- Categories: paspor, visa, tiket, lainnya
- Departure/Return 24h alert on dashboard
- Schema: `supabase/migrations/2026_05_15_client_documents.sql`

## Agent (Mitra) Management System (Apr 30, 2026)

- `agency_members.role` supports: `owner`, `staff`, `agent`
- `agent_points` table with auto-award trigger on order completion
- `reward_redemptions` table for point-to-reward exchange
- Schema: `supabase/migrations/2026_04_30_agents_system.sql`

## Order Hub (Apr 30, 2026)

- `clients` table — independent contacts per agency
- `orders` table — universal orders (umrah/flight/visa_voa/visa_student)
- Schema: `supabase/migrations/2026_04_30_clients_orders.sql`

## Legacy Umrah Flow

- Calculator → Packages → Trips → Jamaah Manifest (still intact, not removed)
- Schema: `supabase/schema.sql`
