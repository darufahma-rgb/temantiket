# Temantiket — Travel Management App

Aplikasi manajemen trip Umrah & Haji berbasis React + Vite + TypeScript + shadcn/ui.

## Replit Environment Setup

- **Stack**: Pure frontend SPA (React + Vite), Supabase as BaaS (auth, database, realtime, storage, edge functions)
- **Dev server**: `npm run dev` on port 5000 (workflow: "Start application")
- **Environment variables** (set in Replit shared env vars):
  - `VITE_SUPABASE_URL` — Supabase project URL
  - `VITE_SUPABASE_ANON_KEY` — Supabase anon/public key
  - `VITE_OPENAI_API_KEY` — Optional: enables direct browser→OpenAI passport OCR (fallback is Supabase Edge Function → Tesseract.js)
- **Database schema**: Managed via Supabase SQL Editor. Run `supabase/schema.sql` to initialize, then apply migrations in `supabase/migrations/` in order.
- **Edge Functions**: Deployed on Supabase (bootstrap, invite-member, remove-member, ocr-passport). See `supabase/functions/README.md`.
- **Bootstrap**: Visit `/bootstrap` to create the first agency + owner account (one-time setup).

## Running the App

```bash
npm install
npm run dev
```

App serves on port 5000. The workflow "Start application" handles this automatically.

## Replit Migration Notes (May 2026)

- Migrated from Replit Agent to Replit environment.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are now stored as proper Replit shared env vars (not hardcoded in `.replit`).
- Supabase Auth is kept intentionally — the app uses custom multi-tenant roles (owner/staff/agent) enforced via Supabase RLS, which is incompatible with Replit Auth.
- No server-side layer added — this is a correct architecture for a Supabase-native SPA.


## Fase 17: Community Referral Hub & Client-to-Agent Bridge (May 2, 2026)

### 1. Client Referral Link — Public Member Card (`/m/:slug`)
- **"Ajak Teman" button**: share referral link via WhatsApp menggunakan teks pre-fill yang sudah di-templatkan.
- **"Salin Link"**: copy URL member card ke clipboard.
- **Referral stamp badge**: jika `referralStamps > 0`, tampil badge hijau "🎁 +N bonus referral".
- **Full Card badge**: tampil jika totalStamps >= 16 (🎉 Crown badge).
- **Stamp History**: referral bonus stamps ditampilkan sebagai row virtual 🎁 "Bonus Referral" di bawah order stamps.

### 2. Agent Recruitment Path
- Tombol **"Mau jadi Agen Temantiket?"** (amber gradient card) muncul otomatis jika `totalStamps >= 8`.
- Klik → buka WhatsApp admin dengan teks pre-fill yang menyebut nama, member ID, dan jumlah stamp.
- Threshold dapat diubah via konstanta `AGENT_THRESHOLD` di `PublicMemberCard.tsx`.

### 3. Public Leaderboard (`/leaderboard`)
- Route publik (no auth) — `src/pages/PublicLeaderboard.tsx`.
- Data via RPC `get_top_members` (SECURITY DEFINER, anon-safe): top N members by totalStamps.
- Tampilkan: rank medal (🥇🥈🥉), first name only (privacy), member ID, stamp bar, referral bonus badge.
- Link ke leaderboard ada di header Public Member Card.
- Includes "Cara Dapat Stamp" section + "Mau masuk leaderboard?" CTA.

### 4. AI Social Share Card — Tab baru di `/itinerary`
- Tab **"📲 Share WA Group"** di AI Itinerary Generator.
- WA Group teks pre-fill: route, tanggal, CTA Temantiket — copy atau langsung buka WA.
- Canvas 1080×1080 **Social Card** (IG Square format): dark navy + diagonal accent, airport codes besar, route, CTA Temantiket.
- Download PNG + render ulang button.

### 5. Database Migration
File: `supabase/migrations/2026_05_17_referral_hub.sql`
- `ALTER TABLE clients ADD COLUMN referral_stamps int DEFAULT 0`
- Update RPC `get_member_card` → return `referralStamps` dalam response
- New RPC `get_top_members(p_limit)` → public leaderboard data
- New RPC `increment_referral_stamp(p_client_id)` → admin-only, atomic +1 referral stamp

