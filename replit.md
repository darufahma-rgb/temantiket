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
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are stored as Replit shared env vars (not hardcoded)
- Supabase Auth kept intentionally — custom multi-tenant RLS roles (owner/staff/agent) are incompatible with Replit Auth
- No server-side layer added — correct architecture for a Supabase-native SPA
- OpenAI integration is optional — set `VITE_OPENAI_API_KEY` in Replit Secrets to enable AI features (passport OCR, itinerary AI, ticket price AI, AI command center). App falls back to Tesseract.js for OCR when not set.
- Workflow "Start application" runs `npm run dev` on port 5000
- Supabase Edge Functions (bootstrap, invite-member, remove-member, ocr-passport) remain deployed on Supabase — no Replit server needed

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
| `/m/:slug` | Public member card (no auth) |
| `/leaderboard` | Public leaderboard (no auth) |
| `/harga-tiket` | Public ticket price list (no auth) |
| `/settings` | App settings |

## Fase 25: Full System Dummy Data Injection — Masisir Edition (May 2026)

- `src/pages/DemoSeed.tsx` fully rewritten with "Masisir Edition" seeder section
  - 5 Al-Azhar student clients (realistic Indonesian names, Cairo addresses)
  - 10 orders mixing EGP/SAR currencies with markup metadata (`originalCurrency`, `originalPrice`, `originalCost`, `markup`, `markupIDR`) for Reports page
  - 5 Cairo route ticket prices in EGP (CAI→JED, CAI→MED, CAI→DXB, CAI→KWI, CAI→RUH)
  - 3 mission templates + 3 missions + 2 submissions
  - 5 catatan (notes) with Masisir prefix
  - 3 BC (broadcast) templates with Masisir prefix
- Cleanup function removes all "Masisir —" prefixed data across all entity types
- Original "Seed Dasar" retained as collapsible section
- EGP rate: ~515 IDR/EGP; SAR rate: ~4250 IDR/SAR

## Fase 25b: Itinerary History (localStorage) in ItineraryGenerator (May 2026)

- localStorage key: `temantiket.itinerary.history.v1`, max 20 entries
- Auto-saves every itinerary to history when `itinerary` state is set (useEffect)
- Labels auto-generated from route codes + first airline/flight number
- "Riwayat Itinerary" collapsible panel shown in empty state when history exists
  - Shows label, PNR, passenger name, price, relative timestamp
  - "Muat" button reloads saved itinerary into active session
  - Per-row delete (trash icon) with hover reveal
- Demo data: 2 itineraries seeded via `seedMasisirItineraries()` in DemoSeed

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
- `SharePanel` component in admin `TicketPrices.tsx`

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

## Fase 26: AI Command Center (May 2026)

- Floating chat widget di pojok kanan bawah semua halaman dashboard
- File: `src/components/AIChatWidget.tsx` (UI) + `src/lib/aiCommandCenter.ts` (engine)
- OpenAI gpt-4o-mini dengan function calling — model memilih tool yang tepat secara otomatis
- Agentic loop: AI terus eksekusi tool sampai semua tool calls selesai sebelum kirim respons

**8 Tools yang tersedia:**
1. `get_dashboard_summary` — Ringkasan bisnis (klien, order, revenue, kurs, misi)
2. `get_clients` — Cari/list klien berdasarkan nama atau nomor HP
3. `get_orders` — List order dengan filter type & status
4. `create_itinerary` — Ekstrak itinerary dari teks PNR/booking mentah
5. `update_exchange_rate` — Update kurs EGP/SAR/USD ke IDR (auto-switch ke manual mode)
6. `create_daily_mission` — Buat misi harian untuk agen dengan poin reward & deadline
7. `calculate_profit` — Hitung profit, margin %, dan konversi ke IDR
8. `get_agent_performance` — Statistik poin & order per agen, ranking

**UI Features:**
- Tombol FAB biru bergradient di kanan bawah, badge merah kalau ada pesan belum dibaca
- **AIContextualBar** — strip di atas setiap halaman dengan chip perintah kontekstual
  - Dashboard: performa bisnis, agen terbaik, buat misi, status order
  - Clients: cari klien, list terbaru, filter order klien
  - Orders: filter status/tipe, revenue, list terbaru
  - Itinerary: contoh PNR Galileo, Amadeus, dan teks booking langsung
  - Calculator: hitung profit IDR/EGP, update kurs EGP/SAR/USD
  - Reports: revenue, profit, performa agen
  - Agent Center: buat misi, ranking agen, total poin
  - Ticket Prices: order flight, kurs, profit tiket
  - BC Templates: list klien, data bisnis untuk broadcast
  - Notes: ringkasan bisnis, status order
  - Settings: update semua kurs langsung dari settings
  - Packages: profit paket, klien dengan order umrah
- Chip suggestion **context-aware** — berubah sesuai halaman aktif
- Klik chip → langsung isi input chat (tidak auto-send, bisa diedit dulu)
- Tool result cards dengan warna berbeda per tipe (biru=dashboard, hijau=klien, dsb)
- Multi-tool results ditampilkan inline sebelum pesan teks AI
- Textarea auto-grow, Enter=kirim, Shift+Enter=baris baru
- Reset percakapan (clear history + API context)
- Proactive questioning — AI tanya balik kalau perintah kurang jelas
- Requires `VITE_OPENAI_API_KEY` — graceful error message kalau belum di-set
- Files: `src/store/aiChatStore.ts` (shared state), `src/components/AIContextualBar.tsx` (bar)

