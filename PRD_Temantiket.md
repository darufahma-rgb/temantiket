# PRD — Temantiket
## Platform Manajemen Umrah, Haji & Tour

**Versi:** 1.0  
**Status:** Production  
**Tagline:** *mudah, cepat, amanah*

---

## Daftar Isi

1. [Ringkasan Eksekutif](#1-ringkasan-eksekutif)
2. [Latar Belakang & Masalah](#2-latar-belakang--masalah)
3. [Target Pengguna](#3-target-pengguna)
4. [Arsitektur Sistem](#4-arsitektur-sistem)
5. [Struktur Role & Akses](#5-struktur-role--akses)
6. [Modul & Fitur Lengkap](#6-modul--fitur-lengkap)
7. [Sistem AI & Otomasi](#7-sistem-ai--otomasi)
8. [Sistem Gamifikasi Agen](#8-sistem-gamifikasi-agen)
9. [Halaman Publik](#9-halaman-publik)
10. [Infrastruktur & Keamanan](#10-infrastruktur--keamanan)
11. [Model Data](#11-model-data)
12. [Integrasi Eksternal](#12-integrasi-eksternal)
13. [Non-Functional Requirements](#13-non-functional-requirements)
14. [Roadmap & Prioritas](#14-roadmap--prioritas)

---

## 1. Ringkasan Eksekutif

Temantiket adalah platform manajemen perjalanan berbasis web (PWA) yang dirancang khusus untuk **biro umrah, haji, dan tour** di Indonesia. Platform ini menyatukan seluruh alur operasional — dari pengelolaan jamaah, paket perjalanan, order layanan, hingga keuangan agen — dalam satu sistem terpadu yang bisa diakses dari browser manapun.

Platform ini beroperasi dalam model **multi-tenant**: setiap biro perjalanan (agency) memiliki data yang sepenuhnya terisolasi, dikelola oleh pemilik (owner), dibantu oleh staf, dan dipasarkan oleh agen mitra (agent).

### Tujuan Utama
- Menggantikan pencatatan manual (spreadsheet, WhatsApp, notes) dengan sistem digital terpusat
- Memberikan visibilitas penuh kepada owner atas keuangan, agen, dan progres order
- Memotivasi agen mitra melalui sistem gamifikasi (poin, tier, misi, wallet)
- Mempercepat pembuatan dokumen perjalanan (invoice, manifest, kartu anggota) melalui AI dan ekspor otomatis

---

## 2. Latar Belakang & Masalah

### Masalah yang Diselesaikan

| Masalah | Kondisi Saat Ini | Solusi Temantiket |
|---------|-----------------|-------------------|
| Data jamaah berserakan | Spreadsheet Excel terpisah-pisah | Database jamaah terpusat per trip |
| Kalkulasi harga paket manual | Kalkulator Excel, error-prone | Kalkulator otomatis multi-mata uang |
| Susah track pembayaran | Catatan manual/WhatsApp | Payment tracker per order |
| Tidak ada visibilitas agen | Owner tidak tahu performa agen | Leaderboard, laporan komisi, wallet |
| Dokumen lambat dibuat | Manual di Word/Canva | Generate PDF/Excel otomatis |
| OCR paspor manual | Ketik ulang data satu per satu | Scan paspor via AI |
| Marketing tidak konsisten | Setiap agen buat sendiri | Template broadcast terpusat |

---

## 3. Target Pengguna

### 3.1 Primer: Pemilik Biro (Owner)
- Pemilik atau direktur biro umrah/haji/tour kecil-menengah
- Mengelola 1–30 agen dan staf
- Perlu visibilitas keuangan, performa agen, dan progres jamaah
- Sering di perjalanan, butuh akses mobile

### 3.2 Sekunder: Staf Operasional (Staff)
- Admin atau staf back-office agency
- Membantu proses order, dokumen, dan koordinasi lapangan
- Akses terbatas pada data keuangan agency secara keseluruhan

### 3.3 Tersier: Agen Mitra (Agent)
- Sales freelance atau mitra agency
- Fokus pada akuisisi klien dan input order
- Termotivasi oleh komisi dan sistem poin/tier
- Butuh alat marketing yang mudah

### 3.4 Eksternal: Klien / Jamaah
- Calon atau jamaah aktif yang ingin cek status booking
- Mengakses halaman publik (tanpa login) untuk cek progres order dan kartu anggota

---

## 4. Arsitektur Sistem

### Stack Teknologi

```
Frontend:  React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui
Backend:   Node.js + Express (server/index.cjs, port 3001)
Database:  Supabase (PostgreSQL + Auth + Storage + Realtime)
AI:        OpenRouter (OCR paspor, caption) + OpenAI via Replit AI (AITEM)
Deploy:    Replit Autoscale + PWA (Progressive Web App)
```

### Pola Arsitektur
- **Multi-tenant:** Data diisolasi per `agency_id` — RLS (Row Level Security) Supabase memastikan tidak ada kebocoran data antar tenant
- **Client/Server separation:** Semua operasi sensitif (service-role key, AI calls, file upload server-side) melewati Express API — tidak ada secret yang terekspos ke browser
- **Offline-first:** Service Worker + cache strategy (NetworkFirst untuk REST, CacheFirst untuk Storage assets) memastikan app tetap bisa digunakan saat koneksi buruk
- **Realtime:** Supabase Realtime untuk sinkronisasi multi-device (order updates, mission notifications, presence)

### Alur Request
```
Browser → Vite Dev Server (port 5000)
            ├── /api/* → Express Server (port 3001)
            │              ├── Supabase (DB + Auth + Storage)
            │              ├── OpenRouter API (AI)
            │              └── OpenAI API (AITEM)
            └── Static assets + PWA cache
```

---

## 5. Struktur Role & Akses

### Role Hierarchy

```
owner  (akses penuh semua fitur + manajemen anggota)
  └── staff  (akses operasional, tidak bisa manage member)
  └── agent  (akses terbatas: order sendiri, klien sendiri, dashboard agen)
```

### Matrix Akses Per Fitur

| Fitur | Owner | Staff | Agent |
|-------|:-----:|:-----:|:-----:|
| Dashboard utama | ✅ | - | - |
| Dashboard agen | - | - | ✅ |
| Dashboard staf | - | ✅ | - |
| Manajemen Trip | ✅ | ✅ | ✅ |
| Manajemen Jamaah | ✅ | ✅ | ✅ |
| Semua Order | ✅ | ✅ | hanya milik sendiri |
| Laporan Keuangan | ✅ | terbatas | - |
| Export Center | ✅ | - | - |
| Manajemen Agen | ✅ | - | - |
| Manajemen Staf | ✅ | - | - |
| Kalkulator | ✅ | ✅ | ✅ |
| Harga Tiket (admin) | ✅ | ✅ | view |
| BC Templates | ✅ | ✅ | ✅ |
| Audit Center | ✅ | - | - |
| Settings Agency | ✅ | - | - |
| AITEM Assistant | ✅ | ✅ | ✅ |
| Wallet & Poin | - | terbatas | ✅ |

---

## 6. Modul & Fitur Lengkap

### 6.1 Dashboard Owner (`/`)

**Tujuan:** Ringkasan kondisi bisnis real-time dalam satu layar.

**Widget & Komponen:**
- **Live Clock** — jam saat ini sesuai timezone yang dikonfigurasi
- **Greeting personal** — sapaan berdasarkan waktu (pagi/siang/sore/malam)
- **KPI Cards:** Total trip aktif, total jamaah, total pendapatan, total order
- **Departure Today Alert** — trip yang berangkat hari ini (peringatan urgent)
- **Trip Cards** — daftar trip dengan status, tanggal, jumlah jamaah, dan progress
  - Filter dan sort trip
  - Quick action: tambah trip baru
  - Gradient card berdasarkan ID (visual differentiation)
- **Mitra Leaderboard Card** — top 3 agen berdasarkan order bulan ini
- **CEO Daily Quest** — misi harian untuk owner (engagement feature)
- **PNR Command Center** — manajemen kode booking penerbangan
- **Admin WhatsApp Card** — shortcut kontak admin langsung

**Status Trip:**
- `Draft` → `Confirmed` → `Paid` → `Completed` → `Cancelled`

---

### 6.2 Manajemen Paket & Trip

**Packages (`/packages`):**
- List semua paket umrah/haji/tour yang dibuat agency
- CRUD paket: nama, destinasi, tanggal, harga, kapasitas, akomodasi, transportasi
- Tab: Daftar Paket | Progress Order | Paket Aktif

**Trip Detail (`/trips/:id`, `/paket/:id`):**
- Informasi lengkap trip: tanggal berangkat/pulang, hotel, transportasi, biaya
- **Manajemen Jamaah:**
  - Tambah jamaah baru (manual atau via scan paspor OCR)
  - Edit data jamaah: nama, nomor paspor, TTL, gender, alamat, kontak darurat
  - Upload dokumen jamaah (foto, visa, paspor) ke Supabase Storage
  - Rooming assignment (kamar: double, triple, quad)
  - Status mahram dan kelompok
- **Export Manifest:** Excel manifest jamaah per trip
- **Export Rooming List:** Daftar kamar + penghuni dalam format Excel
- **Status Progres Order** per jamaah

**Jamaah Profile (`/trips/:id/jamaah/:jamaahId`):**
- Profil lengkap jamaah: foto, dokumen, status visa, catatan medis
- Document Vault: upload/view/delete dokumen per jamaah
- History order jamaah

---

### 6.3 Manajemen Order (`/orders`, `/orders/:type`)

**Jenis Order (OrderType):**

| Tipe | Label | Deskripsi |
|------|-------|-----------|
| `umrah` | Umrah & Haji | Paket perjalanan umrah/haji — terhubung ke trip & jamaah |
| `flight` | Tiket Pesawat | Pemesanan tiket, lengkap dengan PNR, rute, jadwal |
| `visa_voa` | Visa VOA | Visa on arrival — termasuk fee agen lapangan |
| `visa_student` | Visa Pelajar | Visa pelajar (contoh: Visa Mesir) |

**Status Order (OrderStatus):**
```
Draft → Confirmed → Paid → Completed
                         ↘ Cancelled
```

**Fitur Order:**
- Buat/edit order dengan metadata lengkap sesuai tipe
- **Flight Order Editor:** Parse teks PNR dari GDS (Galileo/Amadeus) secara otomatis, isi rute, airline, jadwal, harga
- Tracking pembayaran: DP, cicilan, pelunasan
- Link order ke klien (Client) dan agen pembuat
- Assign fee agen lapangan (VOA field agent fee, kurir, pelaksana)
- Progress tracker per order (step-by-step visual)
- Order Bonus & komisi otomatis ke wallet agen saat status Completed
- Audit trail: setiap perubahan order tercatat di audit_logs

---

### 6.4 Manajemen Klien (`/clients`)

- Database klien (calon jamaah/pembeli tiket) per agency
- Data: nama, email, telepon, alamat, catatan
- Riwayat order per klien
- Link klien ke order dan jamaah
- **Client View Dialog:** View cepat dari order detail tanpa navigasi

---

### 6.5 Kalkulator Paket (`/calculator`)

Fitur kalkulasi harga paket yang komprehensif dengan tiga mode:

**Mode Professional Quote:**
- Input komponen biaya:
  - Hotel (nama, bintang, kota, tipe kamar, tarif per kamar/malam)
  - Transportasi (bus, taksi, kereta — per grup)
  - Tiket pesawat (tarif per pax, currency IDR/SAR/USD)
  - Visa (tarif per pax)
  - Destinasi/objek wisata
  - F&B (makan per hari)
  - Staf pendamping (muthawwif, guide, driver)
  - General cost (biaya lain-lain)
- Pax tiers: harga berbeda per jumlah peserta (misal: 10–14 pax vs 15–19 pax)
- Room sharing: single/double/triple/quad
- Markup dan profit margin otomatis
- **Output:** PDF quotation siap kirim ke klien (IGH format)
- Preview PDF real-time di sidebar

**Mode General Quote:**
- Kalkulasi cepat tanpa breakdown rinci
- Input total biaya + markup → harga jual per pax

**Mode Group Matrix:**
- Tabel harga per kombinasi jumlah peserta dan tipe kamar
- Sangat berguna untuk presentasi proposal ke calon klien

**Fitur Tambahan:**
- **Currency Converter Tab:** Konversi real-time IDR ↔ SAR ↔ USD ↔ EUR (via Frankfurter API)
- **Visa Calculator Tab:** Kalkulasi khusus biaya visa dengan fee breakdown
- Live PDF thumbnail preview
- Simpan kalkulasi ke paket (auto-link ke packageCalcStorage)

---

### 6.6 Laporan Keuangan (`/reports`)

**Filter tersedia:**
- Rentang waktu: Bulan ini / Bulan lalu / Tahun ini / Semua waktu
- Per agen: Semua / Direct / per agen spesifik
- Per tipe order: Umrah, Flight, VOA, Visa Pelajar

**Metrik yang ditampilkan:**
- Total Pendapatan (revenue) per filter
- Total Biaya Operasional
- Profit bersih
- Piutang (receivable) yang belum dibayar
- Distribusi tipe order (Pie chart — Recharts)
- Breakdown per agen: komisi, order count, total revenue
- Fee ledger: VOA fee, kurir fee, pelaksana fee, komisi sales

**Status Pembayaran:**
| Status | Keterangan |
|--------|-----------|
| `paid_full` | Lunas |
| `paid_partial` | Bayar sebagian (cicilan) |
| `dp_only` | Baru DP |
| `unpaid` | Belum bayar |
| `overpaid` | Lebih bayar |

**Export:** Laporan dapat di-export ke format yang sesuai.

---

### 6.7 Export Center (`/exports`)

**Export 1 — Manifest Jamaah:**
- Pilih trip → export daftar jamaah lengkap ke Excel (.xlsx)
- Kolom: nama, nomor paspor, TTL, gender, alamat, nomor kursi, rooming

**Export 2 — Rooming List:**
- Pilih trip → export assignment kamar ke Excel
- Format per kamar: kamar number, tipe, penghuni

**Export 3 — Invoice PDF:**
- Pilih order → generate invoice PDF dengan template agency
- Template bisa diupload oleh owner (background image/letterhead)
- Auto-fill: nomor invoice, nama klien, detail order, breakdown harga, tanda tangan

---

### 6.8 Harga Tiket (`/harga-tiket`) — Admin

- CRUD harga tiket pesawat yang dipublikasikan agency
- Data per tiket: airline, kode IATA, rute (from–to), jadwal, harga, mata uang, validitas
- **Scan via AI:** Upload screenshot GDS atau foto tiket → OCR otomatis parsing semua field
- **Multi-leg & Return:** Dukungan rute transit dan pulang-pergi
- Markup configurable di atas base price
- Toggle publish/unpublish per tiket
- Preview halaman publik

---

### 6.9 Broadcast Templates (`/bc-templates`)

Library template pesan pemasaran siap pakai untuk WhatsApp dan media sosial.

**Kategori Template:**
- Umrah (`🕋`)
- Haji (`🌙`)
- Visa on Arrival (`🛂`)
- Visa Pelajar (`🎓`)
- Tiket Pesawat (`✈️`)

**Fitur:**
- CRUD template dengan editor Markdown + preview real-time
- Variable template: `{{nama_klien}}`, `{{tanggal_berangkat}}`, `{{harga}}`, dll.
- One-click copy ke clipboard
- AI Caption Generator: generate variasi caption dari template atau context bebas
- Kategori dan tag untuk filter cepat
- Terintegrasi dengan AI Context untuk personalisasi

---

### 6.10 Itinerary Generator (`/itinerary`)

- Input teks jadwal penerbangan (format GDS atau natural) → AI parsing otomatis
- Input gambar/screenshot jadwal → OCR + AI extraction
- Output:
  - Timeline penerbangan leg-by-leg
  - Durasi transit antar kota
  - Smart tips (customs, lounge, dll)
  - Teks WhatsApp siap kirim (format rapi)
- History 20 itinerary terakhir (localStorage)
- Export/copy hasil

---

### 6.11 Agent Command Center (`/agent-command-center`) — Owner Only

Pusat kontrol owner untuk seluruh ekosistem agen mitra.

**Sub-fitur:**
- **Daftar Agen:** List semua agen, tier, poin, total order, komisi earned
- **Daftar Staf:** List staf, role, tanggal bergabung
- **Performa Agen:** Ranking, order count, revenue per agen
- **Fee Management:** Catat dan track pembayaran fee lapangan (VOA, kurir, pelaksana)
  - Input nomor telepon agen untuk WA langsung
  - Catat status pembayaran fee per order
- **Wallet Monitoring:** View saldo wallet per agen
- **Undang Member:** Invite agen/staf baru via email (Supabase invite flow)
- **Remove Member:** Hapus anggota dari agency

---

### 6.12 Dashboard Agen (`/agent`)

Portal khusus agen mitra dengan informasi yang relevan untuk mereka.

**Konten:**
- Ringkasan: total order, total komisi earned, poin akumulatif
- **Agent Card:** Kartu identitas digital agen (nama, tier, poin, avatar)
- **Tier Progress Bar:** Visual progress Bronze → Silver → Gold → Platinum
- **Order Saya:** Daftar order yang dibuat agen (dengan filter status)
- **Wallet Balance:** Saldo wallet terkini
- **Mission Widget:** Misi aktif yang bisa dikerjakan agen
- **Reward Catalog:** Katalog hadiah yang bisa ditukar dengan poin
- **Notifikasi Misi Baru:** Popup real-time saat ada misi baru

---

### 6.13 Dashboard Staf (`/staff/dashboard`)

Portal staf operasional dengan fokus pada pekerjaan harian.

**Konten:**
- Order yang di-assign ke staf
- Status visa yang perlu diproses
- Fee lapangan yang perlu dikonfirmasi
- Wallet balance staf
- Kartu identitas staf (Staff Card)
- Tanggal bergabung agency

---

### 6.14 Catatan (`/notes`)

Editor catatan internal per agency.
- Rich text notes
- Realtime sync antar device via Supabase
- Digunakan untuk SOP, instruksi trip, info internal

---

### 6.15 Settings (`/settings`)

Pengaturan lengkap untuk owner agency.

**Tab Pengaturan:**

| Tab | Fitur |
|-----|-------|
| **Profil** | Update display name, avatar, bio |
| **Agency** | Nama agency, info kontak, logo, WhatsApp admin |
| **Tampilan** | Theme (light/dark/auto), font size, banner color/preset |
| **Notifikasi** | Toggle notifikasi per kategori (order, payment, sync) |
| **Keamanan** | 2FA PIN, login alert, history login |
| **Anggota** | Manage member, lihat online/offline (Presence) |
| **Regional** | Timezone, bahasa (id/en/ar), format tanggal |
| **Template Invoice** | Upload background invoice, preview |
| **Promo Poster** | Upload dan manage poster promo (tampil di member card publik) |
| **Fee & Komisi** | Setting persentase komisi per produk |
| **Audit Log** | Riwayat perubahan data terkini |
| **Health Check** | Status koneksi Supabase, storage, dan bucket |
| **Migrasi Data** | Tool untuk migrasi gambar dari base64 ke Supabase Storage |
| **Feature Flags** | Aktifkan/nonaktifkan fitur eksperimental |

---

### 6.16 Audit Center (`/audit-center`) — Owner Only

Center monitoring dan debug produksi.

**Fungsi:**
- **Audit Log Real-time:** Semua perubahan data tercatat (create/update/delete per tabel)
- **Rekonsiliasi Wallet:** Deteksi fee yang hilang, duplikat transaksi, assignment yatim piatu
- **Order Health Check:** Deteksi order stale, metadata rusak, step tidak valid
- **Realtime Status Indicator:** Status koneksi WebSocket Supabase
- **Export:** CSV, JSON, copy debug report
- Mode tampilan: Compact / Technical

---

### 6.17 Marketing Kit Generator

Tool pembuatan materi pemasaran untuk agen.

- Generate gambar/flyer paket otomatis
- Template branded dengan logo Temantiket
- Customizable teks (harga, tanggal, destinasi)
- Download langsung atau share via WhatsApp

---

### 6.18 Progress Tracker Jamaah

- Tracker visual step-by-step per jamaah/order
- Step berbeda per tipe order (umrah punya step berbeda dari visa)
- Update status bisa dilakukan owner/staf/agen
- Halaman publik `/cek` memungkinkan klien cek sendiri

---

## 7. Sistem AI & Otomasi

### 7.1 OCR Paspor (Passport Scanner)

**Cara kerja:**
1. Agen/staf foto paspor jamaah
2. Upload ke `PassportScanButton` atau `BulkOcrDialog`
3. Gambar dikirim ke server → OpenRouter (Gemini 2.0 Flash Vision)
4. Model membaca MRZ (Machine Readable Zone) dan data halaman biodata
5. Response: `{ name, passportNumber, birthDate, expiryDate, gender }`
6. Auto-fill form data jamaah

**Bulk OCR:** Upload banyak paspor sekaligus, batch processing.

---

### 7.2 Caption Generator (AI Marketing)

**Cara kerja:**
1. Agen pilih kategori (Umrah/Haji/VOA/dll) dan tone
2. Isi context bebas: nama paket, harga, keunggulan, promo
3. Atau upload foto poster → OCR ekstrak fakta dari poster → generate caption
4. Server kirim ke OpenRouter (GPT-4.1 untuk caption, Gemini untuk OCR poster)
5. Output: caption WhatsApp/Instagram siap posting

**Fitur caption:**
- Regenerate dengan seed berbeda
- Tone: persuasif, informatif, urgent, inspiratif
- Brand name "Temantiket" selalu disertakan
- CTA otomatis di tengah dan akhir caption

---

### 7.3 Itinerary AI

**Cara kerja:**
- Input teks GDS (Galileo/Amadeus format) → AI parsing leg-by-leg
- Input gambar jadwal → Vision OCR → parsing
- Output terstruktur: `{ legs: [{ airline, flightNumber, from, to, dep, arr, duration }] }`
- Auto-hitung transit time, total durasi perjalanan

---

### 7.4 Ticket Price Scanner

- Upload screenshot halaman booking/GDS
- AI extract: airline, rute, harga, tanggal, flight number
- Auto-fill form input harga tiket

---

### 7.5 AITEM — AI Command Center

**AI assistant berbasis OpenAI GPT-4o-mini** yang terintegrasi dengan data kontekstual agency.

**Kemampuan:**
- Menjawab pertanyaan tentang data order, jamaah, keuangan
- Function calling: bisa query data Supabase agency secara langsung
- Context-aware: tahu siapa user yang login, agency mereka, data terkini
- Streaming response (real-time typing effect)
- AI Model Toggle: pilih model yang digunakan

**Akses:**
- Floating `AIChatWidget` tersedia di semua halaman (owner + staff + agent)
- `AIContextualBar`: info kontekstual per halaman
- Dedicated page di Agent Command Center

---

### 7.6 Flight Parser (GDS Auto-parse)

- Parse teks raw GDS Galileo/Amadeus secara lokal (tanpa AI call)
- Extract: PNR, airline code, flight number, rute (IATA), jadwal, kelas
- Digunakan di Flight Order Editor untuk input cepat

---

## 8. Sistem Gamifikasi Agen

### 8.1 Sistem Poin

Setiap agen mengumpulkan poin dari aktivitas:

| Aktivitas | Poin |
|-----------|------|
| Order Completed | 10 poin (default via trigger) |
| Komisi diterima | +20 poin (override via API) |
| Misi disetujui | variabel (sesuai misi) |

Poin tersimpan di tabel `agent_points` dengan log detail per event.

---

### 8.2 Sistem Tier

| Tier | Poin | Perks |
|------|------|-------|
| 🥉 Bronze | 0 – 99 | Komisi standar, akses Marketing Kit dasar, leaderboard bulanan |
| 🥈 Silver | 100 – 499 | Bonus komisi +1%, prioritas balas pesan admin, reward bulanan Silver |
| 🥇 Gold | 500 – 1.499 | Bonus komisi +2%, template promo eksklusif, undangan event tahunan |
| 💎 Platinum | 1.500+ | Bonus komisi +3%, booking umrah gratis tahunan, profil di halaman publik |

Progress bar visual menampilkan poin saat ini dan jarak ke tier berikutnya.

---

### 8.3 Wallet Agen

Sistem dompet digital untuk mencatat komisi dan fee:

**Tipe transaksi wallet:**
| Kode | Deskripsi |
|------|-----------|
| `order_bonus` | Komisi sales dari order yang dibuat agen |
| `voa_agent_fee` | Fee agen lapangan VOA / operasional |
| `pelaksana_fee` | Fee pelaksana visa |
| `kurir_fee` | Fee kurir setoran |
| `mission_reward` | Reward uang tunai dari misi |
| `debit` | Pengurangan saldo |

- Saldo real-time dari ledger transaksi
- Riwayat transaksi lengkap per agen
- Owner dapat credit/debit wallet agen dari Agent Command Center
- Endpoint idempoten: duplikat transaksi ditolak via unique ID

---

### 8.4 Misi Harian (Daily Missions)

Sistem misi berbatas waktu untuk memotivasi agen.

**Alur:**
1. Owner/staf membuat misi baru (judul, deskripsi, deadline, reward poin, reward IDR opsional)
2. Agen melihat misi aktif di Agent Dashboard
3. Agen submit pengerjaan + upload bukti foto
4. Owner/staf review dan approve/reject
5. Poin otomatis dikreditkan ke agen saat approved
6. Notifikasi real-time saat misi baru muncul (Supabase Realtime popup)

---

### 8.5 Leaderboard (`/leaderboard`)

- Ranking agen berdasarkan total poin lifetime
- Halaman publik (tanpa login) — bisa dishare ke calon agen sebagai motivasi
- Tampil: nama, tier badge, total poin, avatar
- Periode: bulanan dan all-time

---

### 8.6 Reward Catalog

Katalog hadiah yang bisa ditukar agen dengan poin:
- Voucher diskon IDR
- Merchandise branded
- Akses fitur premium
- Reward kustom dari owner

---

## 9. Halaman Publik

Halaman-halaman berikut bisa diakses tanpa login:

### 9.1 Cek Booking (`/cek`, `/cek/:code`)
- Input kode booking → tampil status order lengkap
- Informasi: status, tipe, jadwal, breakdown pembayaran (DP, cicilan, pelunasan)
- Progress tracker visual per step

### 9.2 Kartu Anggota Digital (`/m/:slug`)
- Setiap agen punya URL kartu anggota publik unik (`/m/namaagen`)
- Tampil: foto profil, nama, tier badge, total order, poin
- **Stamp Card:** Kartu loyalitas visual (mirip kartu kopi) — milestone reward:
  - 4 stamps: Voucher Rp100.000
  - 8 stamps: Merchandise resmi
  - 12 stamps: Voucher Rp300.000
  - 16 stamps: VIP Grand Reward — City Tour Transit Qatar
- Riwayat order publik (tanpa data sensitif)
- Promo poster aktif dari agency
- Referral: agen bisa share link referral dari kartu ini
- Tombol rekrut agen jika viewer belum jadi agen

### 9.3 Harga Tiket Publik (`/harga-tiket`, `/promo`, `/prices`)
- Daftar tiket yang dipublikasikan agency
- Filter: rute, airline, tanggal
- Detail per tiket: jadwal, rute, harga (dengan markup), info bagasi
- Tombol WhatsApp langsung ke admin untuk pesan

### 9.4 Leaderboard Publik (`/leaderboard`)
- Ranking agen terbuka untuk umum
- Bisa digunakan sebagai alat rekrutmen agen

---

## 10. Infrastruktur & Keamanan

### 10.1 Autentikasi & Otorisasi

- **Auth provider:** Supabase Auth (email + password)
- JWT-based session, auto-refresh token
- Session key: `igh.supabase.auth` (localStorage)
- **RLS (Row Level Security):** Semua tabel Supabase dilindungi policy per `agency_id`
- **Service Role Key:** Hanya digunakan server-side (Express) — tidak pernah terekspos ke browser
- **2FA PIN:** Opsional, dikonfigurasi per user via Settings → Keamanan
- **Login Alert:** Notifikasi jika ada login dari device/waktu baru
- **Login History:** Riwayat 10 login terakhir tersimpan di localStorage

### 10.2 Pengelolaan Secret

| Secret | Letak | Digunakan Oleh |
|--------|-------|---------------|
| `VITE_SUPABASE_URL` | Env (shared) | Frontend + Backend |
| `VITE_SUPABASE_ANON_KEY` | Secret | Frontend (via Vite define) + Backend |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Backend only (server-side) |
| `OPENROUTER_API_KEY` | Secret | Backend only (AI/OCR calls) |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Replit AI Integration | Backend only (AITEM) |

### 10.3 File Storage

Supabase Storage Buckets:

| Bucket | Akses | Konten |
|--------|-------|--------|
| `jamaah-photos` | Public | Foto jamaah |
| `jamaah-docs` | Public | Dokumen jamaah (paspor, visa) |
| `card-backs` | Public | Gambar belakang kartu anggota |
| `pdf-templates` | Public | Template invoice PDF |
| `card-back-images` | Public | Gambar kartu identitas digital |

Upload foto/dokumen dilakukan melalui server (tidak langsung dari browser ke Storage tanpa auth).

### 10.4 Realtime & Sync

- **Supabase Realtime:** WebSocket untuk live updates order, misi baru, presence
- **Cloud Sync:** Data kritis (rater, settings) di-pull dari Supabase saat startup dan sinkron berkala
- **Sync Status Badge:** Indikator visual di UI apakah data lokal sudah sinkron dengan server
- **Offline-first:** Cache WorkBox memungkinkan baca data saat offline; write akan di-retry saat online

### 10.5 Multi-bahasa (i18n)

Mendukung tiga bahasa:
- 🇮🇩 Bahasa Indonesia (default)
- 🇬🇧 English
- 🇸🇦 العربية (Arabic — dengan RTL layout)

Konfigurasi per agency, bisa diubah di Settings → Regional.

### 10.6 PWA (Progressive Web App)

- Install di Home Screen (Android & iOS)
- Splash screen + icon branded
- Offline support via Service Worker
- Auto-update saat ada versi baru
- Push notification siap (infrastruktur tersedia, implementasi per kebutuhan)

---

## 11. Model Data

### Tabel Utama Supabase

| Tabel | Deskripsi |
|-------|-----------|
| `agencies` | Data biro perjalanan (tenant) |
| `agency_members` | Anggota per agency (owner/staff/agent) + metadata kartu |
| `trips` | Trip perjalanan per agency |
| `jamaah` | Data jamaah per trip |
| `jamaah_docs` | Dokumen jamaah (multi per jamaah) |
| `packages` | Paket perjalanan yang dijual |
| `package_calculations` | Snapshot kalkulasi kalkulator per paket |
| `orders` | Order layanan (umrah/flight/visa) |
| `clients` | Data klien/pemesan |
| `notes` | Catatan internal agency |
| `pdf_layout_presets` | Preset layout PDF export |
| `pdf_templates` | Template invoice yang diupload |
| `audit_logs` | Log semua perubahan data |
| `profiles` | Profil publik user (avatar, bio) |
| `agent_points` | Log poin gamifikasi per agen |
| `reward_redemptions` | Penukaran reward oleh agen |
| `bc_templates` | Template broadcast/marketing |
| `ticket_prices` | Harga tiket yang dipublikasikan |

### Relasi Utama

```
agencies
  └── agency_members (user_id → auth.users)
  └── trips
        └── jamaah
              └── jamaah_docs
  └── packages
        └── package_calculations
  └── orders
        └── (linked to clients, trips, jamaah)
  └── clients
  └── agent_points (agent_id → agency_members.user_id)
  └── bc_templates
  └── ticket_prices
  └── audit_logs
```

---

## 12. Integrasi Eksternal

| Layanan | Kegunaan | Cara Integrasi |
|---------|----------|----------------|
| **Supabase** | Database, Auth, Storage, Realtime | SDK `@supabase/supabase-js`, service-role via server |
| **OpenRouter** | OCR Paspor, Caption Generator, Itinerary AI | REST API via Express server |
| **OpenAI** | AITEM assistant (GPT-4o-mini) | REST API via Replit AI Integration |
| **Frankfurter** | Exchange rates real-time (IDR/SAR/USD/EUR) | Proxy via Vite `/api/frankfurter` |
| **WhatsApp** | Deep link ke chat admin | `wa.me/` URL konstruksi lokal |

---

## 13. Non-Functional Requirements

### 13.1 Performa
- First Contentful Paint (FCP) < 2 detik pada koneksi 4G
- Time to Interactive (TTI) < 4 detik
- API response < 500ms untuk operasi DB standar
- AI OCR response < 10 detik per gambar
- Optimisasi bundle: code splitting per route, lazy load berat (xlsx, pdf-lib, tesseract)

### 13.2 Ketersediaan
- Target uptime: 99.5%
- Offline read: tersedia via Service Worker cache
- Graceful degradation: UI tetap bisa dipakai tanpa koneksi (baca data cache)
- Health check endpoint: `GET /api/health-check` memonitor DB + Storage

### 13.3 Skalabilitas
- Multi-tenant by design: satu deployment untuk semua agency
- RLS Supabase memastikan isolasi data antar tenant
- Autoscale deployment via Replit

### 13.4 Keamanan
- Tidak ada secret/API key di frontend bundle
- Semua operasi admin via server (Express) dengan validasi JWT
- Rate limiting per endpoint sensitif
- Input sanitasi di semua form
- XSS protection via React rendering
- CORS terkontrol di Express

### 13.5 Aksesibilitas
- Responsive: mobile-first, optimal di layar 360px–1440px
- Touch-friendly: tap targets minimal 44×44px
- PWA installable di iOS & Android
- Dukungan RTL untuk bahasa Arab

---

## 14. Roadmap & Prioritas

### Sudah Live (Production)
- ✅ Manajemen Trip, Jamaah, Order, Klien
- ✅ Kalkulator paket profesional + PDF quotation
- ✅ OCR Paspor via AI
- ✅ Caption Generator AI
- ✅ Sistem gamifikasi agen (poin, tier, wallet, misi, leaderboard)
- ✅ Dashboard owner, staf, agen
- ✅ Laporan keuangan dengan filter
- ✅ Export Center (manifest, rooming list, invoice)
- ✅ Halaman publik (cek booking, kartu anggota, harga tiket)
- ✅ Broadcast Templates
- ✅ Itinerary Generator AI
- ✅ Ticket Price Scanner AI
- ✅ AITEM assistant (OpenAI GPT-4o-mini)
- ✅ Audit Center
- ✅ Cloud sync + Realtime
- ✅ PWA (installable)
- ✅ Multi-bahasa (id/en/ar)

### Kandidat Pengembangan Berikutnya

| Prioritas | Fitur | Alasan |
|-----------|-------|--------|
| Tinggi | Push Notification real-time | Infrastruktur SW sudah ada, tinggal server-side push |
| Tinggi | Pembayaran online terintegrasi | Mengurangi kebutuhan konfirmasi manual |
| Sedang | Aplikasi mobile native (Expo) | Pengalaman lebih baik dari PWA untuk agen lapangan |
| Sedang | Template WhatsApp Business API | Otomasi pengiriman update ke klien |
| Sedang | E-signature dokumen | Proses dokumen perjalanan lebih cepat |
| Rendah | Integrasi GDS langsung (Amadeus/Galileo) | Auto-import tiket tanpa input manual |
| Rendah | CRM pipeline sales | Track prospek dari kontak → booking |
| Rendah | Laporan pajak otomatis | Compliance bisnis |

---

*Dokumen ini dibuat berdasarkan analisis menyeluruh codebase Temantiket versi produksi.*  
*Terakhir diperbarui: Mei 2025*