### Setup Steps (WAJIB jalankan di Supabase):
1. Supabase SQL Editor → paste `supabase/migrations/2026_05_17_referral_hub.sql` → RUN.
2. Leaderboard & referral stamps akan aktif setelah migration.
3. Award referral stamp: admin call `increment_referral_stamp(client_uuid)` atau via admin UI (coming next).

### New files:
- `src/pages/PublicLeaderboard.tsx` — public leaderboard page
- `src/features/portal/leaderboardRepo.ts` — `fetchTopMembers()` + `incrementReferralStamp()`
- `supabase/migrations/2026_05_17_referral_hub.sql`

### Modified files:
- `src/pages/PublicMemberCard.tsx` — Ajak Teman + Mau jadi Agen + referral stamps display
- `src/features/portal/memberCardRepo.ts` — added `referralStamps` to `PublicMemberCard` type
- `src/pages/ItineraryGenerator.tsx` — Social Share tab (canvas 1080×1080 + WA group text)
- `src/App.tsx` — `/leaderboard` public route

---

## Fase 15: Client Document Vault & Automated After-Sales Service (May 2, 2026)

### 1. Document Vault (`src/components/ClientDocVault.tsx`)
Section baru di halaman detail klien (`/clients/:id`), diantara Member Card dan daftar Order.
- Upload dokumen (JPG/PNG/PDF, maks 4 MB) dengan kategori: Paspor 📗, Visa 📋, Tiket 🎫, Lainnya 📁.
- Preview thumbnail inline (gambar) atau ikon PDF.
- Tombol per dokumen: Lihat (preview fullscreen dialog), Download, Hapus.
- **Tombol "Kirim Notif [Kategori] ke WhatsApp Klien"** per kelompok kategori — membuka wa.me dengan pesan otomatis yang sudah menyebut nama klien + link Member Card.
- Storage: `client_documents` Supabase table (base64 `data_url`, RLS per agency). Migration: `supabase/migrations/2026_05_15_client_documents.sql`.
- Repo: `src/features/clients/clientDocsRepo.ts` (`listClientDocs`, `createClientDoc`, `deleteClientDoc`).

### 2. Departure/Return 24h Alert (`src/components/DepartureTodayAlert.tsx`)
Komponen baru di Admin Dashboard, muncul di atas PaymentAlerts jika ada klien berangkat/pulang hari ini.
- **"Berangkat Hari Ini ✈️"** (card biru): list klien yang paketnya `departure_date` = hari ini.
- **"Baru Pulang 🏠"** (card hijau): list klien yang paketnya `return_date` = hari ini atau kemarin.
- Setiap baris: nama klien + nama paket + tombol **"Kirim WA"** (membuka wa.me dengan template pesan lengkap).
- Klik nama klien → navigasi ke halaman detail klien.
- Auto-hidden jika tidak ada berangkat/pulang hari itu (komponen return null).
- Data source: cross-reference `packages` (dari `usePackagesStore`) + `orders` + `clients`.

### Setup Steps (WAJIB jalankan di Supabase):
1. Supabase SQL Editor → paste `supabase/migrations/2026_05_15_client_documents.sql` → RUN.
2. Dashboard akan otomatis load data berangkat/pulang hari ini dari packages yang sudah ada.

---

## Agent (Mitra) Management System (Apr 30, 2026 — Fase 9)
- `agency_members.role` supports: `owner`, `staff`, `agent`
- Agent-specific routes: `/agent`, `/agent/leaderboard`, `/agent/marketing`
- Owner-only routes: `/reports`, `/agent-center`
- Schema: `supabase/migrations/2026_04_30_agents_system.sql`

## Order Hub (Apr 30, 2026)
- `clients` table — independent contacts per agency
- `orders` table — universal orders (umrah/flight/visa_voa/visa_student)
- Schema: `supabase/migrations/2026_04_30_clients_orders.sql`

## Legacy Umrah Flow
- Calculator → Packages → Trips → Jamaah Manifest (still intact, not removed)
- Schema: `supabase/schema.sql`
