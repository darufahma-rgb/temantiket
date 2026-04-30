# Temantiket — Travel Management App

Aplikasi manajemen trip Umrah & Haji berbasis React + Vite + TypeScript + shadcn/ui.

## Mitra Marketing & Retention Pack (May 1, 2026 — Fase 9.5)
Lapisan tambahan di atas Agent System buat bikin mitra ngerasa Temantiket =
"alat cari duit" (gamification + marketing power). Bahasa UI: kasual gue/lo.

- **Agent Tiering** (`src/features/agentPoints/agentTiers.ts`):
  - 4 level: Bronze (0+) · Silver (100+) · Gold (500+) · Platinum (1500+).
  - Tiap tier punya emoji, gradient warna, dan list `perks`.
  - `getTierInfo(points)` → `{ current, next, pointsToNext, progress }` utk widget.

- **Marketing Kit Generator** (`src/components/MarketingKitGenerator.tsx`, page `src/pages/AgentMarketingKit.tsx`, route `/agent/marketing`):
  - Mitra isi nama + WA, pilih template promo (umrah-hemat / tiket-pesawat / visa-cepat), klik Download → PNG 1080×1080 IG-ready.
  - Template tersimpan sbg SVG di `public/templates/promo/*.svg` dgn placeholder `{{AGENT_NAME}}` dan `{{AGENT_WA}}` di footer.
  - Render flow: fetch SVG → string-replace placeholder → data-URL → `<Image>` → `<canvas>.drawImage` → `toBlob('image/png')` → trigger download.
  - Tambah template baru: drop SVG di `public/templates/promo/`, registrasi entry di `TEMPLATES` array di `MarketingKitGenerator.tsx`.

- **Reward Catalog** (`src/features/rewards/rewardsRepo.ts` + `src/components/RewardCatalog.tsx`):
  - Katalog hardcoded di code: pulsa 50k/100k, voucher GoFood/Grab 100k, kaos mitra, bonus komisi +5% (1 bulan), voucher umrah gratis. Tiap item punya `costPoints` + `minTier` (utk gating premium reward).
  - Mitra klik "Tukar" → confirm dialog → insert ke `reward_redemptions` (status=pending). Owner approve manual via SQL atau UI Reports nanti.
  - `remainingPoints(lifetime, redemptions)` = lifetime − sum cost dari redemption ber-status approved/fulfilled.

- **Agent Leaderboard Page** (`src/pages/AgentLeaderboard.tsx`, route `/agent/leaderboard`):
  - Halaman publik utk mitra: podium 3 besar (medal 🥇🥈🥉) + tabel ranking penuh.
  - Filter periode: bulan ini / bulan lalu / tahun ini / all-time.
  - Privacy: angka komisi/profit mitra lain DISEMBUNYIKAN — yg ditampilkan cuma jumlah order, poin periode, poin lifetime, dan tier badge. Highlight row mitra yg lagi login dgn label "Lo".

- **Retention Logic — Client Locking**:
  - **Server** (`supabase/migrations/2026_05_01_agent_marketing.sql`): trigger `tr_inherit_agent_from_client` BEFORE INSERT pada `orders` — kalau order baru tidak set `created_by_agent` tapi client-nya punya `created_by_agent`, auto-inherit. Jadi sekali klien daftar via mitra X, semua order future buat klien itu otomatis kasih poin ke mitra X (siapapun yg input order).
  - **Client** (`src/features/orders/ordersRepo.ts` `createOrder`): defense-in-depth — sebelum insert, kalau `clientId` ada & `createdByAgent` kosong, lookup ke `clientsRepo.listClients()` dan inherit owner. Jaga konsistensi di mode tanpa Supabase juga.

- **Agent Dashboard Widgets** (`src/pages/AgentDashboard.tsx`):
  - Header dapet 2 quick-link buttons: "Marketing Kit" + "Leaderboard" (selain Order Baru).
  - 2-column section setelah hero stats: `<AgentTierProgress totalPoints={myPoints}/>` (kiri — tier banner gradient + progress bar + perks list + roadmap stepper 4 tier) dan `<RewardCatalog totalPoints={myPoints}/>` (kanan — grid 7 reward + history redemption).
  - Banner CTA pink ke `/agent/marketing` di antara widgets dan Riwayat Order.

- **Sidebar Nav (agent role)**: tambah grup "Marketing & Reward" → Marketing Kit + Leaderboard.

- **Tabel `reward_redemptions` (Supabase)**:
  - Cols: `agency_id`, `agent_id`, `reward_key`, `reward_label` (snapshot), `cost_points`, `status` (pending/approved/rejected/fulfilled), `notes`, `requested_at`, `resolved_at`, `resolved_by`.
  - RLS: agent INSERT (dirinya, status=pending only) + SELECT (sendiri); owner/staff SELECT semua + UPDATE status + DELETE. Realtime publication enabled.

- **Setup steps (PENTING — wajib jalanin manual di Supabase)**:
  1. Pastiin `2026_04_30_agents_system.sql` udah di-run dulu (Fase 9).
  2. Supabase SQL Editor → paste isi `supabase/migrations/2026_05_01_agent_marketing.sql` → RUN.
  3. (Catatan) `supabase/schema.sql` udah include migration ini di akhir, jadi kalau setup baru tinggal run schema.sql full.
  4. Test retention: bikin client lewat akun agent → bikin order utk client itu lewat akun owner (tanpa set created_by_agent) → cek `select created_by_agent from orders where id=...` → harus auto-isi UID si agent.
  5. Test redeem: dari /agent dashboard, klik tukar reward → cek `select * from reward_redemptions order by requested_at desc limit 1` → status='pending'.

## Agent (Mitra) Management System (Apr 30, 2026 — Fase 9)
Sistem mitra/affiliate buat travel agency yg punya jaringan freelance agent.
Tiap agent punya akun terpisah, hanya bisa liat klien & order yg dia bikin
sendiri (RLS-enforced), dapet komisi otomatis dari profit, dan dapet poin
gamification per order Completed. Owner liat leaderboard di Reports.

- **Schema** (`supabase/migrations/2026_04_30_agents_system.sql`):
  - `agency_members.role` CHECK constraint allow `'agent'` (selain owner/staff).
  - `agency_members.commission_pct numeric not null default 10` — per-agent komisi.
  - `clients.created_by_agent uuid` & `orders.created_by_agent uuid` — attribution column (FK ke `auth.users`, NULL = "Direct" alias dibikin owner/staff).
  - Helper SQL: `is_agent(target_agency uuid)` → `auth.uid()` adalah agent di agency itu? Dipake di RLS policy.
  - **Tabel baru `agent_points`**: `(agency_id, agent_id, order_id UNIQUE, points int, reason, awarded_at)`. Insert hanya via trigger (security definer); RLS select untuk semua member.
  - **Trigger `tr_award_points_on_completion`**: AFTER INSERT OR UPDATE OF status ON orders. Award 10 poin kalau status pindah ke `'Completed'` & order punya `created_by_agent`. Idempotent (UNIQUE order_id + check old.status). Re-cancel→complete tidak double-award.
  - **RLS hardening clients/orders**: agent cuma SELECT/UPDATE/DELETE row dgn `created_by_agent = auth.uid()`. Owner/staff tetap full access. INSERT: agent boleh tag dirinya atau biarin null.
  - Realtime publication: `agent_points` ditambahkan.

- **Auth & Types** (`src/store/authStore.ts`):
  - `UserRole` extended: `"owner" | "staff" | "agent"`.
  - `AuthUser` & `MemberInfo` punya field `commissionPct: number`. Di-fetch via `loadCurrentUser` (single round-trip + 2-query fallback kalau migration belum di-run).
  - New owner-only method `setMemberCommission(userId, pct)` — clamp 0-100, update `agency_members.commission_pct`.

