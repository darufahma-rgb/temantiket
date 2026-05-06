# Temantiket — Travel Management App

Temantiket is a comprehensive travel management SPA for Umrah & Haji agencies — managing clients, orders, packages, agents, and AI-powered features.

## Run & Operate

- **Dev**: `npm run dev` — concurrently runs Express API (port 3001) + Vite (port 5000)
- **Build**: `npm run build`
- **Production run**: `node ./dist/index.cjs`
- **Required env vars (shared)**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (set in `.replit` `[userenv.shared]`)
- **Required secrets**: `SUPABASE_SERVICE_ROLE_KEY` (invite/remove member), optionally `OPENROUTER_API_KEY` or `OPENAI_API_KEY` (AI features)
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
- The splash screen IS the login screen — it transitions from loading spinner → login form after 600ms
- `bytedance/seed-2.0-mini` is text-only (no vision) — never use it for OCR
- Supabase RLS policies use `public.is_member()`, `public.is_owner()`, `public.is_agent()` security-definer helpers
- `npm run dev` must be run from project root (not `server/`)

## Pointers

- Supabase schema: `supabase/schema.sql`
- Server routes: `server/index.cjs`
- Auth store: `src/store/authStore.ts`
- Supabase client: `src/lib/supabase.ts`
- AI fetch: `src/lib/aiFetch.ts`

---

## Legacy Notes (from original replit.md)

*   I want iterative development.
*   I want you to ask before making major changes.
*   I prefer detailed explanations.
*   I do not want you to make changes to the `supabase/schema.sql` file.
*   I do not want you to make changes to the `supabase/migrations/` folder.
*   I do not want you to make changes to the `supabase/functions/` folder.
*   I do not want you to make changes to the `public/templates/promo/` folder.

## System Architecture

The application is a React Single Page Application (SPA) utilizing Vite for the frontend and an Express.js server for backend API endpoints. Supabase serves as the core Backend-as-a-Service (BaaS), handling authentication, database management (PostgreSQL with Row Level Security), real-time subscriptions, and file storage.

**UI/UX Decisions:**

*   **Color Scheme:** Brand Asset palette — **Rich Black** `#00072d` · **Dark Navy** `#051650` · **Navy Blue** `#0a2472` · **Caribbean Blue** `#123499` · interactive accent `#1a44d4`. Tailwind `sky` color scale is overridden in `tailwind.config.ts` to match this palette so all `text-sky-*`, `bg-sky-*`, `border-sky-*` classes automatically render the brand blues. CSS design-system tokens in `index.css` are updated for both light mode (light blue-white bg, Rich Black text) and dark mode (Rich Black bg → Dark Navy cards → Navy Blue chips).
*   **Navigation:** Desktop uses `AppSidebar.tsx` (264px, always-visible). Mobile uses a **floating bottom nav bar** (Fase 43+): fixed `bottom/left/right: 12px`, `border-radius: 18px`, glassmorphism + `box-shadow`, 5 tabs — Home, Paket, Order, Klien, Lainnya. The **Lainnya** tab opens a bottom sheet with all 11 remaining sidebar items (Kalkulator, Itinerary AI, Harga Tiket, Laporan, Export, Broadcast, Caption Gen, Catatan, Mgt. Agen, Leaderboard, Pengaturan) in a 4-column icon grid plus a logout button. Active tab has a top indicator line. Desktop header shows search bar, rates pill, AI Assistant button, sync dot, bell, user avatar.
*   **Boarding Pass Cards:** Designed for clear display of flight information, including large ETD/ETA times, transit indicators, and airline logos fetched from Airhex CDN.
*   **Multi-Leg UI:** Chained legs are rendered with amber transit dots and city pills, consolidating complex itineraries into single, readable cards.

**Technical Implementations:**

*   **Multi-Leg Recognition:** Implemented a `Transit Chain Merger` on the client-side (`ticketPriceAI.ts`) to detect and merge transit-connected flights into a single itinerary unit. This prevents double markup and clarifies pricing for users. The UI component `MultiLegChain` renders these complex itineraries.
*   **AI Integration:** Leverages OpenAI's `gpt-4o-mini` with Vision capabilities for tasks such as:
    *   **Ticket Price Extraction:** AI extracts flight details, including numbers, timings, terminals, and transit information from screenshots.
    *   **Itinerary Generation:** Extracts itineraries from raw PNR/booking text.
    *   **Conversational Command Center:** A floating chat widget (`AIChatWidget.tsx`) uses function calling to interact with 8 distinct tools (e.g., `get_dashboard_summary`, `create_daily_mission`, `calculate_profit`). It includes a context-aware `AIContextualBar` that suggests commands based on the active page.
    *   **Passport OCR:** Direct browser-to-OpenAI passport OCR.
