# PRD — Temantiket
## Platform Manajemen Umrah, Haji & Tour

**Versi:** 2.0  
**Status:** Production  
**Tagline:** *mudah, cepat, amanah*  
**Terakhir diperbarui:** Mei 2025 — disusun dari analisis menyeluruh codebase produksi

---

## Daftar Isi

1. [Ringkasan Eksekutif](#1-ringkasan-eksekutif)
2. [Latar Belakang & Masalah](#2-latar-belakang--masalah)
3. [Target Pengguna](#3-target-pengguna)
4. [Arsitektur Sistem](#4-arsitektur-sistem)
5. [Struktur Role & Akses](#5-struktur-role--akses)
6. [Navigasi Sidebar](#6-navigasi-sidebar)
7. [Modul & Fitur Lengkap](#7-modul--fitur-lengkap)
8. [Sistem AI & Otomasi](#8-sistem-ai--otomasi)
9. [Sistem Gamifikasi Agen](#9-sistem-gamifikasi-agen)
10. [Halaman Publik](#10-halaman-publik)
11. [Infrastruktur & Keamanan](#11-infrastruktur--keamanan)
12. [Model Data](#12-model-data)
13. [API Server (Express)](#13-api-server-express)
14. [Integrasi Eksternal](#14-integrasi-eksternal)
15. [Non-Functional Requirements](#15-non-functional-requirements)
16. [Roadmap & Prioritas](#16-roadmap--prioritas)

---

## 1. Ringkasan Eksekutif

Temantiket adalah platform manajemen perjalanan berbasis web (PWA) yang dirancang khusus untuk **biro umrah, haji, dan tour** di Indonesia. Platform ini menyatukan seluruh alur operasional — dari pengelolaan jamaah, paket perjalanan, order layanan, hingga keuangan agen — dalam satu sistem terpadu yang bisa diakses dari browser manapun.

Platform ini beroperasi dalam model **multi-tenant**: setiap biro perjalanan (agency) memiliki data yang sepenuhnya terisolasi, dikelola oleh pemilik (owner), dibantu oleh staf, dan dipasarkan oleh agen mitra (agent).

### Tujuan Utama
- Menggantikan pencatatan manual (spreadsheet, WhatsApp, notes) dengan sistem digital terpusat
- Memberikan visibilitas penuh kepada owner atas keuangan, agen, staf, dan progres order
- Memotivasi agen mitra melalui sistem gamifikasi (poin, tier, misi, wallet, leaderboard)
- Mempercepat pembuatan dokumen perjalanan (invoice, manifest, kartu anggota) melalui AI dan ekspor otomatis

---

## 2. Latar Belakang & Masalah

### Masalah yang Diselesaikan

| Masalah | Kondisi Saat Ini | Solusi Temantiket |
|---------|-----------------|-------------------|
| Data jamaah berserakan | Spreadsheet Excel terpisah-pisah | Database jamaah terpusat per trip |
| Kalkulasi harga paket manual | Kalkulator Excel, error-prone | Kalkulator otomatis multi-mata uang |
| Susah track pembayaran | Catatan manual/WhatsApp | Payment tracker per order (UNPAID/DP/PAID/REFUNDED) |
| Tidak ada visibilitas agen | Owner tidak tahu performa agen | Leaderboard, laporan komisi, wallet |
| Tidak ada visibilitas staf | Owner tidak tahu kinerja staf | Staff Management Center, task tracking, presence |
| Dokumen lambat dibuat | Manual di Word/Canva | Generate PDF/Excel otomatis |
| OCR paspor manual | Ketik ulang data satu per satu | Scan paspor via AI (Gemini Vision) |
| Marketing tidak konsisten | Setiap agen buat sendiri | Template broadcast terpusat + Caption Generator AI |
| Visa student sulit dimonitor | Tidak ada tracking step | Visa Tracker dengan assignment pelaksana & fee tracking |

---

## 3. Target Pengguna

### 3.1 Primer: Pemilik Biro (Owner)
- Pemilik atau direktur biro umrah/haji/tour kecil-menengah
- Mengelola 1–30 agen dan staf
- Perlu visibilitas keuangan, performa agen, kinerja staf, dan progres jamaah
- Sering di perjalanan, butuh akses mobile

### 3.2 Sekunder: Staf Operasional (Staff)
- Admin atau staf back-office agency
- Membantu proses order, visa, dokumen, dan koordinasi lapangan
- Akses terbatas: hanya lihat order yang di-assign ke mereka, kalkulasi visa, profil sendiri
- Punya wallet untuk fee pelaksana visa

### 3.3 Tersier: Agen Mitra (Agent)
- Sales freelance atau mitra agency
- Fokus pada akuisisi klien, input order, dan tracking komisi
- Termotivasi oleh komisi, sistem poin/tier, misi, dan leaderboard
- Butuh alat marketing (Caption Generator, BC Templates)

### 3.4 Eksternal: Klien / Jamaah
- Calon atau jamaah aktif yang ingin cek status booking
- Mengakses halaman publik (tanpa login) untuk cek progres order, kartu anggota, dan harga tiket

---

## 4. Arsitektur Sistem

### Stack Teknologi

```
Frontend:  React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui + Framer Motion
State:     Zustand (11 store: auth, orders, packages, trips, clients, rates, regional, dll)
Backend:   Node.js + Express (server/index.cjs, port 3001)
Database:  Supabase (PostgreSQL + Auth + Storage + Realtime)
AI:        OpenRouter (OCR paspor, caption generator, itinerary, ticket scan, notes AI)
           OpenAI via Replit AI Integration (AITEM assistant)
Deploy:    Replit Autoscale + PWA (Progressive Web App)
Cache:     Workbox Service Worker (NetworkFirst untuk API, CacheFirst untuk assets)
Charts:    Recharts (PieChart di Reports, BarChart di Agent Command Center)
PDF:       pdf-lib + jsPDF (invoice, IGH quotation)
Excel:     xlsx (manifest, rooming list export)
```

### Pola Arsitektur
- **Multi-tenant:** Data diisolasi per `agency_id` — RLS (Row Level Security) Supabase memastikan tidak ada kebocoran data antar tenant
- **Client/Server separation:** Semua operasi sensitif (service-role key, AI calls, file upload server-side, point award, wallet credit) melewati Express API — tidak ada secret yang terekspos ke browser
- **Offline-first:** Service Worker + cache strategy memastikan app tetap bisa dibaca saat koneksi buruk
- **Realtime:** Supabase Realtime (WebSocket) untuk sinkronisasi multi-device — order updates, mission notifications, presence online/offline
- **Persisted cache:** Zustand stores dengan localStorage persistence untuk speed dan offline support

### Alur Request
```
Browser → Vite Dev Server (port 5000)
            ├── /api/* → Express Server (port 3001)
            │              ├── Supabase (DB + Auth + Storage) via service-role key
            │              ├── OpenRouter API (OCR, caption, itinerary, ticket scan, notes AI)
            │              └── OpenAI API (AITEM assistant)
            └── Static assets + PWA Service Worker cache
```

### Bootstrapping Awal
- Halaman `/bootstrap` (`Auth.tsx`) digunakan untuk pendaftaran owner pertama kali
- Endpoint `POST /api/bootstrap` membuat user Supabase + agency + agency_member sekaligus
- Setelah bootstrap, owner langsung diarahkan ke dashboard

---

## 5. Struktur Role & Akses

### Role Hierarchy

```
owner  (akses penuh semua fitur + manajemen anggota)
  └── staff  (akses operasional terbatas: visa, komisi, kalkulasi)
  └── agent  (akses mitra: order sendiri, klien sendiri, dashboard agen, marketing)
```

### Matrix Akses Per Route (Aktual dari App.tsx)

| Route | Owner | Staff | Agent |
|-------|:-----:|:-----:|:-----:|
| `/` (Dashboard) | ✅ | redirect `/staff/dashboard` | redirect `/agent` |
| `/bootstrap` | ✅ (publik, tanpa auth) | ✅ | ✅ |
| `/calculator` | ✅ | ✅ | ✅ |
| `/packages`, `/packages/:id` | ✅ | ❌ | ✅ |
| `/trips/:id`, `/paket/:id` | ✅ | ❌ | ✅ |
| `/trips/:id/jamaah/:jamaahId` | ✅ | ❌ | ✅ |
| `/notes` | ✅ | ❌ | ✅ |
| `/exports` | ✅ | ❌ | ❌ |
| `/clients`, `/clients/:id` | ✅ | ✅ (via `:id`) | ✅ |
| `/orders`, `/orders/:type` | ✅ | ❌ | ✅ |
| `/orders/detail/:id` | ✅ | ✅ | ✅ |
| `/reports` | ✅ | ❌ | ❌ |
| `/agent-center` | ✅ | ✅ | ✅ |
| `/agents/:agentId` | ✅ | ❌ | ❌ |
| `/agent` (Dashboard Agen) | ❌ | ❌ | ✅ |
| `/agent/profile` | ❌ | ❌ | ✅ |
| `/agent/leaderboard` | ✅ | ✅ | ✅ |
| `/agent/marketing` | ✅ | ✅ | ✅ |
| `/bc-templates` | ✅ | ❌ | ✅ |
| `/itinerary` | ✅ | ❌ | ✅ |
| `/ticket-prices` (admin) | ✅ | ❌ | ✅ |
| `/visa-tracker` | ✅ | ❌ | ❌ |
| `/staff/dashboard` | ❌ | ✅ | ❌ |
| `/staff/visa` | ❌ | ✅ | ❌ |
| `/staff/commission` | ❌ | ✅ | ❌ |
| `/staff/profile` | ❌ | ✅ | ❌ |
| `/staff-performance` | ✅ | ❌ | ❌ |
| `/staff/:staffId` | ✅ | ❌ | ❌ |
| `/settings` | ✅ | ✅ | ✅ |
| `/audit` | ✅ | ❌ | ❌ |
| `/demo-seed` | ✅ | ❌ | ❌ |
| `/progress` | redirect ke `/packages?tab=progress` | | |

### Halaman Publik (Tanpa Login)

| Route | Deskripsi |
|-------|-----------|
| `/login` | Halaman login |
| `/bootstrap` | Pendaftaran owner pertama kali |
| `/cek`, `/cek/:code` | Cek status booking |
| `/m/:slug` | Kartu anggota digital agen |
| `/leaderboard` | Leaderboard publik |
| `/harga-tiket`, `/promo`, `/prices` | Harga tiket publik (3 alias route yang sama) |

---

## 6. Navigasi Sidebar

Sidebar responsif (desktop fixed, mobile slide-in). Konten berbeda per role.

### Sidebar Owner

| Seksi | Item | URL |
|-------|------|-----|
| — | Dashboard | `/` |
| **Bisnis** | Klien & Jamaah | `/clients` |
| | Order Hub | `/orders` |
| **Tools** | Harga Tiket | `/ticket-prices` |
| | Itinerary (AI) | `/itinerary` |
| | Kalkulator & Kurs | `/calculator` |
| | Paket & Trip | `/packages` |
| **Konten** | Template Broadcast | `/bc-templates` |
| | Caption Generator | `/agent/marketing` |
| | Catatan | `/notes` |
| **Keuangan** | Laporan Keuangan | `/reports` |
| | Export Center | `/exports` |
| **Manajemen** | Visa Tracker | `/visa-tracker` |
| | Manajemen Agen | `/agent-center` |
| | Leaderboard | `/agent/leaderboard` |
| | Manajemen Staff | `/staff-performance` |
| | Audit & Debug | `/audit` |
| — | Pengaturan | `/settings` |

### Sidebar Staff

| Seksi | Item | URL |
|-------|------|-----|
| — | Dashboard | `/staff/dashboard` |
| — | Profil Staff | `/staff/profile` |
| **Tugas Saya** | Visa Saya | `/staff/visa` |
| | Komisi Saya | `/staff/commission` |
| **Operasional** | Kalkulator Visa | `/calculator` |
| — | Pengaturan | `/settings` |

### Sidebar Agent

| Seksi | Item | URL |
|-------|------|-----|
| — | Mitra Dashboard | `/agent` |
| **Bisnis** | Klien & Jamaah | `/clients` |
| | Order Hub | `/orders` |
| **Tools** | Harga Tiket | `/ticket-prices` |
| | Itinerary (AI) | `/itinerary` |
| | Kalkulator & Kurs | `/calculator` |
| | Paket & Trip | `/packages` |
| **Konten** | Template Broadcast | `/bc-templates` |
| | Caption Generator | `/agent/marketing` |
| | Catatan | `/notes` |
| — | Pengaturan | `/settings` |

> Semua sidebar memiliki shortcut CTA "Itinerary" di bagian bawah (kecuali staff) dan tombol Logout.

---

## 7. Modul & Fitur Lengkap

### 7.1 Dashboard Owner (`/`) — Owner Only

**Tujuan:** Ringkasan kondisi bisnis real-time dalam satu layar.

**Widget & Komponen:**
- **Live Clock** — jam saat ini sesuai timezone yang dikonfigurasi (`LiveClock`)
- **Greeting personal** — sapaan berdasarkan waktu (pagi/siang/sore/malam) + nama user
- **Tanggal hari ini** — format panjang sesuai locale (id/en/ar)
- **KPI Cards:** Total trip aktif, total jamaah, total pendapatan (sumPaid), total order
- **Departure Today Alert** (`DepartureTodayAlert`) — trip yang berangkat hari ini, muncul sebagai peringatan urgent
- **Trip Cards** — daftar trip dengan status, tanggal, jumlah jamaah, dan gradient visual per ID
  - Filter, sort, quick action: tambah trip baru
  - Inline add: dialog tambah trip langsung dari dashboard
- **Mitra Leaderboard Card** (`MitraLeaderboardCard`) — top 3 agen berdasarkan order bulan ini
- **CEO Daily Quest** (`CeoDailyQuest`) — misi harian untuk owner (engagement feature)
- **PNR Command Center** (`PNRCommandCenter`) — manajemen kode booking penerbangan
- **Admin WhatsApp Card** (`AdminWhatsappCard`) — shortcut kontak admin langsung via WA deep link

**Status Trip:** `Draft` → `Calculated` → `Confirmed` → `Paid` → `Completed`

---

### 7.2 Dashboard Agen (`/agent`) — Agent Only

Portal khusus agen mitra.

**Konten:**
- Ringkasan KPI: total order, total komisi earned, poin akumulatif (order + misi)
- **Agent Card** (`AgentCard`) — kartu identitas digital agen (nama, tier badge, poin, avatar, kode agen)
- **Tier Progress Bar** (`AgentTierProgress`) — visual progress Bronze → Silver → Gold → Platinum + poin ke tier berikutnya
- **Order Saya** — daftar order milik agen dengan status badge dan payment status
- **Wallet Balance** (`AgentWalletCard`) — saldo wallet terkini + riwayat transaksi
- **Mission Widget** (`AgentMissionWidget`) — misi aktif yang bisa dikerjakan + tombol submit bukti
- **Reward Catalog** (`RewardCatalog`) — katalog hadiah yang bisa ditukar dengan poin
- **Misi Popup Notification** (`MissionPopupNotification`) — popup real-time saat ada misi baru (via Supabase Realtime)
- Quick action ke: tambah order, tambah klien, Kalkulator, Paket & Trip

---

### 7.3 Dashboard Staf (`/staff/dashboard`) — Staff Only

Portal staf operasional.

**Konten:**
- **Staff Card** (`StaffCard`) — kartu digital identitas staf (nama, kode staf 4 digit, tanggal bergabung, role)
- KPI: order aktif, order selesai, order bermasalah, komisi/fee tertunda
- **Quick Actions:** Visa Saya, Komisi Saya, Kalkulator, Profil Staff, Pengaturan
- Daftar 3 order terbaru yang di-assign ke staf
- Wallet balance terkini

---

### 7.4 Manajemen Paket & Trip (`/packages`, `/packages/:id`, `/trips/:id`) — Owner + Agent

**Packages (`/packages`):**
- Dua tab: **Daftar Paket** dan **Progress Order** (embedded `ProgressTracker`)
- List semua paket dengan status, kuota, tanggal keberangkatan, maskapai, dan indikator kuota penuh
- CRUD paket via `PackageFormDialog`
- Kalkulator inline: bisa kalkulasi harga langsung dari halaman packages
- Status paket: `Draft` → `Calculated` → `Confirmed` → `Paid` → `Completed`

**Trip Detail (`/trips/:id` alias `/paket/:id`):**
- Info lengkap trip: tanggal berangkat/pulang, hotel, transportasi, kapasitas, biaya
- **Manajemen Jamaah:**
  - Tambah jamaah manual atau via **Scan Paspor OCR** (bulk atau single)
  - Edit data jamaah: nama, nomor paspor, TTL, gender, alamat, kontak darurat, nomor HP
  - Rooming assignment: double, triple, quad (drawer `JamaahDetailDrawer`)
  - Status mahram, kelompok, catatan medis
  - Upload dokumen jamaah (foto, visa, paspor) ke Supabase Storage
- **Export Manifest:** Excel manifest jamaah per trip (via xlsx)
- **Export Rooming List:** Daftar kamar + penghuni dalam format Excel

**Jamaah Profile (`/trips/:id/jamaah/:jamaahId`):**
- Profil lengkap jamaah dengan foto
- **Client Doc Vault** (`ClientDocVault`): upload/view/delete dokumen (paspor, visa, foto)
- History order jamaah
- Step progress jamaah (Terdaftar → Dokumen → Pembayaran → Disetujui → Siap Berangkat)

**Progress Tracker (`/progress` → redirect ke `/packages?tab=progress`):**
- Tracker visual step-by-step per jamaah per paket
- Step jamaah: Terdaftar, Dokumen, Pembayaran, Disetujui, Siap Berangkat
- Step paket: Draft, Kalkulasi, Konfirmasi, Dibayar, Selesai

---

### 7.5 Manajemen Order (`/orders`, `/orders/:type`, `/orders/detail/:id`) — Owner + Agent (+Staff untuk detail)

**Jenis Order (OrderType):**

| Tipe | Label | Mata Uang Default | Deskripsi |
|------|-------|-------------------|-----------|
| `umrah` | Umrah & Haji | IDR | Paket perjalanan umrah/haji — bisa terhubung ke trip & jamaah |
| `flight` | Tiket Pesawat | IDR | Pemesanan tiket, lengkap dengan PNR, rute, jadwal |
| `visa_voa` | Visa VOA | EGP | Visa on arrival Mesir — termasuk fee agen lapangan |
| `visa_student` | Visa Pelajar | EGP | Visa pelajar (Visa Mesir/Entry Student) — dengan step pelaksana |

**Status Order:**
```
Draft → Confirmed → Paid → Completed
                         ↘ Cancelled
```

**Status Pembayaran (Payment Status):**

| Status | Label | Kondisi |
|--------|-------|---------|
| `UNPAID` | Belum Bayar 🔴 | paid_amount = 0 |
| `DP` | DP 🟡 | 0 < paid_amount < total |
| `PAID` | Lunas ✅ | paid_amount ≥ total |
| `REFUNDED` | Refund 🔵 | Explicit refund |

**Fitur di halaman Orders:**
- List order dengan filter per tipe (`/orders/flight`, `/orders/umrah`, dll)
- Search & filter per status, payment status
- Quick add order dengan dialog (tipe, klien, harga, catatan)
- Passport scan langsung dari form tambah order (auto-fill data klien)
- Harga ditampilkan sesuai mata uang aslinya (EGP atau IDR)

**Fitur di Order Detail (`/orders/detail/:id`):**
- Edit semua field order
- **Flight Order Editor** (`FlightOrderEditor`): parse teks PNR GDS (Galileo/Amadeus) otomatis → isi rute, airline, jadwal, PNR, kelas
- **Visa Entry Panel** (`VisaEntryPanel`): panel khusus untuk input data visa (nomor aplikasi, status, tanggal)
- Tracking pembayaran: input paid_amount → auto-derive payment status
- Fee lapangan: VOA agent fee, kurir fee, pelaksana fee (dari metadata order)
- **Order Progress Tracker** (`OrderProgressTracker`): step visual per tipe order, bisa advance/goback
- **Invoice Button** (`InvoiceButton`): generate invoice PDF langsung dari detail order
- **Client View Dialog** (`ClientViewDialog`): lihat profil klien tanpa navigasi keluar
- **WhatsApp reminder** otomatis: tombol kirim reminder pembayaran ke klien via WA
- Saat status → `Completed`: award 20 poin ke agen (via API, idempoten), tambah wallet bonus
- Saat status kembali dari `Completed`: revoke poin (via API)
- Audit trail: setiap perubahan tercatat di `audit_logs`
- **Rate snapshot patch** (`buildRateSnapshotPatch`): snapshot rate kurs saat order dibuat

**Order Process Steps per Tipe:**

Setiap tipe order memiliki step berbeda yang dikontrol dari `UNIFIED_ORDER_STEPS` (sumber tunggal di `lib/orderProgress.ts`):
- `umrah`: step umrah/haji (pendaftaran, dokumen, paspor, visa, pelunasan, siap terbang)
- `flight`: step tiket pesawat (booking, issue, selesai)
- `visa_voa`: step VOA Mesir
- `visa_student`: step Visa Pelajar/Entry Student (multi-step dengan pelaksana)

---

### 7.6 Manajemen Klien (`/clients`) — Owner + Agent (+Staff untuk detail)

- Database klien (calon jamaah/pembeli) per agency
- Data: nama, nomor HP, email, nomor paspor, TTL, tempat lahir, expiry paspor, instansi penerbitan, gender, catatan
- **Referral tracking:** `referredBy` (agent/owner yang closing) + `referredByClientId` (klien lain yang mereferensikan)
- Riwayat order per klien
- **Passport scan langsung** di form tambah klien (`PassportScanButton`)
- **Client Doc Vault** (`ClientDocVault`): upload/view/delete dokumen dari halaman klien
- **Member Card preview:** lihat kartu anggota publik klien
- Link klien ke order dan jamaah
- Debounce search untuk performa

---

### 7.7 Kalkulator Paket (`/calculator`) — Semua Role

Fitur kalkulasi harga paket dengan tiga mode:

**Mode Professional Quote:**
- Input komponen biaya:
  - Hotel (nama, bintang, kota, tipe kamar, tarif per kamar/malam — termasuk `HotelRatesCell` untuk rate detail)
  - Transportasi (bus, taksi, kereta — per grup)
  - Tiket pesawat (tarif per pax, currency IDR/SAR/USD)
  - Visa (tarif per pax)
  - Destinasi/objek wisata
  - F&B (makan per hari)
  - Staf pendamping (muthawwif, guide, driver)
  - General cost (biaya lain-lain)
- Pax tiers: harga berbeda per jumlah peserta (misal: 10–14 pax vs 15–19 pax)
- Room sharing: single/double/triple/quad (cost-unit per pax atau per kamar)
- Markup dan profit margin otomatis
- **Quotation Meta Section** (`QuotationMetaSection`): nomor quote, nama customer, range tanggal, hotel Makkah
- **Output PDF:** Quotation PDF format IGH siap kirim ke klien (`POST /api/export/igh`)
- **Live PDF Thumbnail** (`LivePdfThumbnail`): preview thumbnail PDF real-time di sidebar
- **PDF Preview Dialog** (`PdfPreviewDialog`): preview full PDF sebelum download
- Simpan kalkulasi ke paket (auto-link ke `packageCalcStorage`)
- Lock/unlock kalkulasi (UI shield icon)

**Mode General Quote:**
- Kalkulasi cepat tanpa breakdown rinci
- Input total biaya + markup → harga jual per pax

**Mode Group Matrix:**
- `GroupMatrixSection`: tabel harga per kombinasi jumlah peserta × tipe kamar
- Berguna untuk presentasi proposal ke calon klien

**Tab Tambahan:**
- **Currency Converter Tab** (`CurrencyConverterTab`): Konversi real-time IDR ↔ SAR ↔ USD ↔ EUR ↔ EGP (via Frankfurter API, proxy Vite)
- **Visa Calculator Tab** (`VisaCalculatorTab`): Kalkulasi khusus biaya visa dengan fee breakdown lengkap

---

### 7.8 Laporan Keuangan (`/reports`) — Owner Only

**Tiga Tab Laporan:**

**Tab 1 — Summary:**
- Filter: rentang waktu (bulan ini / bulan lalu / tahun ini / semua), per agen (semua / direct / per agen), per tipe order
- Metrik: Total Pendapatan, Total Biaya Operasional, Profit Bersih, Piutang
- **Pie Chart** (Recharts): distribusi tipe order (umrah / flight / visa_voa / visa_student)
- **Bar Chart**: breakdown per agen — komisi, order count, total revenue
- Fee Ledger: VOA fee, kurir fee, pelaksana fee, komisi sales

**Tab 2 — Ledger:**
- Ledger transaksi keuangan lengkap via `buildLedgerEntries`
- Ringkasan: `ledgerSummary` — total kredit, total debit, saldo bersih

**Tab 3 — Piutang:**
- Daftar order yang memiliki receivable (belum lunas / DP / baru DP)
- Total piutang yang outstanding

**Product Commissions:**
- Persentase komisi per tipe produk bisa dikonfigurasi (`loadProductCommissions`)
- Bisa di-sync dari cloud (`pullProductCommissions`)

---

### 7.9 Export Center (`/exports`) — Owner Only

**Export 1 — Manifest Jamaah (Excel):**
- Pilih trip → export daftar jamaah lengkap ke `.xlsx`
- Kolom: nama, nomor paspor, TTL, gender, alamat, dan field jamaah lainnya

**Export 2 — Rooming List (Excel):**
- Pilih trip → export assignment kamar ke `.xlsx`
- Format per kamar: nomor kamar, tipe, penghuni

**Export 3 — Invoice PDF:**
- Pilih order (searchable) → generate invoice PDF
- Template bisa diupload oleh owner (background image/letterhead) via `InvoiceTemplateUploader`
- Auto-fill: nomor invoice (auto-increment), nama klien, detail order, breakdown harga
- Endpoint: `POST /api/export/invoice`
- Preview sebelum generate

---

### 7.10 Harga Tiket Admin (`/ticket-prices`) — Owner + Agent

Manajemen harga tiket pesawat yang dipublikasikan agency.

**Fitur:**
- CRUD harga tiket: airline, kode IATA, rute (from–to), jadwal, harga, mata uang, validitas, info bagasi
- **AI Scan** (`scanTicketPriceScreenshot`): upload screenshot GDS/foto tiket → OCR extract semua field otomatis (via OpenRouter)
- **Parse Galileo Text** (`parseGalileoTextToTickets`): paste raw text GDS → auto-parse lokal tanpa AI call
- **Multi-leg support:** encode multi-leg (`__ML__` encoding) dan return leg (`__RT__` encoding)
- **Route Timeline** (`RouteTimeline`): visualisasi rute single-leg
- **Multi-leg Timeline** (`MultiLegTimeline`): visualisasi rute multi-leg
- Markup configurable di atas base price (persisten via `loadMarkup`/`saveMarkup`)
- Toggle publish/unpublish per tiket
- Airline logo & gradient (via `getAirlineLogoUrl`, `getAirlineGradient`)
- Mata uang: IDR, SAR, USD, EGP, EUR, AED (mapping ke `CURRENCY_LABEL`)
- Preview halaman publik (link ke `/harga-tiket`)

---

### 7.11 Broadcast Templates (`/bc-templates`) — Owner + Agent

Library template pesan pemasaran siap pakai.

**Kategori Template:**

| Kode | Label | Icon |
|------|-------|------|
| `umrah` | Umrah | 🌙 |
| `haji` | Haji | 🌙 |
| `visa_on_arrival` | Visa on Arrival | 🪪 |
| `visa_pelajar` | Visa Pelajar | 📖 |
| `tiket_pesawat` | Tiket Pesawat | ✈️ |
| `general` | Umum | 💬 |

**Fitur:**
- CRUD template dengan editor Markdown + preview real-time (`MarkdownContent`)
- Variabel template: `{{NAMA_KLIEN}}`, `{{NO_ORDER}}`, `{{JENIS_VISA}}`, `{{NO_PENERBANGAN}}`, `{{TGL_BERANGKAT}}`, `{{TGL_PULANG}}`, `{{MASKAPAI}}`, `{{RUTE}}`, `{{STATUS_VISA}}`, `{{NO_PASPOR}}` + custom lainnya
- Sugesti variabel dengan klik langsung ke editor
- One-click copy ke clipboard
- Search & filter per kategori
- Tag untuk filter cepat

---

### 7.12 Itinerary Generator (`/itinerary`) — Owner + Agent

- Input teks jadwal GDS atau natural language → AI parsing otomatis leg-by-leg
- Input gambar/screenshot jadwal → OCR + AI extraction (Vision)
- Output:
  - Timeline penerbangan leg-by-leg (`MultiLegTimeline`)
  - Durasi transit antar kota (hitung otomatis)
  - Smart tips (bea cukai, lounge, dll)
  - Teks WhatsApp siap kirim (format rapi)
- **History 20 itinerary terakhir** (localStorage, key: `temantiket.itinerary.history.v1`)
- Export/copy/share hasil
- Regenerate dengan input berbeda

---

### 7.13 Agent Command Center (`/agent-center`) — Owner + Staff + Agent

Pusat kontrol untuk ekosistem agen mitra. Akses berbeda tergantung role.

**Tab & Sub-fitur (utamanya untuk Owner):**

- **Overview Agen:** List semua agen, tier badge, poin lifetime, total order, komisi earned, status online/offline (presence)
- **Bar Chart Performa:** visualisasi revenue per agen per bulan (Recharts BarChart)
- **Add Agent Dialog:** Invite agen baru dengan email, password, nama, nomor WA, status (active/inactive), dan persentase komisi
- **Agent Ketentuan:** Tab kelola fee dan aturan agen (Owner only):
  - `AgentFeeItem[]`: daftar item fee (Tiket Return, Tiket Oneway, Tiket Umrah PP/OW, IMEI Indo, VOA Mesir, Entry Student, Kurir Duit, Jemput VOA + custom)
  - `AgentRules`: catatan fee, syarat menjadi agen, layanan agen, bulan reset tier
  - Disimpan ke `agency_settings` table di Supabase
- **Mission Creator Section** (`MissionCreatorSection`): buat misi baru untuk agen
- **Wallet Card** (`AgentWalletCard`): credit/debit wallet agen dari sini
- **Remove Member:** hapus agen dari agency

---

### 7.14 Profil Agen Owner View (`/agents/:agentId`) — Owner Only

Halaman profil lengkap seorang agen, dilihat dari perspektif owner.

**Konten:**
- **Agent Card** digital (dengan card-back yang bisa diupload owner)
- Statistik: total order, total revenue, poin, tier, komisi earned, wallet balance
- Daftar misi + submission status (approve/reject dari sini)
- Riwayat poin per event
- Riwayat wallet transactions
- Daftar order agen
- Edit nama display, nomor WA, komisi %, catatan agen
- Upload/ganti foto profil dan card-back image
- Credit/debit wallet manual
- Link direct WA ke agen

---

### 7.15 Staff Management Center (`/staff-performance`) — Owner Only

Pusat manajemen staf internal yang komprehensif.

**Fitur:**
- List semua staf dengan metrik performa: total order, order completed, order aktif, order bermasalah, fee yang di-assign, completion rate
- Status online/offline real-time (via Supabase Realtime Presence)
- Filter: semua / online / top performer / alert (bermasalah) / idle
- Sort: nama, completed, fee, aktif, rate
- Filter periode: hari ini, minggu ini, bulan ini, semua waktu
- **Task Management per Staf:** buat task untuk staf (`StaffTask`) dengan prioritas (rendah/normal/tinggi/urgent) dan status (pending/diproses/menunggu_customer/revisi/selesai/bermasalah), due date, catatan
- **Notes per Staf** (`StaffNote`): owner bisa tambah catatan internal tentang staf
- Link ke profil lengkap staf (`/staff/:staffId`)
- Kirim WA langsung ke staf

---

### 7.16 Profil Staf Owner View (`/staff/:staffId`) — Owner Only

- **Staff Card** digital (mirip Agent Card tapi versi staf)
- Info: nama, email, tanggal bergabung, kode staf 4-digit
- Owner bisa upload card-back image untuk staf

---

### 7.17 Profil Agen Self-View (`/agent/profile`) — Agent Only

- **Agent Card** digital dengan foto profil dan card-back
- Upload/ganti foto profil dan card-back
- Statistik personal: total order, total revenue, komisi, poin lifetime, tier
- Riwayat poin per event (order + misi)
- **Field Tasks breakdown:** rincian fee lapangan yang pernah diterima:
  - VOA (Agen Lapangan VOA)
  - Pelaksana (Pelaksana Visa)
  - Kurir (Kurir Setoran)
  - Field Agent (Agen Lapangan)
  - Operational (Agen Operasional)
  - Executor (Pelaksana Visa Exec)
- Riwayat wallet transactions
- Tanggal bergabung agency

---

### 7.18 Profil Staf Self-View (`/staff/profile`) — Staff Only

- **Staff Card** digital
- Upload/ganti foto profil dan card-back
- Statistik: order aktif, order selesai, order bermasalah
- Wallet balance & riwayat transaksi
- Tanggal bergabung

---

### 7.19 Visa Dashboard Staf (`/staff/visa`) — Staff Only

Dashboard khusus staf untuk mengelola berkas visa yang di-assign ke mereka.

**Konten:**
- Daftar order `visa_student` yang pelaksananya adalah staf ini
- KPI: total berkas, berkas aktif, berkas selesai, bermasalah
- **Step navigator per order:** advance step (maju) dan go-back (mundur) inline
- Input catatan per order
- Tampilkan step visual dengan `StepBadge` (emoji + label)

---

### 7.20 Komisi Staf (`/staff/commission`) — Staff Only

Dashboard fee pelaksana visa untuk staf.

**Konten:**
- **KPI:** wallet balance, komisi tertunda, total komisi all-time
- **Fee by Order:** rincian fee per order (credited vs pending)
- Riwayat wallet transactions
- Fee diterima dari order yang sudah dikreditkan

---

### 7.21 Visa Tracker Owner (`/visa-tracker`) — Owner Only

Dashboard monitoring semua berkas Visa Student Entry (visa_student) dari perspektif owner.

**Fitur:**
- **KPI:** total berkas, berkas aktif, selesai, bermasalah, fee belum dibayar
- Tabel semua berkas visa dengan: klien, step saat ini, pelaksana assigned, status fee
- **Filter:** search, status (belum/proses/selesai/kendala/belum_dibayar), filter per pelaksana
- **Assign pelaksana:** owner bisa assign pelaksana (staf/agen) ke berkas tertentu inline
- **Credit fee pelaksana:** tombol credit fee langsung ke wallet pelaksana setelah selesai
- **Migration tool:** `POST /api/migrate-progress-steps` — migrasi berkas lama ke format step baru
- **Backfill field fees:** `POST /api/backfill-field-fees` — backfill fee yang belum tercatat
- Status pembayaran fee per pelaksana

---

### 7.22 Catatan (`/notes`) — Owner + Agent

Editor catatan internal per agency.

**Fitur:**
- CRUD catatan: judul, konten (Markdown), warna card, tag, pin
- **Warna card:** Putih, Orange (sky), Biru, Hijau, Ungu, Kuning
- **Sort:** terbaru, terlama, A–Z
- **Search** catatan
- **Pin catatan** penting ke atas
- **Markdown preview** (`MarkdownContent`)
- **Full-screen mode** (maximize editor)
- **Copy** konten catatan ke clipboard
- **Realtime sync** antar device via Supabase (`pullNotes`, `upsertNote`, `deleteNoteCloud`, `syncNotesFull`)
- **AI Clean & Structure** (via OpenRouter): perintahkan AI untuk membersihkan dan merapikan catatan dengan satu klik
- **AI Model Toggle** (`AIModelToggle`): pilih model AI yang digunakan
- **WA Mode detection** (`isWAMode`): deteksi apakah konten cocok untuk format WhatsApp
- Format konten ke plaintext untuk export/share

---

### 7.23 Pengaturan (`/settings`) — Semua Role

Pengaturan lengkap. Konten berbeda per role (owner bisa akses semua tab, staff/agent hanya subset).

**Tab Pengaturan:**

| Tab | Fitur | Role |
|-----|-------|------|
| **Profil** | Update display name, avatar (upload ke Supabase Storage), bio | Semua |
| **Agency** | Nama agency, info kontak, logo, WhatsApp admin | Owner |
| **Tampilan** | Theme (light/dark/auto), font size, banner color/preset (`BannerTheme`) | Semua |
| **Notifikasi** | Toggle notifikasi per kategori (order, payment, sync) | Semua |
| **Keamanan** | 2FA PIN (setup + verifikasi SHA-256), login alert, history 10 login terakhir | Semua |
| **Anggota** | Manage member, lihat status online/offline (Presence), set komisi per agen | Owner |
| **Regional** | Timezone, bahasa (id/en/ar + RTL), format tanggal | Semua |
| **Template Invoice** | Upload background invoice (PDF template), preview `LivePdfThumbnail` | Owner |
| **Promo Poster** | Upload dan manage poster promo (tampil di member card publik), reorder (drag) | Owner |
| **Fee & Komisi** | Setting persentase komisi per produk (`ProductCommissions`) | Owner |
| **Audit Log** | Riwayat 20 perubahan data terkini (dari `audit_logs`) | Owner |
| **Health Check** | Status koneksi Supabase DB, Storage, bucket per bucket (`checkHealth`) | Owner |
| **Migrasi Data** | Tool migrasi gambar base64 ke Supabase Storage (`migrateBase64ToStorage`) dengan progress bar | Owner |
| **Feature Flags** | Aktifkan/nonaktifkan fitur eksperimental (`featureSyncStore`) | Owner |

**Banner Preset:**
- Custom color picker (hex)
- Preset swatches: Ocean, Sunset, Emerald, Rose, Midnight, Amber

---

### 7.24 Audit Center (`/audit`) — Owner Only

Center monitoring dan debug produksi.

**Fungsi:**
- **Audit Log Real-time:** Semua perubahan data tercatat — create/update/delete per tabel
- **Search & filter** log
- **Rekonsiliasi Wallet** (`reconcileWalletTxs`): Deteksi:
  - Fee yang hilang (`missing_fee`)
  - Duplikat transaksi
  - Assignment yatim piatu
  - Mismatch nominal
- **Order Health Check:** Deteksi order stale, metadata rusak, step tidak valid (`repairMetadata`)
- **Realtime Status Indicator** (`RealtimeIndicator`): status WebSocket Supabase
- **Health Check** koneksi Supabase + Storage
- **Feature Flags status**
- Export: CSV, JSON, copy debug report (plaintext)
- Mode tampilan: **Compact** / **Technical**
- Severity system: success ✅ / info ℹ️ / warning ⚠️ / error ❌ (sortable)
- **Wallet error translator** (`translateWalletError`): terjemahan error wallet ke bahasa manusia

---

### 7.25 Leaderboard Internal (`/agent/leaderboard`) — Semua Role (Authenticated)

Leaderboard agen dengan akses authenticated.

**Fitur:**
- Ranking agen berdasarkan total poin (order points + mission points)
- Filter periode: Bulan Ini, Bulan Lalu, Tahun Ini, Sepanjang Masa
- Kolom: rank, nama, tier badge, avatar/gradient, poin, revenue, order count
- Top 3 dengan styling khusus (crown, medal)
- Real-time update via `onAgentPointsChanged` (Supabase Realtime)
- Bisa diakses oleh owner, staff, dan agent

---

### 7.26 Marketing Kit / Caption Generator (`/agent/marketing`) — Semua Role

Halaman mandiri untuk Caption Generator AI (bungkus `CaptionGenerator` component dari `MarketingKitGenerator`).
- Akses mudah dari sidebar semua role
- Detail fitur: lihat Bagian 8.2

---

### 7.27 Demo Seed (`/demo-seed`) — Owner Only

Tool untuk mengisi data demo/contoh ke database agency. Berguna untuk demo ke calon klien.

**Tiga Mode Seeding:**

**Mode Quick Inject:**
- Inject 2 item cepat: 1 klien + 1 order VOA Mesir

**Mode Basic (10 item):**
- Paket Umrah, Trip + Jamaah, Klien, Order Umrah, Order Tiket Pesawat, Order Visa VOA, Order Visa Pelajar, Template BC WhatsApp, Misi Harian Agen, Catatan

**Mode Masisir Edition:**
- 5 Klien mahasiswa Al-Azhar (realistis Masisir Cairo)
- 10 Order rute Cairo (EGP/SAR + markup logis)
- 5 Harga Tiket rute Cairo (CGK/KNO, harga EGP)
- Misi + Template + Submission (3 template + 3 misi + 2 submission)

**Cleanup per mode:** setiap mode punya tombol cleanup yang menghapus data demo tanpa menyentuh data asli.

---

## 8. Sistem AI & Otomasi

### 8.1 OCR Paspor (Passport Scanner)

**Cara kerja:**
1. Upload foto/scan paspor via `PassportScanButton` atau `BulkOcrDialog`
2. Gambar dikirim ke `POST /api/ocr-passport` (server Express)
3. Server forward ke OpenRouter — model **Gemini 2.0 Flash Vision**
4. Model membaca MRZ (Machine Readable Zone) dan data halaman biodata
5. Response: `{ name, passportNumber, birthDate, expiryDate, gender }`
6. Auto-fill form data jamaah atau klien

**Bulk OCR** (`BulkOcrDialog`): upload banyak paspor sekaligus, batch processing dengan progress indicator.

---

### 8.2 Caption Generator AI (Marketing)

**Cara kerja:**
1. Pilih kategori dan tone (persuasif, informatif, urgent, inspiratif)
2. Isi context bebas: nama paket, harga, keunggulan, promo
3. Atau upload foto poster → OCR ekstrak fakta → generate caption
4. Server `POST /api/ai/chat` → OpenRouter (GPT-4.1 untuk caption, Gemini Vision untuk OCR poster)
5. Output: caption WhatsApp/Instagram siap posting

**Fitur:**
- Regenerate dengan seed berbeda
- Copy ke clipboard
- Download hasil
- Share via WA
- History caption terakhir

---

### 8.3 Itinerary AI

**Cara kerja:**
- Input teks GDS (Galileo/Amadeus format) → `extractItinerary` → AI parsing leg-by-leg
- Input gambar jadwal → `extractItineraryFromImage` → Vision OCR → parsing
- Output: `{ legs: [{ airline, flightNumber, from, to, dep, arr, duration }] }`
- Auto-hitung transit time (`calcTransitMinutes`), total durasi (`fmtMinutes`)
- `buildWhatsAppText`: format output siap kirim WA
- `buildSmartTips`: generate smart tips berdasarkan rute

---

### 8.4 Ticket Price Scanner AI

- Upload screenshot halaman booking/GDS → `scanTicketPriceScreenshot` → server → OpenRouter (Vision)
- AI extract: airline, rute (from/to IATA + city), harga, tanggal, flight number, ETD, ETA, bagasi, tipe perjalanan (one-way/return/multi-city)
- Auto-fill form input harga tiket di `TicketPrices`
- Juga bisa parse raw Galileo text lokal: `parseGalileoTextToTickets` (tanpa AI call)

---

### 8.5 Notes AI (Clean & Structure)

- Di halaman Notes: tombol AI untuk membersihkan dan merapikan catatan
- Server `POST /api/ai/chat` → OpenRouter
- `cleanAndStructureNote`: konversi catatan mentah ke Markdown terstruktur
- `isWAMode`: deteksi apakah output cocok diformat untuk WhatsApp

---

### 8.6 AITEM — AI Assistant

**AI assistant** yang terintegrasi dengan data kontekstual agency.

**Kemampuan:**
- Menjawab pertanyaan tentang data order, jamaah, keuangan
- Context-aware: tahu siapa user yang login, agency mereka, data terkini (via `aiContextStore`)
- Streaming response (real-time typing effect)
- **AI Model Toggle** (`AIModelToggle`): pilih model (berbeda per halaman)

**Endpoint:**
- `POST /api/ai/assistant` — assistant endpoint dengan context injection
- `POST /api/ai/chat` — general chat endpoint

**Akses:**
- Floating `AIChatWidget` tersedia di semua halaman (owner + agent, tidak muncul untuk staff)
- `AIContextualBar`: info kontekstual per halaman (konteks berubah sesuai halaman aktif via `aiContextStore`)
- Tab AITEM di Agent Command Center

---

### 8.7 Flight Parser (GDS Auto-parse)

- Parse teks raw GDS Galileo/Amadeus secara lokal (tanpa AI call) via `parseGalileoTextToTickets`
- Extract: PNR, airline code, flight number, rute (IATA), jadwal, kelas, bagasi
- Digunakan di `FlightOrderEditor` dan `TicketPrices` untuk input cepat
- Encoding multi-leg: `encodeMultiLeg` / `decodeMultiLeg` (format `__ML__`)
- Encoding return leg: `encodeReturnLeg` / `decodeReturnLeg` (format `__RT__`)

---

## 9. Sistem Gamifikasi Agen

### 9.1 Sistem Poin

Setiap agen mengumpulkan poin dari aktivitas:

| Aktivitas | Poin |
|-----------|------|
| Order → Completed | +20 poin (via `POST /api/award-completion-points`, idempoten) |
| Misi disetujui owner | variabel (sesuai setting misi) |
| Revoke order dari Completed | -20 poin (via `POST /api/revoke-order-points`) |

Poin tersimpan di tabel `agent_points` dengan log detail per event (order_id, reason, awarded_at).

`REASON_LABEL`: mapping kode alasan poin ke label human-readable.

Total poin agen = `sumPointsByAgent(orderPoints)` + `sumMissionPointsByAgent(missionSubmissions)`.

---

### 9.2 Sistem Tier

| Tier | Min Poin | Setara Order | Perks |
|------|----------|-------------|-------|
| 🥉 Bronze | 0 | 0 | Komisi standar, Marketing Kit dasar, Leaderboard bulanan |
| 🥈 Silver | 100 | ≥10 order | Bonus komisi +1%, prioritas admin, reward bulanan Silver |
| 🥇 Gold | 500 | ≥50 order | Bonus komisi +2%, template eksklusif, undangan event tahunan |
| 💎 Platinum | 1.500 | ≥150 order | Bonus komisi +3%, umrah gratis tahunan, profil di halaman publik |

**Visual:** Progress bar di `AgentTierProgress` + `AgentTierBadge`.

**Gradient & warna tier:**
- Bronze: `from-blue-500 to-blue-700` (biru, bukan kuning/cokelat)
- Silver: `from-slate-300 to-slate-500`
- Gold: `from-yellow-400 to-amber-600`
- Platinum: `from-indigo-500 via-purple-500 to-pink-500`

---

### 9.3 Wallet Agen

Sistem dompet digital untuk mencatat komisi dan fee:

**Tipe transaksi wallet:**

| Kode | Deskripsi |
|------|-----------|
| `order_bonus` | Komisi sales dari order yang dibuat agen |
| `voa_agent_fee` | Fee agen lapangan VOA |
| `pelaksana_fee` | Fee pelaksana visa |
| `kurir_fee` | Fee kurir setoran |
| `mission_reward` | Reward uang tunai dari misi |
| `debit` | Pengurangan saldo |

- Saldo real-time dari ledger transaksi (`walletBalance`)
- Riwayat transaksi lengkap per agen
- Owner dapat credit/debit wallet agen dari: Audit Center, Agent Profile Owner View, Order Detail (via `AgentWalletCard`)
- Endpoint idempoten: `POST /api/credit-wallet-tx` — duplikat transaksi ditolak via unique ID
- `POST /api/award-commission-points`: award komisi + tambah poin sekaligus

---

### 9.4 Misi Harian (Daily Missions)

Sistem misi berbatas waktu.

**Alur:**
1. Owner/staf buat misi baru via `MissionCreatorSection` di Agent Command Center:
   - Judul, deskripsi, deadline, reward poin, reward IDR (opsional), target agen (semua / spesifik)
2. Agen melihat misi aktif di `AgentMissionWidget` di Agent Dashboard
3. Agen submit pengerjaan + upload foto bukti
4. Owner/staf review dan approve/reject dari Agent Profile Owner View
5. Saat approved: poin otomatis dikreditkan, fee IDR masuk wallet (jika ada)
6. **Popup notification real-time** (`MissionPopupNotification`): popup muncul saat misi baru dibuat dan agen jadi target (via `onNewMissionInserted` Supabase Realtime)
7. **Mission confetti** (`MissionConfetti`): animasi konfeti saat misi berhasil

**Mission Meta** (`pullMissionMeta`): metadata tambahan misi (fee IDR, target agent IDs) disimpan terpisah.

---

### 9.5 Leaderboard

**Dua versi:**

1. **Internal** (`/agent/leaderboard`, authenticated): bisa diakses owner/staff/agent, filter per periode, lihat revenue + poin
2. **Publik** (`/leaderboard`, tanpa login): ranking agen terbuka untuk umum, bisa dishare ke calon agen sebagai motivasi

---

### 9.6 Reward Catalog

Katalog hadiah yang bisa ditukar agen dengan poin (komponen `RewardCatalog`):
- Voucher diskon IDR
- Merchandise branded
- Akses fitur premium
- Reward kustom dari owner

---

### 9.7 Agent Ketentuan

Konfigurasi aturan dan fee agen yang bisa dikelola owner dari Agent Command Center.

**Dua bagian:**

1. **AgentFeeItem[]** — daftar fee per layanan:
   - Default: Tiket Return (220K), Tiket Oneway (110K), Tiket Umrah PP (100K/pax), Tiket Umrah OW (50K/pax), IMEI Indo (100K), VOA Mesir (150K), Entry Student (150K), Kurir Duit (100K), Jemput VOA (150K)
   - Bisa ditambah/edit/hapus

2. **AgentRules** — aturan tekstual:
   - Catatan fee (notes)
   - Syarat menjadi agen
   - Layanan yang harus diberikan agen
   - Bulan reset tier

Disimpan ke `agency_settings` table di Supabase (`pullAgencySettings` / `pushAgencySettings`).

---

## 10. Halaman Publik

### 10.1 Cek Booking (`/cek`, `/cek/:code`)

- Input kode booking → cari via `lookupBooking`
- Tampil: status order, tipe, jadwal, breakdown pembayaran (DP, cicilan, pelunasan, tipe bayar)
- Progress tracker visual per step (via `PublicOrderProgressSection`)
- Error handling: not_found, invalid_code, server error

---

### 10.2 Kartu Anggota Digital (`/m/:slug`)

Setiap agen punya URL kartu anggota publik unik (`/m/namaagen`).

**Konten:**

- **MemberCard** (`MemberCard`): kartu fisik digital dengan foto profil, nama, tier, poin, kode agen
- **Stamp Card** visual: kartu loyalitas dengan milestone reward:
  - 4 stamps: 🎫 Voucher Diskon Rp100.000
  - 8 stamps: 🎁 Merchandise Resmi Temantiket
  - 12 stamps: 💸 Voucher Diskon Rp300.000
  - 16 stamps: ✈️ VIP Grand Reward — City Tour Transit Qatar
- **Stamp types:** umrah, flight, visa_voa, visa_student, transit Dubai, transit Saudi
- **Promo Carousel** (`PromoCarousel`): poster promo aktif dari agency dengan auto-scroll
- **Riwayat order publik** (tanpa data sensitif)
- **Referral system:**
  - Link referral unik per agen
  - Share via WA
  - Decrement stamp saat klien ter-referral (via `decrementReferralStamp`)
- Tombol rekrut agen jika visitor belum jadi agen (link ke WA admin)
- **Order progress tracker publik** (`PublicOrderProgressSection`): klien bisa cek step order mereka dari kartu anggota

---

### 10.3 Harga Tiket Publik (`/harga-tiket`, `/promo`, `/prices`)

Tiga alias URL → halaman yang sama (`PublicTicketPrices`).

**Fitur Advanced Filter & Sort:**
- Real-time search (rute + maskapai)
- Filter bulan keberangkatan (picker bulan/tahun)
- Filter per maskapai (dropdown)
- Filter direct/transit
- Sort: default, harga terendah, harga tertinggi, tanggal terdekat
- Harga ditampilkan dengan markup applied (`sellingPrice`)
- Detail per tiket: jadwal, rute dengan `RouteTimeline` / `MultiLegTimeline`, info bagasi, mata uang
- Tombol WA ke admin untuk pesan
- **Banner theme** agency (warna/gradient dari `BannerTheme` setting owner)

---

### 10.4 Leaderboard Publik (`/leaderboard`)

- Ranking agen terbuka untuk umum
- Nama, tier badge, avatar gradient, total poin
- Digunakan sebagai alat rekrutmen agen

---

## 11. Infrastruktur & Keamanan

### 11.1 Autentikasi & Otorisasi

- **Auth provider:** Supabase Auth (email + password)
- JWT-based session, auto-refresh token (`getFreshAccessToken` dengan timeout 8 detik)
- **Session hardening:** login call di-race dengan timeout 10 detik, refresh token race dengan timeout 8 detik — tidak bisa hang selamanya
- **RLS (Row Level Security):** Semua tabel Supabase dilindungi policy per `agency_id`
- **Service Role Key:** Hanya digunakan server-side (Express) — tidak pernah terekspos ke browser
- **2FA PIN:** Opsional, dikonfigurasi per user via Settings → Keamanan
  - PIN di-hash dengan SHA-256 (`sha("igh-tour-pin-salt-2024", pin)`)
  - Disimpan di localStorage per user ID
  - Fase login: `"ok"` | `"needs_pin"` | `false`
- **Login Alert:** Notifikasi toast jika ada login baru (menampilkan waktu login sebelumnya)
- **Login History:** Riwayat 10 login terakhir tersimpan di localStorage

### 11.2 Pengelolaan Secret

| Secret | Letak | Digunakan Oleh |
|--------|-------|----------------|
| `VITE_SUPABASE_URL` | Env (publik, shared) | Frontend + Backend |
| `VITE_SUPABASE_ANON_KEY` | Secret (Replit) | Frontend (via Vite define) + Backend |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret (Replit) | Backend only (server-side Express) |
| `OPENROUTER_API_KEY` | Secret (Replit) | Backend only (OCR, caption, itinerary, ticket scan, notes AI) |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Replit AI Integration | Backend only (AITEM assistant) |

### 11.3 File Storage

Supabase Storage Buckets:

| Bucket | Akses | Konten |
|--------|-------|--------|
| `jamaah-photos` | Public | Foto jamaah |
| `jamaah-docs` | Public | Dokumen jamaah (paspor, visa) |
| `card-backs` | Public | Gambar belakang kartu anggota agen |
| `pdf-templates` | Public | Template invoice PDF |
| `card-back-images` | Public | Gambar kartu identitas digital (agen & staf) |

Upload foto/dokumen dilakukan melalui server (`POST /api/upload-card-back`, `POST /api/setup-card-back`) atau langsung dari browser dengan Supabase client (jamaah docs).

### 11.4 Realtime & Sync

- **Supabase Realtime:** WebSocket untuk live updates — order, misi baru, presence online/offline, poin agen
- **Managed Realtime** (`startManagedRealtime`): satu instance WebSocket per session, auto-reconnect, status tracking
- **RealtimeManager** (`lib/realtimeManager`): status: `"connecting"` | `"live"` | `"offline"`, notification toast saat reconnect
- **Cloud Sync:** Settings, banner theme, product commissions, rates, markup tiket di-pull dari Supabase saat startup
- **Sync Status Badge** (`CloudSyncBadge`): indikator visual di UI apakah data lokal sudah sinkron
- **Persisted Cache** (`makePersistedCache`): localStorage cache per agency_id untuk Zustand stores
- **Offline Bar** (`OfflineBar`): banner saat koneksi internet terputus
- **Supabase Realtime events yang di-listen:**
  - `onNewMissionInserted` → popup misi baru di agen
  - `onMissionsChanged` → refresh widget misi
  - `onAgentPointsChanged` → refresh leaderboard
  - Orders, clients, trips, packages (via store refresh)

### 11.5 Multi-bahasa (i18n)

Mendukung tiga bahasa (via `regionalStore` + `useT` hook):
- 🇮🇩 Bahasa Indonesia (default)
- 🇬🇧 English
- 🇸🇦 العربية (Arabic — dengan RTL layout otomatis via `document.dir = "rtl"`)

Konfigurasi per user (disimpan di localStorage + Supabase `agency_settings`).

### 11.6 PWA (Progressive Web App)

- Install di Home Screen (Android & iOS) via `PwaInstallPrompt`
- Splash screen + icon branded Temantiket
- Offline support via Workbox Service Worker (NetworkFirst untuk REST/API, CacheFirst untuk Storage assets)
- Auto-update saat ada versi baru
- `manifest.webmanifest` + `sw.js` auto-generated saat build
- Push notification infrastructure tersedia (Service Worker sudah ada)

---

## 12. Model Data

### Tabel Utama Supabase

| Tabel | Deskripsi |
|-------|-----------|
| `agencies` | Data biro perjalanan (tenant) |
| `agency_members` | Anggota per agency (owner/staff/agent) + metadata komisi |
| `agency_settings` | Key-value settings per agency (banner theme, fee items, rules, dll) |
| `profiles` | Profil publik user (full_name, email, photo_url) |
| `trips` | Trip perjalanan per agency |
| `jamaah` | Data jamaah per trip |
| `jamaah_docs` | Dokumen jamaah (multi per jamaah, type: paspor/visa/foto) |
| `packages` | Paket perjalanan yang dijual |
| `package_calculations` | Snapshot kalkulasi kalkulator per paket |
| `orders` | Order layanan (umrah/flight/visa_voa/visa_student) |
| `clients` | Data klien/pemesan |
| `notes` | Catatan internal agency (realtime sync) |
| `pdf_layout_presets` | Preset layout PDF export |
| `pdf_templates` | Template invoice yang diupload |
| `audit_logs` | Log semua perubahan data (create/update/delete per tabel) |
| `agent_points` | Log poin gamifikasi per agen (per event: order, misi) |
| `reward_redemptions` | Penukaran reward oleh agen |
| `bc_templates` | Template broadcast/marketing |
| `ticket_prices` | Harga tiket yang dipublikasikan |
| `daily_missions` | Misi harian yang dibuat owner/staf |
| `mission_templates` | Template misi yang bisa dipakai ulang |
| `mission_submissions` | Submission bukti pengerjaan misi oleh agen |
| `wallet_transactions` | Ledger transaksi wallet agen/staf |

### Field Penting di `orders`

| Field | Tipe | Deskripsi |
|-------|------|-----------|
| `type` | enum | `umrah` / `flight` / `visa_voa` / `visa_student` |
| `status` | enum | `Draft` / `Confirmed` / `Paid` / `Completed` / `Cancelled` |
| `payment_status` | enum | `UNPAID` / `DP` / `PAID` / `REFUNDED` |
| `paid_amount` | number | Jumlah yang sudah dibayar klien |
| `total_price` | number | Total harga order |
| `cost_price` | number | HPP (harga pokok) — untuk kalkulasi profit |
| `currency` | string | Mata uang: `IDR` / `EGP` |
| `metadata` | jsonb | Metadata per tipe order (flight: PNR, rute, jadwal; visa: fee breakdown, pelaksana, step; dll) |
| `created_by_agent` | uuid | User ID agen yang input order (null = Direct) |
| `trip_id` / `package_id` / `jamaah_id` | uuid | Link ke trip/paket/jamaah |

### Relasi Utama

```
agencies
  └── agency_members (user_id → auth.users)
  └── agency_settings (key-value per agency)
  └── trips
        └── jamaah
              └── jamaah_docs
  └── packages
        └── package_calculations
  └── orders
        └── (linked to clients, trips, jamaah)
  └── clients
  └── agent_points (agent_id → agency_members.user_id)
  └── wallet_transactions (user_id → agency_members.user_id)
  └── bc_templates
  └── ticket_prices
  └── daily_missions
        └── mission_submissions
  └── audit_logs
  └── pdf_templates
  └── notes
```

---

## 13. API Server (Express)

Express server berjalan di port 3001. Semua endpoint menggunakan prefix `/api`.

| Method | Endpoint | Auth | Fungsi |
|--------|----------|------|--------|
| `GET` | `/api/health-check` | Tanpa auth | Cek koneksi Supabase DB + Storage + bucket |
| `POST` | `/api/bootstrap` | Tanpa auth | Setup owner pertama kali + buat agency |
| `POST` | `/api/invite-member` | JWT (owner) | Invite agen/staf baru ke agency |
| `POST` | `/api/remove-member` | JWT (owner) | Hapus anggota dari agency |
| `POST` | `/api/award-completion-points` | JWT | Award poin saat order → Completed (idempoten) |
| `POST` | `/api/revoke-order-points` | JWT | Cabut poin saat order keluar dari Completed |
| `POST` | `/api/award-commission-points` | JWT | Award komisi + poin ke agen |
| `POST` | `/api/credit-wallet-tx` | JWT | Credit/debit wallet agen (idempoten via unique ID) |
| `POST` | `/api/export/invoice` | JWT | Generate invoice PDF dari data order |
| `POST` | `/api/export/igh` | JWT | Generate IGH quotation PDF dari data kalkulator |
| `POST` | `/api/ocr-passport` | JWT | OCR paspor via OpenRouter Gemini Vision |
| `POST` | `/api/ai/chat` | JWT | AI chat (caption, itinerary, notes AI) via OpenRouter |
| `POST` | `/api/ai/assistant` | JWT | AITEM assistant via OpenAI + context injection |
| `POST` | `/api/upload-card-back` | JWT | Upload gambar belakang kartu ke Supabase Storage |
| `POST` | `/api/card-back-signed-url` | JWT | Generate signed URL untuk akses card-back |
| `POST` | `/api/save-card-back-url` | JWT | Simpan URL card-back ke database |
| `POST` | `/api/setup-card-back` | JWT | Setup initial card-back untuk member |
| `POST` | `/api/backfill-field-fees` | JWT (owner) | Backfill fee lapangan yang belum tercatat |
| `POST` | `/api/migrate-progress-steps` | JWT (owner) | Migrasi berkas visa ke format step baru |

---

## 14. Integrasi Eksternal

| Layanan | Kegunaan | Cara Integrasi |
|---------|----------|----------------|
| **Supabase** | Database (PostgreSQL), Auth (JWT), Storage (file), Realtime (WebSocket) | SDK `@supabase/supabase-js`, service-role via Express |
| **OpenRouter** | OCR Paspor (Gemini 2.0 Flash), Caption Generator (GPT-4.1 + Gemini Vision), Itinerary AI, Ticket Scanner, Notes AI | REST API via Express server — `OPENROUTER_API_KEY` |
| **OpenAI** | AITEM assistant | REST API via Replit AI Integration — `AI_INTEGRATIONS_OPENAI_API_KEY` |
| **Frankfurter API** | Exchange rates real-time (IDR/SAR/USD/EUR/EGP) | Proxy via Vite dev server (`/api/frankfurter → frankfurter.app`) |
| **WhatsApp** | Deep link ke chat admin, reminder pembayaran, share itinerary/caption | Konstruksi URL `wa.me/` lokal via `whatsappUrl()`, `buildWhatsAppReminderUrl()`, `openWaMessage()` |

---

## 15. Non-Functional Requirements

### 15.1 Performa
- First Contentful Paint (FCP) < 2 detik pada koneksi 4G
- Time to Interactive (TTI) < 4 detik
- API response < 500ms untuk operasi DB standar
- AI OCR response < 10 detik per gambar (timeout AbortController 20 detik di `callEdgeFunction`)
- Bundle optimization: code splitting via Vite dynamic imports, lazy load berat (xlsx, pdf-lib, tesseract)
- Debounce search (via `useDebounce` hook)
- TanStack Query (`@tanstack/react-query`) dengan staleTime 5 menit untuk query caching

### 15.2 Ketersediaan
- Target uptime: 99.5%
- Offline read: tersedia via Service Worker Workbox cache
- Graceful degradation: UI tetap bisa dipakai tanpa koneksi (baca data persisted cache)
- Health check: `GET /api/health-check` memonitor DB + Storage
- Session timeout handling: semua network call di-race dengan timeout — tidak bisa hang selamanya

### 15.3 Skalabilitas
- Multi-tenant by design: satu deployment untuk semua agency
- RLS Supabase memastikan isolasi data antar tenant
- Autoscale deployment via Replit

### 15.4 Keamanan
- Tidak ada secret/API key di frontend bundle (Vite build)
- Semua operasi admin via Express server dengan validasi JWT
- Service Role Key hanya di server (tidak pernah ke browser)
- Rate limiting per endpoint sensitif di Express
- Input sanitasi di semua form React
- XSS protection via React rendering
- CORS terkontrol di Express
- 2FA PIN optional per user (SHA-256 hash, tidak pernah dikirim ke server)

### 15.5 Aksesibilitas
- Responsive: mobile-first, optimal di layar 360px–1440px
- Touch-friendly: tap targets minimal 44×44px
- PWA installable di iOS & Android
- Dukungan RTL untuk bahasa Arab (via `document.dir`)
- Framer Motion animasi: spring physics, stagger children, fade-up patterns yang konsisten

---

## 16. Roadmap & Prioritas

### Sudah Live (Production) ✅

- Manajemen Trip, Jamaah, Order (4 tipe), Klien
- Kalkulator paket profesional + PDF quotation (IGH format)
- OCR Paspor via AI (Gemini Vision)
- Caption Generator AI (GPT-4.1)
- Notes AI (clean & structure)
- Sistem gamifikasi agen (poin, tier, wallet, misi, leaderboard, reward catalog)
- Agent Ketentuan (fee items + aturan agen)
- Dashboard owner, staf, agen (masing-masing punya dashboard spesifik)
- Profil Agen Self-view + Owner View
- Profil Staf Self-view + Owner View
- Laporan keuangan dengan 3 tab (Summary, Ledger, Piutang)
- Export Center (manifest, rooming list, invoice PDF)
- Halaman publik (cek booking, kartu anggota dengan stamp card, harga tiket dengan filter advanced)
- Broadcast Templates (6 kategori + variabel)
- Itinerary Generator AI + history 20 item
- Ticket Price Scanner AI + Galileo text parser
- Multi-leg & return leg encoding tiket
- Staff Management Center (task management, performance metrics, presence)
- Visa Tracker Owner (assignment, fee credit, migration tool)
- Visa Dashboard Staf (step navigator per berkas)
- Komisi Dashboard Staf
- Agent Command Center (overview, chart, add agent, ketentuan)
- Leaderboard internal (authenticated) + publik
- Marketing Kit / Caption Generator standalone page
- Audit Center (reconciliation, health check, export)
- Demo Seed (3 mode: Quick, Basic, Masisir Edition)
- Cloud sync + Realtime (managed WebSocket, auto-reconnect)
- PWA (installable, offline support)
- Multi-bahasa (id/en/ar + RTL)
- 2FA PIN per user

### Kandidat Pengembangan Berikutnya

| Prioritas | Fitur | Alasan |
|-----------|-------|--------|
| Tinggi | Push Notification real-time | Service Worker sudah ada, tinggal server-side push payload |
| Tinggi | Pembayaran online terintegrasi | Kurangi konfirmasi pembayaran manual |
| Sedang | Aplikasi mobile native (Expo) | UX lebih baik dari PWA untuk agen lapangan |
| Sedang | WhatsApp Business API | Otomasi pengiriman update ke klien |
| Sedang | E-signature dokumen | Proses dokumen perjalanan lebih cepat |
| Sedang | Staff Task tracking dari sisi staf | Staf bisa update status task yang di-assign owner |
| Rendah | Integrasi GDS langsung (Amadeus/Galileo) | Auto-import tiket tanpa input manual |
| Rendah | CRM pipeline sales | Track prospek dari kontak → booking |
| Rendah | Laporan pajak otomatis | Compliance bisnis |

---

*Dokumen ini disusun berdasarkan analisis menyeluruh codebase Temantiket versi produksi (Mei 2025).*  
*Mencakup semua route, komponen, store, API endpoint, dan logika bisnis yang aktif di codebase.*