- **Repo auto-attribution** (`src/features/{orders,clients}/`):
  - `Order.createdByAgent` & `Client.createdByAgent` ditambahkan (optional di draft).
  - `createOrder()` & `createClient()` auto-inject `createdByAgent = auth.uid()` kalau current user role-nya `agent` (kecuali sudah di-set explicit). Owner/staff biarin null = "Direct".

- **Agent Dashboard** (`src/pages/AgentDashboard.tsx`, route `/agent`):
  - Stat cards: Total Poin (+ peringkat dari leaderboard), Total Klien, Total Order (+ jumlah selesai), Komisi Earned (= profit × commission_pct).
  - Riwayat 12 order terakhir dgn badge status & indicator poin (+10 utk yg Completed).
  - CTA buttons: "Klien Baru" → `/clients`, "Order Baru" → `/orders`.
  - Header gradient orange branding "Mitra Dashboard".

- **Reports update** (`src/pages/Reports.tsx`):
  - Filter baru: dropdown "Sumber order" — Semua / Direct (owner/staff) / per-mitra individual.
  - 3 split cards: Direct profit, Via Mitra (gross + komisi dibayar + net for agency), Net Profit Agency (= Direct + (Agent Profit − Komisi)).
  - **Leaderboard table** di bawah: per-agent stats (orders, revenue, gross profit, commission %, komisi diterima, lifetime points). Sorted by profit desc.
  - Komisi rule: dihitung dari profit (bukan revenue), hanya kalau profit > 0 (gak dapet komisi atas kerugian).

- **Routing & Sidebar guards**:
  - `App.tsx`: `RequireRole` extended buat support agent role; auto-fallback redirect (agent ke `/agent`, lainnya ke `/`). New `HomeRedirect` component — agent landing di `/` auto-bounce ke `/agent`. Route `/agent` dilindungi `RequireRole roles={["agent"]}`.
  - `AppSidebar.tsx`: agent dapat nav minimal — Mitra Dashboard, Klien, Orders (collapsible), Settings. Owner/staff dapat nav full sesuai role lama.

- **Settings → Tim** (`src/pages/Settings.tsx`):
  - Form invite anggota baru: dropdown role (Staff/Agent), input komisi % (cuma muncul kalau role=Agent).
  - Member list: badge role + badge komisi (orange tone utk agent), inline editor komisi di sebelah tombol delete (input number + Save button) utk semua agent.
  - Warning toast di form: kalau invite agent gagal "role invalid", deploy ulang edge function `invite-member` (server-side validates role).

- **i18n keys baru** (`src/lib/i18n.ts`): `nav_agent_dashboard`, `nav_exports` (id/en/ar).

- **Migration steps utk user**:
  1. Supabase SQL Editor → paste isi `supabase/migrations/2026_04_30_agents_system.sql` → RUN.
  2. Edge function `supabase/functions/invite-member/`: kalau ada whitelist role server-side, tambahkan `'agent'` ke allowed list, lalu redeploy. Tanpa redeploy, invite agent dari UI mungkin di-reject server-side.
  3. Test trigger: bikin order dengan `created_by_agent` di-set, ubah status ke Completed → cek `agent_points` muncul row baru. Re-update tidak menghasilkan duplicate (UNIQUE order_id).

## Laporan Keuangan + Profit Tracking (Apr 30, 2026 — Fase 8)
Owner-only financial dashboard yang ngitung profit per order, per kategori, dan per klien. Profit = Harga Jual − Harga Modal.

- **Schema** (`supabase/migrations/2026_04_30_orders_cost_price.sql`):
  - Tambah kolom `cost_price numeric not null default 0` ke tabel `orders` (idempotent, re-run aman).
  - Index `orders_cost_price_idx (agency_id, type)` utk aggregation di Reports page.
  - **User wajib apply migration di Supabase SQL Editor** sebelum field Harga Modal ke-persist ke cloud.

- **Repo + types** (`src/features/orders/ordersRepo.ts`):
  - `Order.costPrice: number` ditambahin (default 0). `fromRow`/`toRow` mapping `cost_price ↔ costPrice`.

- **Profit helpers** (`src/lib/profit.ts`):
  - `EGP_TO_IDR = 320` — konstanta konversi visa Mesir (EGP) → IDR utk Reports normalization.
  - `effectiveCostPrice(order)` — fallback ke `metadata.hpp` utk order umrah lama yg belum punya cost_price (snapshot dari Calculator).
  - `rawProfit`, `profitIDR`, `revenueIDR`, `costIDR`, `toIDR(amount, currency)`, `fmtIDR` — semua aggregation di Reports normalize ke IDR.

- **NewOrderDialog** (`src/pages/Orders.tsx`):
  - Field "Total Harga" diganti jadi grid 2-kolom: **Harga Modal** (kiri, currency mengikuti Harga Jual) + **Harga Jual** (kanan, dgn currency selector). Live profit preview card (hijau/merah) muncul kalau salah satu field diisi.
  - `onSubmit` signature dapet `costPrice: number` baru.

- **OrderDetail** (`src/pages/OrderDetail.tsx`):
  - "Total Harga (IDR)" dipecah jadi 2 field: `Harga Modal (<currency>)` dan `Harga Jual (<currency>)`. Currency label ngikutin order.currency.
  - `dirty` checker tambah comparison `costPrice`. `handleSave` push field baru ke `patchOrder`.

- **Reports page** (`src/pages/Reports.tsx`, route `/reports`):
  - **Date filter**: "Bulan ini" / "Bulan lalu" / "Tahun ini" / "Semua waktu" (filter by `order.createdAt`).
  - **4 summary cards**: Total Profit (gradient hijau/merah ngikutin sign), Revenue, Modal, Jumlah Order.
  - **Pie chart** (recharts) profit per kategori (Umrah/Flight/Visa VOA/Visa Student) + breakdown row per type.
  - **Klien Paling Menguntungkan**: top-3 highlight cards (medali 🥇🥈🥉) + tabel full sorted desc (clickable → `/clients/:id`).
  - Empty state kalau periode kosong, footer note ttg konversi EGP & fallback HPP.

- **Role guard** (`src/App.tsx`):
  - Komponen `RequireRole` baru (di atas `RequireAuth`) — kalo `user.role !== "owner"`, redirect ke `/`.
  - Route `/reports` dibungkus `<RequireAuth><RequireRole roles={["owner"]}><DashboardLayout><Reports/>`. Staff yg ngetik URL langsung ke-bounce ke Dashboard.

- **Sidebar nav** (`src/components/AppSidebar.tsx`):
  - Group baru "Admin" cuma dirender kalo `user.role === "owner"` — berisi item "Laporan Keuangan" (icon Wallet → `/reports`). Staff sama sekali gak liat item-nya.

- **i18n** (`src/lib/i18n.ts`): keys baru `nav_reports` + `nav_group_admin` di-translate ke ID/EN/AR.

- **Migration steps utk user**: Supabase SQL Editor → paste isi `supabase/migrations/2026_04_30_orders_cost_price.sql` → RUN. Order baru langsung ke-track profit; order lama tetep keliatan (umrah fallback ke metadata.hpp, sisanya cost=0 sampai di-edit manual).

## Member Card Public Page + WhatsApp Share (Apr 30, 2026)
Member Card sekarang bisa di-share sebagai marketing tool — klien dapat link publik buat cek poin sendiri kapanpun.