## Fase 27: Automated Invoice Generator

**Files:**
- `src/lib/invoiceGenerator.ts` — Core PDF engine (pdf-lib). Renders A4 invoice: header gelap, detail rows, total box, watermark "by Temantiket". Supports custom template image overlay. Auto-generates invoice number `INV-YYYYMMDD-NNNN`.
- `src/store/invoiceStore.ts` — Zustand store: templateDataUrl (localStorage), lastInvoiceDataUrl (for AI trigger).
- `src/components/InvoiceButton.tsx` — "Cetak Invoice" button di setiap OrderDetail. Generates PDF, auto-download, stores blob di invoiceStore.
- `src/components/InvoiceTemplateUploader.tsx` — Upload custom template image via Settings > Invoice tab.

**Integration points:**
- `src/pages/OrderDetail.tsx` — InvoiceButton ditambah ke header buttons (semua tipe order: flight, umrah, visa).
- `src/pages/Settings.tsx` — Tab baru "Invoice": upload template, petunjuk pemakaian, format nomor invoice.
- `src/lib/aiCommandCenter.ts` — Tool `generate_invoice`: cari order by clientName/orderId, generate PDF, store data URL, return invoice_ready result.
- `src/components/AIChatWidget.tsx` — `invoice_ready` result card: tampilkan nomor, klien, total + tombol Download PDF langsung dari chat.
- `src/components/AIContextualBar.tsx` — Chip "Bikinin invoice untuk order flight terbaru" di halaman Orders.

**Flow:**
1. Klik "Cetak Invoice" di OrderDetail → PDF langsung download (< 1 detik).
2. Atau ketik ke AI: "Bikinin invoice untuk [nama klien]" → AI generate → card muncul di chat → klik Download PDF.
3. Custom template: Settings > Invoice > Upload gambar → semua invoice berikutnya pakai template tsb sebagai background + data di-overlay.

## Fase 28.1: PNR Command Center

**Files:**
- `src/components/PNRCommandCenter.tsx` — Universal PNR input widget with auto-extract (flight/hotel/tour), smart confirm modal, auto-creates client/order/invoice/WA reminder.

**Integration:** Embedded in `src/pages/Dashboard.tsx` above DepartureTodayAlert.

## Fase 29: Full Ecosystem Integration & Automated Workflow

**New files:**
- `src/lib/ledgerSync.ts` — `buildRateSnapshotPatch()` freezes EGP/SAR rate in `order.metadata` when status → Paid/Completed. `buildLedgerEntries()` + `ledgerSummary()` build the Buku Besar from Paid/Completed orders.
- `src/lib/agentWallet.ts` — localStorage-based agent wallet. `POINT_TO_IDR_RATE = 1000` (1 poin = Rp 1.000). Functions: `convertMissionPoints()`, `recordPayout()`, `walletBalance()`.
- `src/components/WaShareButton.tsx` — Universal WA dispatch button. mode="file" tries Web Share API (PDF attachment) first, falls back to wa.me text link. Accepts `phone`, `pdfBytes`, `text`.
- `src/components/AgentWalletCard.tsx` — Per-agent wallet UI: balance, convertible mission points, Convert button (creates wallet transaction), Catat Pencairan button, transaction history.

**Modified files:**
- `src/pages/OrderDetail.tsx` — On status → Paid/Completed: snapshots EGP/SAR rate in `order.metadata` via `buildRateSnapshotPatch()`; shows toast "+1 poin Member Card [ClientName]" (integration 2) + "Buku Besar diperbarui" with rate info (integration 1). InvoiceButton now receives `phone={linkedClient?.phone}`.
- `src/components/InvoiceButton.tsx` — After PDF generation, stores `lastPdfBytes` in state + builds pre-filled WA message. Shows `WaShareButton` inline (integration 4).
- `src/pages/Reports.tsx` — Added "📊 Ringkasan" / "📒 Buku Besar" tab switcher. Ledger tab shows full-history table of Paid/Completed orders with running balance, EGP/SAR rate snapshot, margin %, cumulative profit (integration 1).
- `src/pages/AgentCommandCenter.tsx` — Added `missionPointsByAgent` map (separate from combined order+mission points). In per-agent Commission Tracker expander, renders `AgentWalletCard` for mission-point → komisi conversion (integration 3).

**Integration summary:**
1. **Invoice → Ledger**: Rate snapshot frozen at payment time; Buku Besar tab shows all paid orders with historical rates + running balance.
2. **Order → Member Points**: Toast notification fires when any order transitions to Paid/Completed, linking it to the client's Member Card stamp.
3. **Mission → Agent Wallet**: Owner converts approved mission points to IDR komisi credit; wallet tracks credit/payout history in localStorage.
4. **One-Click WA Dispatch**: Invoice PDF shareable via Web Share API (WhatsApp attachment) or wa.me pre-filled message, triggered directly from InvoiceButton after generation.

## Legacy Umrah Flow

- Calculator → Packages → Trips → Jamaah Manifest (still intact, not removed)
- Schema: `supabase/schema.sql`