*   **Automated Invoice Generation:** Utilizes `pdf-lib` to generate A4 invoices with dynamic data, custom template overlays, and auto-generated invoice numbers. PDF generation is offloaded to Vercel serverless functions (`api/export/invoice.js`, `api/export/igh.js`) with automatic browser-side fallback via `src/lib/exportPdfApi.ts`. Integrated with the AI Command Center for on-demand generation and WhatsApp sharing.
*   **PNR Command Center:** A universal PNR input widget (`PNRCommandCenter.tsx`) automates extraction of flight/hotel/tour data and can auto-create client, order, invoice, and WhatsApp reminders.
*   **Agent Management System:** Supports multiple roles (owner, staff, agent) with a points-based reward system. `agent_points` are awarded on order completion, and `reward_redemptions` tracks point-to-reward exchanges. Agent wallet transactions are now synced to Supabase `agent_wallet_transactions` table (localStorage remains instant cache).
*   **Agent Profile (Owner View):** New page at `/agents/:agentId` (`AgentProfileOwnerView.tsx`) — owner accesses a specific agent's full profile with tier badge, stats, 4 tabs (Ringkasan, Misi, Order, Informasi). Accessible from AgentCommandCenter Direktori tab via "Profil" button. Separate from the existing `/agent/profile` self-view. Mission tab allows owner to approve/reject pending submissions per agent.
*   **Order Hub:** Manages universal orders (Umrah, Flight, Visa) and client data.
*   **Reporting:** Features a financial reports section, including a ledger tab (`Buku Besar`) that tracks paid/completed orders with historical exchange rates and running balances.
*   **Real-time Features:** Supabase Realtime subscriptions enable live synchronization across devices, including real-time updates for the Agent Leaderboard.
*   **Environment Setup:** Development uses `npm run dev` to concurrently run the Express API server (port 3001) and Vite development server (port 5000). On Replit, the workflow command is `npm run dev` targeting port 5000. Required Replit env vars (shared in `.replit` `[userenv.shared]`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Required Replit Secrets (set via Secrets panel): `SUPABASE_SERVICE_ROLE_KEY` (for admin member operations — bootstrap, invite, remove), `OPENROUTER_API_KEY` (for AI features — OCR, chat). Optional: `OPENAI_API_KEY` as direct OpenAI fallback.
*   **AI Provider (OpenRouter):** All AI calls now route through OpenRouter (`https://openrouter.ai/api/v1`) using `OPENROUTER_API_KEY`. Model mapping: OCR Paspor → `google/gemini-2.0-flash-001` (vision, ~$0.10/1M token), AI Chat/Command Center → `openai/gpt-4.1`, teks ringan → `bytedance/seed-2.0-mini`. Fallback ke OpenAI direct jika `OPENROUTER_API_KEY` tidak di-set. Note: `bytedance/seed-2.0-mini` adalah model teks saja — tidak mendukung vision, jadi tidak bisa dipakai untuk OCR.
*   **Server Routes:** All backend endpoints live in `server/index.cjs` — `/api/bootstrap`, `/api/invite-member`, `/api/remove-member`, `/api/ai/chat` (OpenAI proxy). Vercel serverless functions in `api/` serve as an alternative deployment target.
*   **Database Management:** Schema is managed via Supabase SQL Editor, with migrations applied chronologically. New tables added in `2026_05_04_cloud_sync_tables.sql`: `agency_settings` (key-value per agency), `user_settings` (key-value per user), `agent_fee_payments`, `agent_wallet_transactions`.
*   **Passport Schema Migration (run in Supabase SQL Editor):** The `clients` table needs 3 new columns for the overhauled Klien Baru form. Run: `ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS birth_place text; ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS passport_issue_date text; ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS passport_issuing_office text;`
*   **Cloud Sync (localStorage → Supabase):** 8 features now use dual-write (localStorage cache + Supabase). Sync layer in `src/lib/settingsSync.ts`. Keys: `admin_settings`, `product_commissions`, `ticket_markup`, `rates_config`, `agent_phones` → `agency_settings`; `appearance` → `user_settings`; fee payments → `agent_fee_payments`; wallet txs → `agent_wallet_transactions`. On login, App.tsx pulls all settings from cloud into localStorage.
*   **Supabase Performance Optimization (2026-05-05):**
    - `clientsRepo.ts`: `fromRowList()` strips base64 `photo_data_url` from list queries — only Storage URLs are kept in cache. `getClient()` (detail) still fetches full photo. `createClient()`/`updateClient()` auto-upload base64 photos to Supabase Storage before DB insert/update.
    - `tripsRepo.ts`: `jamaahFromRowList()` same pattern — list queries strip base64 jamaah photos, Storage URLs pass through unchanged.
    - `supabaseStorage.ts`: Added `uploadClientPhoto()` — reuses `jamaah-photos` bucket with `clients/` subfolder prefix, leveraging existing RLS policies. No new bucket needed.
    - `migrateBase64ToStorage.ts`: Extended to Phase 3 — migrates `clients.photo_data_url` base64 → Storage URL. Run via Settings → "Migrasi Storage" button to batch-convert all existing records.
    - `Settings.tsx`: Migration result now shows breakdown: foto jamaah / dokumen jamaah / foto klien migrated.

## External Dependencies

*   **Supabase:** Primary BaaS for authentication, PostgreSQL database, real-time subscriptions, and storage.
*   **OpenAI API:** Utilized for AI features such as `gpt-4o-mini` for Vision capabilities, itinerary generation, ticket price extraction, and the AI command center.
*   **Tesseract.js:** Fallback OCR solution when OpenAI API key is not configured.
*   **Vite:** Frontend build tool and development server.
*   **Express.js:** Backend server for API routes requiring service role keys (e.g., user invitation/removal, bootstrap).
*   **shadcn/ui:** UI component library.
*   **React:** Frontend JavaScript library.
*   **TypeScript:** Type-safe JavaScript.
*   **Framer Motion:** For UI animations — page transitions (x-slide via DashboardLayout AnimatePresence), stagger list/card animations on Orders, Packages, TripDetail (jamaah grid), Reports (stat cards), AgentDashboard (stat cards), ExportCenter, AgentDirectory, OrderDetail, and tab-switch animations in Settings.
*   **Airhex CDN:** Used for fetching airline logos based on IATA codes.
*   **pdf-lib:** JavaScript library for creating and modifying PDF documents (used in invoice generation).
*   **Zustand:** State management library (used for invoice store and AI chat store).