- **Public Page** (`src/pages/PublicMemberCard.tsx`, route `/m/:slug`):
  - Mobile-first, anon-accessible. Slug format: `firstname-NNNN` 4-digit pad → mis. `/m/danang-0010` (personal tapi susah ditebak random).
  - Render `<MemberCard readOnly>` — flip-card masih jalan, tapi tombol Download/Share disembunyiin.
  - **Stamp History list** — daftar transaksi sukses (type label + tanggal + status badge), terbaru di atas, max 16. Pakai emoji icon (✈️🕋🔺📘🏙️) + label readable ("Tiket Pesawat", "Visa Transit Dubai", dll).
  - **CTA "Pesan Tiket/Visa Lagi"** — tombol hijau gede di bawah, buka `wa.me/<adminWA>?text=...` ke admin Temantiket (default `+6281311506025` dari `loadIghAdminSettings`). Pesan auto-prefilled dgn nama & member ID klien.
  - **Zero sensitive data** — tidak nampilin phone/email/paspor/alamat/harga. Footer tegas: "Read-Only · Tidak ada data sensitif yang ditampilkan."
  - State: loading / error (`not_found` / `invalid_slug` / `network`) / sukses dgn dynamic `document.title`.

- **Public RPC** (`supabase/migrations/2026_04_30_member_card_rpc.sql`):
  - `public.get_member_card(p_slug text)` — `SECURITY DEFINER`, `stable`. Parses slug (support both `firstname-NNNN` baru & legacy `firstnameNNNN`) → `row_number() over (partition by agency_id order by created_at)` → match name prefix.
  - Projection minimal: `client.{name, createdAt, memberIndex}` + `orders[].{type, status, createdAt, transitType}`. Tidak expose phone/email/paspor/harga.
  - `revoke all from public; grant execute to anon, authenticated` — read-only by design.
  - **User wajib apply migration di Supabase SQL Editor** sebelum halaman publik bisa fetch data.

- **OG / Social Share Preview** (`index.html`):
  - Static OG meta tags pointing ke `/og-member-card.png` (copy polosan member card front, 2864×3579 PNG di `public/`).
  - Title: "Temantiket Member Card", desc: "Cek poin & riwayat transaksi member kamu di Temantiket."
  - Karena SPA + scrapers (WA/FB) gak eksekusi JS, tags ini static & generic — semua link `/m/*` di-share di WhatsApp bakal nampilin thumbnail kartu Temantiket. (Untuk per-slug personalized preview, butuh SSR/edge function — out of scope.)
  - Absolute URL pakai `https://temantiket.id` per domain produksi user.

- **WhatsApp Share Engine** (`src/components/MemberCard.tsx`):
  - Tombol "Share ke WhatsApp" (hijau #25D366, muncul kalau prop `publicUrl` di-set).
  - Mobile (Web Share API + Files): native share sheet → user pilih WA → image+text auto-attach.
  - Desktop fallback: download 2 PNG + buka `wa.me/<phone>?text=...` dgn teks template "Halo [nama], ini kartu member Temantiket lo! Cek poin & riwayat di [link] | Pantau stamp sampai penuh ✈️".
  - Recipient prefilled dari `client.phone` (normalized ke 62xxxx via `normalizePhoneForWa`).

- **Slug helpers** (`src/lib/memberSlug.ts`): `buildMemberSlug(name, idx)`, `buildPublicMemberUrl(slug)`, `normalizePhoneForWa(phone)`, `buildWhatsAppShareText/Url`.

- **Integration** (`src/pages/Clients.tsx`): pass `publicUrl` ke `<MemberCard>` + tampilin link copy-able di bawah kartu (admin gampang share manual).

- **Refactor MemberCard**: tipe `client`/`orders` di-loosen jadi structural (`MemberCardClient`/`MemberCardOrder`) supaya bisa di-feed dari payload publik (yg gak punya full Client / Order types).

## Order Hub — Universal Orders + Independent Clients (Apr 30, 2026)
Refactor: app sekarang punya jalur "Order Hub" pararel di samping flow Umrah lama (Calculator → Packages → Trips → Jamaah Manifest tetap utuh, tidak ada CRUD lama yang dihapus).

- **Schema baru** (`supabase/migrations/2026_04_30_clients_orders.sql`, juga di-mirror ke `supabase/schema.sql`):
  - `clients` table — kontak independen per-agency (uuid PK, multi-tenant + RLS via `is_member`). Punya kolom `legacy_jamaah_id` utk traceability.
  - `orders` table — universal entity. CHECK constraint `type ∈ {umrah, flight, visa_voa, visa_student}`, `status ∈ {Draft, Confirmed, Paid, Completed, Cancelled}`. Kolom `total_price`, `currency`, `metadata jsonb`, plus optional FK `client_id`, `trip_id`, `package_id`, `jamaah_id` utk integrasi balik ke flow umrah.
  - **Backfill non-destructive**: setiap row `jamaah` lama → 1 client (`legacy_jamaah_id` = jamaah.id) + 1 umrah order linked ke `jamaah_id` + (`trip_id` ATAU `package_id` tergantung mana yang match — `jamaah.tripId` di codebase lama dipake utk dua hal).
  - Idempotent (re-run aman). Realtime publication ditambah utk `clients` + `orders`.

- **Frontend layer**:
  - Repos: `src/features/clients/clientsRepo.ts`, `src/features/orders/ordersRepo.ts` — pakai pola repo existing (Supabase + persisted local cache via `makePersistedCache`, write-through, fall-back ke cache saat network error).
  - Stores: `src/store/clientsStore.ts`, `src/store/ordersStore.ts` (zustand, sama pola dgn `tripsStore`).
  - Pages: `src/pages/Clients.tsx` (list + detail dgn `:id` param), `src/pages/Orders.tsx` (list dgn type filter `/orders/:type` + `?clientId=` query), `src/pages/OrderDetail.tsx` (edit form + linked entities + metadata viewer).
  - Routes: `/clients`, `/clients/:id`, `/orders`, `/orders/:type`, `/orders/detail/:id`.
  - Sidebar (`AppSidebar.tsx`): grup baru "Order Hub" berisi **Klien** + **Orders** (collapsible — Umrah & Haji / Tiket Pesawat / Visa Mesir). Group lama ("Operasional" + "Tools") tetap utuh dgn Calculator/Paket Trip/Progress/Catatan/Export.
  - i18n: nav keys baru (`nav_clients`, `nav_orders`, `nav_orders_umrah`, `nav_orders_flight`, `nav_orders_visa`, `nav_group_hub`) di-translate ke ID/EN/AR.

- **Calculator → Order integration** (`src/pages/Calculator.tsx`):
  - Tombol baru "**Simpan ke Order**" (amber) di samping "Buat Trip". Tidak mengganggu flow lama; ini jalur paralel ke Order Hub.
  - `handleCreateOrder()` bikin order `type='umrah'` dgn `total_price = quote.finalPrice` + `metadata` berisi snapshot lengkap (quote breakdown, hpp, sellingPrice, marginIDR, plus seluruh row kalkulator: hotels/transports/tickets/visas/destinations/fnbs/staffs/generalCosts/commissionFee/marginPercent/discount/groupSettings + customerName/dateRange).
  - User bisa buka `/orders/detail/<id>` utk lihat metadata JSON (collapsible viewer).

- **Realtime sync** (`src/lib/supabaseRealtime.ts`): channel `igh-tour-sync` sekarang juga subscribe ke `clients` + `orders` → auto-refresh store dari device lain.

- **Bootstrap**: `App.tsx` `StoreBootstrap` panggil `fetchClients()` + `fetchOrders()` setelah login.

- **Migration steps utk user**: buka Supabase SQL Editor → paste isi `supabase/migrations/2026_04_30_clients_orders.sql` → RUN. Backfill jalan otomatis (1 jamaah lama = 1 client + 1 umrah order).

## Pricing Matrix — Granular per-room rates (Apr 2026)
Pricing logic untuk Umrah grup di-rework supaya cocok dengan kondisi hotel real (Quad/Triple/Double punya rate beda).
- **`HotelRow`** (`src/features/calculator/pricing.ts`): tambah field opsional `pricePerNightTriple`, `pricePerNightDouble`, `useSupplement`, `supplementTriple`, `supplementDouble`. Field lama `pricePerNight` = base/Quad. Helper `resolveRoomRate(hotel, room)` resolve rate per kamar — pake rate eksplisit kalau ada, fallback ke `base + supplement` kalau `useSupplement`, terakhir fallback ke base.
- **`computeProfessionalQuote`** pake `resolveRoomRate(h, h.roomType)` kalau `roomType` di-set (back-compat: kalau gak di-set, pake `pricePerNight`).
- **`computeGroupMatrix`** sekarang generate rate IDR per room type (`hotelBreakdown[].ratesPerRoomIDR.{Quad,Triple,Double}`). Tiap `GroupMatrixCell` punya `hotelPerPaxIDR` dan pake rate kamar yang sesuai → spread harga Q/T/D mencerminkan harga hotel beneran, bukan cuma divide-by-sharing dari satu rate. Field lama `hotelPerNightIDR` di-keep utk back-compat (point ke Quad rate).
- **UI**: komponen `HotelRatesCell` (`src/features/calculator/HotelRatesCell.tsx`) ganti single "Harga/Malam" cell. Stack 3 input mini (Q/T/D) per hotel + currency selector + toggle mode rate-eksplisit ↔ supplement (icon ArrowLeftRight). Toggle pre-fill nilai antar mode supaya gak hilang. Dipake di Calculator.tsx + PackageDetail.tsx.
- **Visual matrix**: `GroupMatrixSection.tsx` footer breakdown ganti dari "harga 1 rate per malam" → "harga 1 kamar per stay per room type" (Q/T/D). Kalau ketiga rate sama, collapse jadi 1 angka utk readability.

## Supabase (Cloud Sync) — v1
- **Client**: `src/lib/supabase.ts` — pakai `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. Helper `isSupabaseConfigured()` jadi feature flag.
- **Schema**: `supabase/schema.sql` — tables (trips, jamaah, jamaah_docs, packages, package_calculations, notes, pdf_templates, pdf_layout_presets) + storage buckets (jamaah-photos, jamaah-docs, pdf-templates). Jalankan sekali di SQL Editor Supabase. Untuk DB existing yang sudah dijalankan sebelumnya, jalankan migration `supabase/migrations/2026_04_23_pdf_layout_presets.sql`.

**PDF Templates (private vs group):**
- Template assets: `/igh-blank-template.pdf` (Private) dan `/templates/IGH_Blank_Template_Group.pdf` (Group). Generator (`generateIghPdf.ts`) auto-pick berdasarkan `IghPdfData.mode` (default `'private'`).
- Group mode mengganti pricing boxes private dengan tabel 4 kolom (Total Pax · Quad · Triple · Double), 1 baris per tier dari `groupMatrix.cells`. Harga di-format pakai `currencySymbol` config (default `$`).
- Calculator mode `umroh_group` otomatis kirim `mode: 'group'` + `groupPricing` rows dari `groupMatrix`.
- Section `groupPricing` di `IghLayoutConfig` punya slider Y-position (1 baris), row spacing, X-center per kolom, X-offset independen Quad/Triple/Double, cell height (true vertical centering), font size, dan currency symbol.

**PDF Layout Tuner Presets (cloud-synced):**
- Tabel `pdf_layout_presets` (id text PK, agency_id, name, payload jsonb, timestamps) per-agency RLS.
- Built-in preset `Temantiket Official Default` (id `builtin:igh-official-default`) selalu muncul di dropdown sebagai safety net read-only — tidak disimpan di cloud.
- Cloud presets di-cache ke localStorage (`igh:pdf-layout-presets-cache`) untuk render instan, lalu di-sync via `pullPdfLayoutPresets()` + realtime channel `pdf_layout_presets`. Cross-device sync bekerja otomatis lewat `onPdfPresetsChanged` listener.
- **Pola**: local-first cache. Reads narik dari Supabase + simpen ke localStorage; writes push ke localStorage **dan** Supabase. Kalau Supabase belum dikonfigurasi, app jalan offline-only pakai localStorage.
- **Repos cloud-aware**:
  - `src/features/trips/tripsRepo.ts` — trips, jamaah, jamaah_docs (full CRUD ke Supabase)
  - `src/features/packages/packagesRepo.ts` — packages
  - `src/lib/cloudSync.ts` — notes (`pullNotes/syncNotesFull`) & package calculations (`pullPackageCalc/pushPackageCalc`)
- **One-shot migration**: `src/lib/migrateLocalToSupabase.ts` — dipanggil dari `StoreBootstrap` di `App.tsx` setelah login. Bulk upsert semua data localStorage → Supabase, set flag `travelhub.supabase.migrated.v1`.
- **Photos/docs**: foto/dokumen baru di-upload ke bucket `jamaah-photos` & `jamaah-docs` via `src/lib/supabaseStorage.ts`. Kolom `photo_data_url` / `data_url` sekarang menyimpan public URL bucket. Data lama base64 ikut termigrasi otomatis pas one-shot migration jalan (bulk upsert convert dataURL → upload).
- **Realtime sync**: `src/lib/supabaseRealtime.ts` subscribe perubahan `trips` / `jamaah` / `packages` (publication `supabase_realtime`). Perubahan dari device lain auto-refresh store.
- **MRZ needs_review**: kolom `needs_review` di tabel `jamaah`. Kalau OCR paspor checksum gagal, jamaah ditandai → badge ⚠ "Perlu Review" tampil di list & profil.
- **Export Center** (`/exports`): generate Excel Rooming List (2 jamaah/kamar, dipisah gender) & Flight Manifest (data paspor) per trip pakai library `xlsx`.
- **Security TODO (v2)**: schema sekarang pake open RLS policy (anon key full access). Sebelum production wajib: (a) ganti login authStore ke Supabase Auth, (b) tightening RLS pakai `auth.uid()`.

## Multi-tenant + Storage Security — v2 (Completed)
Aplikasi sekarang multi-tenant per agency dengan RLS Supabase Auth (file lama tetap dipake, di-overlay sebagai v2):
- **Tabel baru**: `agencies`, `agency_members` (PK: `(agency_id,user_id)`, role: `owner|staff`), `audit_logs` placeholder.
- **Kolom `agency_id uuid`** ditambahkan ke 7 tabel domain (trips, jamaah, jamaah_docs, packages, package_calculations, notes, pdf_templates).
- **Helper SQL**: `is_member(uuid)`, `is_owner(uuid)`, `current_agency_id()` — dipake di policy.
- **RLS policies** per tabel: SELECT/INSERT/UPDATE/DELETE dibatasin via `is_member(agency_id)`. Policy lama `open_all` dihapus.
- **Storage policies**: bucket `jamaah-photos`, `jamaah-docs`, `pdf-templates` cuma boleh diakses kalo `(storage.foldername(name))[1]::uuid` ada di agency_members user. Path convention wajib `{agency_id}/{file}`.
- **Edge Functions** (`supabase/functions/`): `bootstrap` (one-time, bikin owner+agency pertama; refuse kalo udah ada agency), `invite-member` (owner-only, bikin auth user+row member), `remove-member` (owner-only). Deploy via README di folder. Wajib env `SUPABASE_SERVICE_ROLE_KEY`.
- **Auth store** (`src/store/authStore.ts`): refactor ke `supabase.auth.signInWithPassword`. Tracks session+agency+role. Methods baru: `init`, `inviteMember`, `removeMember`, `listMembers`, `bootstrapFirstOwner` (helper), `requireAgencyId`. Supabase client `persistSession: true`.
- **Repos**: `tripsRepo.ts`, `packagesRepo.ts`, `cloudSync.ts` inject `agency_id` di insert. RLS handle filter read.
- **Storage paths**: `src/lib/supabaseStorage.ts` upload prefix `{agency_id}/...`.
- **Migrasi base64 → Storage**: `src/lib/migrateBase64ToStorage.ts` (idempotent, scan `data:` URLs, upload, update DB). Tombol "Mulai Migrasi Storage" di Settings → tab Tim (owner-only).
- **UI flow baru**:
  - `/login` (`src/pages/Login.tsx`) — email + password ke Supabase Auth.
  - `/bootstrap` (`src/pages/Auth.tsx`) — sekali pake. Cek `count(agencies)`; kalo kosong, form bikin agency+owner pertama (panggil Edge Function `bootstrap`).
  - `RequireAuth` di `App.tsx` redirect: belum init → loading; unauth → `/login`; auth tanpa agency → `/bootstrap`; full → app.
  - `<AuthInitBootstrap/>` mount sekali, panggil `useAuthStore.init()`.
  - Settings tab "Tim" (`src/pages/Settings.tsx`): list members, invite (owner-only), remove (owner-only), tombol Migrasi Storage.
- **PIN/2FA tetap local** (device-side, ga sync) — keep as-is.
- **Deploy steps**:
  1. Run `supabase/schema.sql` di SQL Editor (idempotent).
  2. `supabase functions deploy bootstrap --no-verify-jwt` lalu `invite-member` & `remove-member` (perlu `SUPABASE_SERVICE_ROLE_KEY` di Functions secrets).
  3. Buka `/bootstrap` → bikin owner pertama → login → owner invite staf via Settings.
  4. (Optional) Klik "Mulai Migrasi Storage" di Settings untuk pindahin foto/doc lama base64 ke bucket.

## Calculator — Batch Update (Completed)
- `effectiveRates` — kurs override per-form (localRateSAR/localRateUSD), fallback ke rates store
- `toIDR` menggunakan effectiveRates
- `komisiFee` ditambahkan ke perPaxItemsIDR (×pax) dan pdfCosts
- Rates strip jadi editable inline: input per currency, tombol ↩ reset ke Pengaturan
- F&B toggle di setiap hotel section ("Include/Exclude F&B") — state fbMakkah/fbMadinah
- Hotel label di pdfCosts diannot dengan "· incl. F&B" jika aktif
- Komisi Fee field di Biaya Per Pax (NumInputWithCurrency)
- Transport: custom airline text input muncul saat jenis === "custom"
- pdfCosts transport label gunakan customJenis jika custom

## Halaman Catatan (Completed)
- `src/pages/Notes.tsx` — CRUD notes, warna card picker, search, salin, Rapihkan AI
- Storage: `localStorage` key `travelhub.notes.v1`
- "Rapihkan AI" — coba `window.ai.generateText` jika tersedia, fallback ke `smartFormat()` (regex: bullet normalization, kapitalisasi, tanda baca)
- Route `/notes` di App.tsx, nav item "Catatan" (StickyNote icon) di Tools group AppSidebar + bottomNavItems DashboardLayout

## Dialog Redesign (Completed)
Semua popup dialog telah didesain ulang dengan sistem desain yang konsisten:
- `src/components/ui/alert-dialog.tsx` — base compact (max-w-sm, rounded-2xl)
- `src/pages/Dashboard.tsx` — AddTripDialog (2-column grid, h-8 inputs)
- `src/pages/TripDetail.tsx` — AddJamaahDialog (compact, OCR+photo row)
- `src/pages/PackageDetail.tsx` — AddJamaahWithOcrDialog (compact)
- `src/features/packages/PackageFormDialog.tsx` — cover banner, emoji picker, profit preview
- `src/components/BulkOcrDialog.tsx` — 3-phase stepper (upload→scan→review)
- `src/components/PdfPreviewDialog.tsx` — template preview + default layout
- `src/pages/Settings.tsx` — PIN Setup Dialog (compact max-w-xs)

**Design system**: h-8/h-9 inputs, text-[10px] uppercase labels, rounded-xl/2xl, orange gradient `linear-gradient(135deg,#f97316,#ea580c)` primary actions, Montserrat font.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Routing**: React Router DOM v6
- **UI**: shadcn/ui + Tailwind CSS
- **State**: Zustand (global stores, semua persisted ke localStorage)
- **Data fetching**: TanStack Query v5
- **PDF**: jsPDF + jsPDF-AutoTable
- **OCR**: tesseract.js (client-side MRZ passport scan)
- **PWA**: vite-plugin-pwa (offline support, installable)
- **Exchange Rates**: Frankfurter API (free, no key) via Vite proxy

## Fitur Utama (7 feature milestone)

1. **Real-time Kurs (T001)** — `src/lib/exchangeRates.ts`, `src/store/ratesStore.ts`
   - Frankfurter API (IDR→USD,SAR), cache 5 menit, markup/buffer slider 0-5%
   - Live ticker di header DashboardLayout (dengan refresh button)
   - Proxy `/api/frankfurter` untuk dev (bypass CORS localhost)
   - Mode kurs: Live Otomatis atau Manual Lapangan, tersimpan di localStorage dan dipakai semua kalkulator

2. **PWA Readiness (T002)** — `vite.config.ts`
   - vite-plugin-pwa: manifest, service worker, offline cache, installable
   - Mobile/PWA viewport dikunci ke skala 1, memakai `viewport-fit=cover`, touch target minimal 44px, dan input 16px untuk mencegah auto-zoom saat app atau popup/dialog dibuka

3. **Gamified Progress Tracker (T003)** — `src/pages/ProgressTracker.tsx`, `src/pages/JamaahProfile.tsx`
   - Per jamaah: step Terdaftar → Dokumen → Pembayaran → Disetujui → Siap Berangkat
   - Progress bar + ring visual per trip di ProgressTracker
   - Summary card: Total Jamaah, Siap Berangkat, Progres Rata-rata
   - Progress card di JamaahProfile (6 step badges)
   - Status paket (PackageTrackerSection) digabung dalam satu halaman

4. **PDF Branding & Live Preview (T004)** — `src/pages/PdfGenerator.tsx`
   - Live Preview HTML dengan font Montserrat (Google Fonts) via iframe srcDoc
   - Toggle show/hide preview, update real-time setiap ketik form

5. **OCR Passport Scan (T005)** — `src/lib/ocrPassport.ts`, `src/pages/JamaahProfile.tsx`
   - Tesseract.js MRZ parsing: nama, nomor paspor, tanggal lahir, gender
   - Tombol "Scan Paspor (OCR)" di edit mode JamaahProfile
   - Progress % saat scanning

6. **Agent Self-Login / RBAC (T006)** — `src/store/authStore.ts`, `src/pages/Login.tsx`
   - Default: admin/admin123 (superadmin)
   - localStorage-based auth dengan SHA-256 hash
   - Zustand authStore dengan roles: superadmin/agent
   - RequireAuth guard di App.tsx
   - Login utama hanya memakai halaman `/login` dengan desain splash-style agar tidak dobel dengan splash overlay
   - Settings tab "Agen" untuk tambah/hapus agen (superadmin only)

7. **Real-time Sync Simulation (T007)** — `src/lib/syncBus.ts`
   - BroadcastChannel API untuk sync antar tab browser
   - Tanpa Supabase (Supabase tidak tersedia di free tier)

8. **Detail Paket Terpisah + Kalkulator + OCR Jamaah** — `src/pages/Packages.tsx`, `src/pages/PackageDetail.tsx`
   - Setiap card paket di `/packages` membuka detail sendiri di `/packages/:id`
   - Detail paket punya kalkulator biaya per paket yang tersimpan di localStorage dan bisa menyimpan total ke paket
   - Detail paket punya daftar jamaah terpisah per paket dengan tambah jamaah via OCR paspor
   - Package card di `/packages` memakai gaya Executive Summary: status/countdown, okupansi dari `travelhub.jamaah.v2`, financial snapshot dari `travelhub.package.calculations.v1`, info logistik, dan shortcut Kalkulasi/Jemaah/OCR tanpa memicu klik card utama

## Project Structure

```
src/
  App.tsx                     # Root dengan providers, routes, RequireAuth guard
  index.css                   # Design tokens & global styles
  components/
    AppSidebar.tsx            # Sidebar navigasi
    DashboardLayout.tsx       # Shell: sidebar + rates ticker + user info + logout
    SplashScreen.tsx          # Branded splash screen
    PdfPreviewDialog.tsx      # Dialog PDF export
  pages/
    Login.tsx                 # Halaman login (username + password)
    Index.tsx                 # Mounts Dashboard
    Dashboard.tsx             # Grid trip cards (tambah/hapus trip)
    TripDetail.tsx            # List jamaah per trip
    JamaahProfile.tsx         # Profil jamaah: photo, OCR scan, gamified progress, dokumen
    Calculator.tsx            # Kalkulator harga paket + offer table
    Packages.tsx              # CRUD paket + Executive Summary package cards
    PackageDetail.tsx         # Detail paket + tab calculator/jamaah + OCR shortcut
    ProgressTracker.tsx       # Progress per jamaah per trip + status paket
    PdfGenerator.tsx          # PDF generator dengan live preview Montserrat
    Settings.tsx              # Settings: Kurs, Agen, Tampilan, Regional, dll
    NotFound.tsx
  features/
    calculator/               # Calculator logic & hook
    packages/                 # Package store, repo, form
    pdfTemplate/              # Template editor untuk PDF branding
    trips/
      tripsRepo.ts            # CRUD trips/jamaah/docs (localStorage)
  store/
    authStore.ts              # Auth + RBAC (login, logout, addAgent, removeAgent)
    ratesStore.ts             # Exchange rates + markup
    packagesStore.ts          # Packages list
    tripsStore.ts             # Trips + jamaah + documents
    regionalStore.ts          # Regional settings: language, timezone, currency, dateFormat (persisted localStorage)
  lib/
    exchangeRates.ts          # Fetch Frankfurter API + cache + fallback
    generatePdf.ts            # PDF generation (jsPDF)
    ocrPassport.ts            # OCR MRZ passport parsing (tesseract.js)
    syncBus.ts                # BroadcastChannel sync antar tab
    appearance.ts             # Persistent appearance settings
    regional.ts               # useRegional() hook + formatCurrency / formatDate helpers (regional-aware)
    utils.ts                  # cn helper
```

## Routes

| Path | Page |
|------|------|
| `/login` | Halaman login |
| `/` | Dashboard — Trip cards |
| `/trips/:id` | TripDetail — Jamaah list |
| `/trips/:id/jamaah/:jamaahId` | JamaahProfile — Profil + OCR + progress + dokumen |
| `/calculator` | Kalkulator harga |
| `/packages` | Package manager |
| `/packages/:id` | Detail paket — kalkulator paket + jamaah OCR |
| `/packages/:id?tab=calculator` | Detail paket langsung tab kalkulator |
| `/packages/:id?tab=jamaah` | Detail paket langsung tab jamaah |
| `/packages/:id?tab=jamaah&ocr=1` | Detail paket langsung buka dialog tambah jamaah OCR |
| `/progress` | Progress tracker per jamaah & paket |
| `/pdf-generator` | PDF generator + live preview |
| `/settings` | Pengaturan app (kurs, agen, tampilan) |

## Data Model (localStorage)

- **Trip**: id, name, destination, startDate, endDate, emoji, createdAt
- **Jamaah**: id, tripId, name, phone, birthDate, passportNumber, gender, photoDataUrl, createdAt
- **JamaahDoc**: id, jamaahId, category (passport|visa|ticket|medical|other), label, fileName, fileType, dataUrl (base64), createdAt
- **AuthUser**: username, displayName, role (superadmin|agent), agentId
- **PackageCalculation**: tersimpan di `travelhub.package.calculations.v1` per packageId untuk HPP, margin, dan final price paket

## Design System

- **Brand**: Orange gradient (#f97316 → #ea580c), warm background
- **Cards**: rounded-2xl/3xl white cards dengan border subtle
- **Sidebar**: Dark narrow sidebar + white content area
- **Mobile**: Bottom nav 6 items, compact layout
- **Font PDF & Package Summary**: Montserrat via Google Fonts (global import + live preview iframe) dengan jsPDF helvetica fallback

## Default Credentials

- **Username**: `admin`
- **Password**: `admin123`
- **Role**: superadmin

## Production Features (April 2026)

- **#4 Image Compression** (DONE): `browser-image-compression` integrated via `src/lib/imageCompress.ts`. Photos & docs auto-compressed to ~600 KB / max 1800px before upload to Supabase Storage. Skips PDF & GIF, skips files <200 KB. Upload limit raised to 12 MB.
- **#3 Allotment Control** (DONE): `trips.quota_pax` column. AddTripDialog has optional kuota input. TripDetail header shows `12/40 jamaah` + slot/PENUH badge. AddJamaahDialog blocks insert when full + Add button auto-disabled.
- **#5 Audit Log** (DONE): SECURITY DEFINER trigger `audit_log_trigger` on trips/jamaah/jamaah_docs/packages/payments. Settings → Audit Log tab shows 100 most-recent activities with INSERT/UPDATE/DELETE badges.
- **#2 Payment Tracking** (DONE): `payments` table + RLS + realtime. `paymentsRepo.ts` with types dp/installment/final/refund/other. `PaymentSection` in JamaahProfile shows total paid + history with add/delete; refunds subtract from total.
- **#1 Financial Ledger** (DONE Apr 2026): `payments.proof_url` + private `payment-proofs` storage bucket (12 MB) with 4 RLS policies scoped via path prefix. `trips.price_per_pax` for outstanding calc. PaymentSection upload bukti + signed-URL viewer. Dashboard `PaymentAlerts` widget shows H-30 unpaid jamaah with total outstanding.
- **Marketing Kit Auto-Flyer** (DONE Apr 2026): `src/components/FlyerDialog.tsx` using `html-to-image`. 3 templates (sunset/emerald/midnight). Renders 540×720 promo PNG with logo, trip details, price, slot left, CTA. Download + WebShare API. "Flyer" button in TripDetail header.
- **PWA Offline Mode** (DONE Apr 2026): Workbox runtimeCaching for Supabase REST (NetworkFirst, 3-day TTL) and Storage (CacheFirst, 7-day TTL). Existing OfflineBar shows banner + reconnect toast.
- **Client-Facing Portal** (DONE Apr 2026): `/cek/:code` public route + `jamaah.booking_code` UNIQUE column + SECURITY DEFINER RPC `get_booking_status` (granted to anon). `PublicCheck.tsx` shows trip card + payment status badge + history. `BookingCodeShare` in JamaahProfile gives copy link + WhatsApp share.

## PDF Generator Refactor (April 2026)

- **New IGH Template Engine** (`src/lib/generateIghPdf.ts`): pdf-lib + fontkit + Montserrat. Loads `public/igh-template.pdf` as background, masks template placeholders with white/orange rects, then overlays mapped data from calculatorStore (Project Name, Timeline, Customer, Date, Hotel Makkah/Madinah + nights, Pax + Harga in orange boxes, Sudah/Belum Termasuk lists). Coords mapped from 740×1024 designer → 413.95×572.53 pt PDF (scale ≈ 0.5594).
- `PdfPreviewDialog` rebuilt to render preview as PNG via `pdfjs-dist`, with Download button.
- **Removed**: legacy `src/lib/generatePdf.ts`, `src/features/pdfTemplate/` (CanvasTemplateEditor, renderHtml, templateStore), `src/pages/TemplatePreview.tsx`, `/template-preview` route.
- **localStorage purged** for trips/jamaah/docs/packages — repos now use in-memory cache only; Supabase remains source of truth (`src/features/trips/tripsRepo.ts`, `src/features/packages/packagesRepo.ts`).

## Repo Cleanup (April 2026)

- Deleted dead code: `src/lib/pdfToImage.ts` (unused pdfjs-dist text extractor) and `src/lib/migrateLocalToSupabase.ts` (one-shot migration assumed complete on all installs).
- Removed migration boot call from `src/App.tsx` — startup now goes straight to `refreshPackages()` + `fetchTrips()`.
- Replaced legacy `localStorage.getItem("travelhub.jamaah.v2")` reads in `src/pages/Dashboard.tsx` (`getTotalJamaah` removed) and `src/pages/Packages.tsx` (`JAMAAH_STORAGE_KEY` + `StoredJamaah` + `readLocalArray` removed) with `listAllAgencyJamaah()` cloud fetch held in component state.
- Dropped unused PDF deps from `package.json`: `jspdf`, `jspdf-autotable`. Remaining PDF stack: `pdf-lib` + `@pdf-lib/fontkit` + `pdfjs-dist` (preview rasterizer). `html-to-image` kept for `FlyerDialog`.
- Branding scan clean — no `Temantiket` strings or assets remain.

## Hardening Pass (April 2026)

Audit-driven fixes across bulk import, PDF tuner, and asset caching:
- **Orphan photo cleanup on bulk insert** (`src/lib/supabaseStorage.ts`, `src/features/trips/tripsRepo.ts`): `uploadJamaahPhotoWithPath` returns `{url, path}` and `removeJamaahPhotos(paths)` deletes orphans. `createJamaahBulk` now uses a worker-pool concurrency limit (BULK_PHOTO_UPLOAD_CONCURRENCY=6), tracks uploaded paths, and removes them if the final insert fails. Upload failures are counted and surfaced via toast warning instead of silently dropped.
- **PdfLayoutTuner stale local state** (`src/components/PdfLayoutTuner.tsx`): added `useEffect` syncing `local` with `config` prop on external changes (undo/redo, mode switch, overlay drag commit) — prevents silent data loss when next slider interaction wrote stale values back to parent. Tracking via `lastSeenConfigRef` + JSON-compare to avoid loop with debounce effect.
- **Preset Private vs Group filter** (`src/lib/ighPdfConfig.ts`, `src/lib/cloudSync.ts`, `src/components/PdfLayoutTuner.tsx`): `IghLayoutPreset` gained optional `mode?: 'private'|'group'`. Built-in presets tagged accordingly. Mode persisted inside jsonb payload as `__mode` marker (no DB schema change). Legacy presets without marker remain visible in both modes (back-compat). `withBuiltins(presets, mode)` filters list per active mode. Tuner resets selected preset when active one disappears after mode switch; Save as New embeds current mode; Update preserves existing mode.
- **Bulk OCR draft persistence** (`src/components/BulkOcrDialog.tsx`): review-stage rows auto-saved to localStorage per-trip (debounced 600ms). Restored on dialog open with toast hint; cleared only on successful Save All or explicit "Hapus semua". Survives tab close/refresh/save failure. File objects can't be serialized → restored rows lose photo preview but text data intact.
- **Bulk OCR concurrency label** (`src/components/BulkOcrDialog.tsx`): "Maks. 2 scan sekaligus" → "Maks. 4" to match actual `MAX_CONCURRENT=4`.
- **Template + font byte cache** (`src/lib/generateIghPdf.ts`): `fetchBytesCached(url)` memoizes static asset fetches with promise-coalescing. Avoids re-downloading ~150KB template + ~1MB font weights on every PDF regenerate (huge win in Bulk OCR / live preview sessions).

## Follow-Up Polish (April 24, 2026)

- **Sync status indicator** (`src/store/syncStatusStore.ts` baru, `src/App.tsx`, `src/components/DashboardLayout.tsx`, `src/lib/supabaseRealtime.ts`): zustand store dengan status `ok|syncing|offline|error` + `lastSync` timestamp. Realtime channel subscribe callback memetakan `SUBSCRIBED → markSyncOk`, `CHANNEL_ERROR/TIMED_OUT → markSyncError`, `CLOSED → setOnline(false)`. Indicator dot (hijau/kuning/merah/abu-abu) + label + relative "Last Sync" muncul di header mobile (sebelum rate ticker) dan desktop (di kanan, sebelum nama user). `SyncStatusBootstrap` di-mount di App untuk register browser online/offline listener.
- **PDF checklist clean lines** (`src/lib/generateIghPdf.ts`): `maskChecklistDividers()` baru menutup garis horizontal yang ter-print di template `igh-blank-template.pdf` dengan white rect (offset 4px di bawah baseline, height 6px, width 207px per kolom dengan reserve 26px untuk digit "01..05"). Dipanggil sebelum `drawList` untuk kolom Include & Exclude. Hasil: text-only checklist tanpa sekat garis.
- **Package detail header date** (`src/pages/PackageDetail.tsx`): h1 sekarang `{packageName} — {formatDate(departureDate, "full")}` (mis. "Umrah Akbar — 22 April 2026"). Date diformat lewat regional helper sehingga konsisten dengan locale user (id-ID).
- **Staff invitation hardening** (`src/pages/Settings.tsx`, `supabase/functions/invite-member/index.ts`, `supabase/migrations/2026_04_24_agency_members_owner_policies.sql`): (a) `handleInviteMember` pakai `try/finally` supaya `setInvitingMember(false)` selalu reset walaupun ada exception/halt mid-process; (b) Edge function divalidasi env vars di awal dengan pesan error spesifik (terutama untuk `SUPABASE_SERVICE_ROLE_KEY` yang sering belum di-set), check email duplicate dengan `auth.admin.listUsers` sebelum createUser, rollback auth user kalau insert membership gagal; (c) RLS policies baru `members_insert_owner`, `members_delete_owner`, `members_update_owner` di tabel `agency_members` sebagai safety net (owner-only, lewat helper `is_owner(agency_id)`) supaya invite tetap bisa jalan kalau Edge function offline.

## PDF Currency Selector (April 25, 2026)

- **Mata Uang PDF dropdown** (`src/lib/ighPdfConfig.ts`, `src/components/PdfLayoutTuner.tsx`): new top-level `pdfCurrency: "USD"|"IDR"|"SAR"` field on `IghLayoutConfig` (default USD on both private + group layouts; merged in `mergeConfig`). Dropdown rendered at top of Tuner panel (emerald section, above Presets) with options `USD ($)`, `IDR (Rp)`, `SAR (SR)`; instant preview update via existing `commitLayout` debounce.
- **Generator currency conversion** (`src/lib/generateIghPdf.ts`): added `fmtCurrency(n, cur)` (IDR `Rp 30.500.000` id-ID, SAR `SAR 3,500` en-US, USD `$1,776` en-US) and `convertViaIdr(display, idr, src, tgt, kursUSD, kursSAR)` (prefers explicit IDR canonical, falls back to display-currency × kurs). Group matrix render at line ~411 resolves target via `cfg.pdfCurrency` (legacy `currencySymbol` parsed as fallback) and converts each cell `quad/triple/double` from `IghPdfData.displayCurrency` → target. Private price box at line ~454 also converts `pricePerPaxIDR` to target currency (IDR keeps legacy `Rp.` prefix; USD/SAR use clean `fmtCurrency`).
- **Calculator data** (`src/pages/Calculator.tsx`): `groupPricingRows` now carries `quadIDR/tripleIDR/doubleIDR` (from `cell.perPaxIDR`) alongside display values; `ighPdfData` adds `kursIdrPerSar: effectiveRates.SAR` + `displayCurrency: "USD"` so generator has full rate context. `IghGroupPricingRow` and `IghPdfData` interfaces extended with the new optional fields.

## Jamaah Detail Drawer + Payment Status (April 25, 2026)

- **Schema**: `jamaah.payment_status text not null default 'Belum Lunas'` with CHECK constraint `('Belum Lunas','DP','Lunas')` + index. New migration `supabase/migrations/2026_04_25_jamaah_payment_status.sql` (apply manually di Supabase SQL Editor). `supabase/schema.sql` updated dengan kolom + constraint + index baru utk fresh installs.
- **Type**: `PaymentStatus = "Belum Lunas" | "DP" | "Lunas"` di-export dari `src/features/trips/tripsRepo.ts`. Field `paymentStatus?: PaymentStatus` ditambah ke `Jamaah` interface; mapper `jamaahFromRow` pakai `coercePaymentStatus(v)` (fallback "Belum Lunas") supaya legacy row aman.
- **Drawer component** (`src/components/JamaahDetailDrawer.tsx`): Sheet dari kanan (max-w-lg). Section: **Data Pribadi** (nama, HP, gender, tgl lahir, status pembayaran, no. paspor, expiry — semua editable, save lewat `patchJamaah`), **Pas Foto** (single, simpan ke `jamaah.photoDataUrl` → auto-upload `jamaah-photos` bucket), **Foto Paspor** (single slot kategori `passport` di `jamaah_docs` — upload baru auto-replace yg lama), **Dokumen Tambahan** (multi, kategori `other`, list+preview+delete). Per-slot loading spinner via `photoUploading` / `passportUploading` / `otherUploading`. Helper `fileToDataUrl` + `MAX_FILE_BYTES=8MB`. Klik preview → buka file penuh di tab baru.
- **Payment badge**: `PaymentStatusPill({ status, size })` — re-used dari drawer ke `JamaahMiniCard` (size="xs"). Color map `PAYMENT_STATUS_STYLES`: Lunas=emerald, DP=amber, Belum Lunas=slate (icons Cloud/CircleDollarSign/AlertCircle).
- **JamaahMiniCard** (`src/pages/PackageDetail.tsx` ~line 564): jadi clickable (role=button + Enter/Space keyboard support), tombol delete pakai `e.stopPropagation()`. Klik → buka `JamaahDetailDrawer` via `setDetailJamaahId(id)` state. `detailJamaah` pakai `useMemo` filter dari `jamaah` array — drawer auto-refresh saat data di-update di store (live update no manual refetch).
- **Storage**: gak ada bucket baru. Reuse `jamaah-photos` (pas foto) + `jamaah-docs` (paspor + dokumen tambahan) yg udah ada dari OCR flow, semua agency-scoped via `{agency_id}/{file}` path.

## Brand Color — Sky Blue (Apr 2026, post-rebrand)
Primary brand swap dari orange → sky blue (#088BC1) berdasarkan poster Temantiket.
- **Tailwind classes**: `orange-{50..950}` → `sky-{50..950}` di seluruh `src/**/*.{tsx,ts}` & `src/index.css` (dark mode overrides).
- **CSS HSL tokens** di `src/index.css`:
  - Light: `--primary: 198 92% 39%` (sebelumnya `27 91% 54%`).
  - Dark:  `--primary: 198 92% 42%` (sebelumnya `24 95% 53%`).
  - Gradient secondary stop: `205 90% 50%` (sebelumnya orange-amber range).
- **Hex inline gradients** (Login, Dashboard, ProgressTracker, dll): `#f97316 → #0ea5e9`, `#ea580c → #0284c7`, `#fb923c → #38bdf8`, dst — full sky-* family.
- **PWA manifest** (`vite.config.ts`): `theme_color: "#0ea5e9"`, `background_color: "#f0f9ff"`. Tag `<meta theme-color>` di `index.html` dan `public/offline.html` ikut di-update.
- **PDF brand color** (`src/lib/generateIghPdf.ts`): konstanta lama `ORANGE` (#F28E34) di-rename `BRAND_BLUE` (#088BC1). Semua field PDF (jamaah, hotel, harga) sekarang render sky blue.
- **Splash bg image** (`attached_assets/image_1776663921386.png`): di-replace dengan sky-blue gradient (1920x1920, hex #0a4a6b → #088BC1). Login dan SplashScreen pakai bg ini.
- **Maskable PWA icon** (`public/logo-igh-tour-maskable.png`): regenerated 512x512 dengan bg sky #088BC1 + logo putih centered (safe zone 80%).
- **Amber semantic** (warning, status "Sebagian", MRZ checksum fail) sengaja dibiarkan amber — ini status indicator, bukan brand. Cuma amber yang dulu paired dengan orange di gradient brand (Calculator header, DashboardLayout pill, QuotationMetaSection header, GroupMatrixSection header) di-flip jadi sky.
- **Packages.tsx progress bar** semantic: 90%+ emerald (full), 60-89% sky (good), <60% amber (low) — progres gauge biar tetep informatif.

## Tiket Pesawat Module (April 30, 2026)

Modul flight ticket untuk Order entity (`type='flight'`). Magic Parser auto-fill, passport sync ke Clients.

- **Flight metadata** (`src/features/orders/FlightOrderEditor.tsx`): interface `FlightMeta` disimpan di kolom `orders.metadata` (jsonb) — pnr, airline, flightNumber, fromCode/Code/City, toCode/City, departDate/Time, arriveDate/Time, passengerName, costPrice (HPP), sellPrice, rawText. `sellPrice` di-mirror ke `orders.total_price` supaya konsisten dgn dashboard.
- **Magic Parser** (`src/features/orders/flightParser.ts`): regex-based parser untuk format Galileo (`1 GA 980 Y 15MAR 4 CGKJED HK1 1700 0030 16MAR`), Trip.com (label `Booking Reference`, `From:`, `To:`, `Departure: 15 Mar 2026, 14:30`), dan Indonesian e-ticket (`Kode Booking`, `Berangkat`, `Tiba`, `Harga Jual`, `Harga Modal`). Helpers: `parseDateLoose` (handles `15MAR` / `15 Mei 2026` / `2026-03-15` / `15/03/2026`), `parseTimeLoose` (`1430` / `14:30` / `2:30PM`), `parseMoney` (strip `Rp`/`IDR`/comma/dot). Lookup tables `AIRLINE_BY_IATA` (GA→Garuda, EK→Emirates, dst) dan `CITY_BY_IATA` (CGK→Jakarta, JED→Jeddah, dst). Best-effort: tiap field opsional, gak match → undefined. Merge non-destructive: gak overwrite field yg user udah isi manual.
- **Passport sync** (`src/features/clients/passportSync.ts`): `decidePassportSync(clients, passport, opts)` cek match by passport_number (case-insensitive, strip spasi) → kalau ada, return `{kind:"match", client, patch}` dengan patch non-destructive (cuma isi field yg masih kosong di client lama, kecuali `name` "Jamaah xxxxx" placeholder yg di-overwrite). Fallback: match by name. Belum ada → `{kind:"create", draft}`. Otomatis link ke order via `clientId`.
- **PassportScanButton** (`src/components/PassportScanButton.tsx`): wrapper tipis di atas `scanPassport` (Tesseract+OpenAI fallback). File picker dengan `capture="environment"` di mobile. Pass `aiOnly={true}` untuk skip Tesseract pre-pass (lebih cepat di server). Handle `progress` dan `dataUrl` (untuk simpan foto ke client.photoDataUrl).
- **OrderDetail integration** (`src/pages/OrderDetail.tsx`): kalau `order.type === "flight"`, render `<FlightOrderEditor>` di atas form generic. `dirty` check di-extend dengan JSON.stringify metadata; `handleSave` patch `metadata` selain field standar. `onAutoTitle` callback set title default `"CGK → JED · 2026-03-15"` kalau title masih kosong.
