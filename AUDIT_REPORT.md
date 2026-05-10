# Laporan Audit Komprehensif — Temantiket

**Tanggal Audit:** 10 Mei 2026  
**Auditor:** AI Full-Stack Engineer  
**Scope:** Frontend, Backend, Supabase/DB, API, UI/UX, Mobile, RBAC, Business Logic  
**Status:** Semua perbaikan telah diimplementasi dan build sukses ✓

---

## Ringkasan Eksekutif

Audit ini mencakup pemeriksaan menyeluruh seluruh codebase Temantiket — dari server Express.js, seluruh halaman React (30+ halaman), komponen shared, store Zustand, repository Supabase, sistem wallet agen, laporan keuangan, gamifikasi misi, hingga alur order lengkap. Ditemukan **1 bug kritis** (keamanan data), **8 bug skala tampilan**, dan beberapa observasi arsitektur. Semua telah diperbaiki.

---

## I. BUG KRITIS — RLS Bypass di Wallet Agen

### Deskripsi
**File:** `src/components/AgentWalletCard.tsx` + `src/lib/agentWallet.ts`

Fungsi `recordPayout()` dan `convertMissionPoints()` menggunakan **anon Supabase client** secara langsung untuk insert ke tabel `agent_wallet_transactions`. Ketika seorang **owner** mencatat pencairan komisi atau mengkonversi poin misi untuk wallet **agen lain** (bukan dirinya sendiri), operasi ini GAGAL tanpa notifikasi yang jelas karena:

- RLS Supabase memblokir insert di mana `agent_id ≠ auth.uid()`  
- Data tersimpan di localStorage lokal tapi **tidak pernah masuk ke cloud**
- Owner tidak menerima pesan error, hanya log warning di console
- Saldo wallet agen di-refresh dari localStorage (terlihat benar di satu device) tapi saat dibuka dari device lain atau setelah clear cache, data hilang

### Bukti Teknis
```
// agentWallet.ts — versi lama (BERMASALAH)
export function recordPayout(...): WalletTransaction {
  return addWalletTx(agentId, { ... }); // ← anon client, gagal di RLS cross-user
}

// server/index.cjs — role guard sudah benar
if (membership.role === 'agent' && agentId !== caller.id) {
  return err(res, 403, 'Agen hanya bisa mengkreditkan wallet sendiri');
}
// Owner/staff dapat kredit wallet siapapun melalui service-role key ✓
```

### Perbaikan
- Ditambahkan `convertMissionPointsAsync()` dan `recordPayoutAsync()` di `agentWallet.ts` yang route ke `/api/credit-wallet-tx` (service role key — melewati RLS)
- `AgentWalletCard.tsx` diperbarui untuk menggunakan versi async beserta feedback toast jika sinkronisasi cloud gagal
- Setelah operasi berhasil, data langsung di-pull ulang dari Supabase (`pullWalletTxs`) bukan dari cache lokal

---

## II. BUG SKALA TAMPILAN DESKTOP — Container Width

### Deskripsi
9 halaman masih menggunakan container sempit (`max-w-3xl` s/d `max-w-7xl`) yang menyebabkan tampilan desktop terlihat terpotong dan ruang kosong besar di sisi kanan/kiri layar. Konsistensi visual terganggu dibanding halaman lain yang sudah diperbarui ke `max-w-[1400px]`.

### Halaman yang Diperbaiki

| Halaman | Sebelum | Sesudah |
|---------|---------|---------|
| `Reports.tsx` (Laporan Keuangan) | `max-w-6xl` | `max-w-[1400px]` |
| `Calculator.tsx` (Kalkulator Profesional) | `max-w-5xl` | `max-w-[1400px]` |
| `PackageDetail.tsx` (Detail Paket) | `max-w-5xl` | `max-w-[1400px]` |
| `AgentDashboard.tsx` (Dashboard Agen) | `max-w-6xl` | `max-w-[1400px]` |
| `AgentProfileOwnerView.tsx` (Profil Agen — Owner) | `max-w-3xl` | `max-w-[1400px]` |
| `AgentCommandCenter.tsx` (Manajemen Agen) | `max-w-7xl` | `max-w-[1400px]` |
| `JamaahProfile.tsx` (Profil Jamaah) | `max-w-4xl` | `max-w-[1400px]` |
| `ProgressTracker.tsx` (Progress Tracker) | `max-w-3xl` | `max-w-[1400px]` |

---

## III. AUDIT BACKEND — server/index.cjs

### ✅ Hal Yang Baik
- Semua endpoint terproteksi dengan `getCallerUser()` + JWT validation
- Service role key hanya digunakan di server (tidak pernah expose ke client)
- Role guard di `/api/credit-wallet-tx`: agent hanya bisa kredit wallet sendiri
- `/api/bootstrap-agency` dibatasi dengan `BOOTSTRAP_SECRET` env var
- Semua endpoint menggunakan `withTimeout()` untuk mencegah hang request
- Error messages informatif dengan `classifySupabaseError()` helper
- Health check endpoint `/api/health` aktif dan mengembalikan status semua dependency

### ⚠️ Observasi (Tidak Diubah)
- `/api/backfill-field-fees` tidak ada rate limiting — potensi abuse jika endpoint public, tapi sudah diamankan dengan JWT + member check
- Response timeout beberapa endpoint (12 detik) mungkin terlalu panjang untuk UX — bisa dikurangi ke 8 detik

---

## IV. AUDIT KALKULASI KEUANGAN

### ✅ Single Source of Truth Terkonfirmasi
`src/lib/profit.ts` adalah satu-satunya sumber perhitungan:

```
netProfitIDR = gross - agentFee - pelaksanaFee - voaOpCost - kurirOpCost
```

- `agentFeeFromMeta(order)`: hanya dipotong jika `createdByAgent` mengarah ke member berole `"agent"` — validasi ganda di Reports.tsx baris 159
- `voaOpCost`: mencakup `voaAgentFee + voaTransportFee + voaOtherFee` — biaya lapangan VOA dikreditkan ke wallet agen lapangan secara terpisah
- `pelaksanaFeeFromMeta`: hanya aktif untuk `visa_student` dengan `pelaksanaId` di metadata
- Tidak ada double-counting yang ditemukan

### ✅ Idempotency Wallet Terkonfirmasi
Semua wallet credit di `OrderDetail.tsx` menggunakan idempotency key `agent-${order.id}` — safe to retry tanpa duplikasi

### ⚠️ Inkonsistensi Semantik (Bukan Bug, Keputusan Desain)
- **Summary tab** (Reports) filter berdasarkan `o.createdAt` (tanggal order dibuat)
- **Ledger tab** menampilkan kolom `paidAt` (tanggal pembayaran dari metadata)

Untuk laporan keuangan yang lebih akurat secara akuntansi, sebaiknya Summary tab juga bisa filter berdasarkan `paidAt`. Namun karena `paidAt` adalah field derived (dari `meta.paidAt ?? o.updatedAt ?? o.createdAt`), perubahan ini berisiko untuk order lama tanpa `paidAt` di metadata. **Rekomendasi:** Tambahkan toggle "Filter berdasarkan: Tanggal Buat / Tanggal Bayar" di Reports di iterasi berikutnya.

---

## V. AUDIT SISTEM WALLET & GAMIFIKASI

### ✅ Arsitektur Wallet (Setelah Perbaikan)
```
Owner klik "Konversi Poin"/"Catat Pencairan"
  → AgentWalletCard (React)
  → convertMissionPointsAsync / recordPayoutAsync  [DIPERBAIKI]
  → /api/credit-wallet-tx (Express, service role)
  → Supabase agent_wallet_transactions (upsert, idempotent via ID)
  → pullWalletTxs() → UI refresh dari server
```

### ✅ Poin & Misi
- Poin di-upsert (idempotent) via `/api/award-completion-points`
- `reviewSubmission` → poin dihitung hanya untuk submission "approved"
- Leaderboard di Reports menggabungkan profit agency + lifetime points dengan benar
- VOA field agent fee ditambahkan ke leaderboard commission secara terpisah dari komisi penjualan

### ✅ Tier System
- Tier dihitung dari total poin lifetime (bukan poin aktif)
- Progress bar dan tier perks ditampilkan di profil agen

---

## VI. AUDIT RBAC (Role-Based Access Control)

### ✅ Role Validation Terkonfirmasi
| Aksi | Owner | Staff | Agent |
|------|-------|-------|-------|
| Lihat semua order | ✓ | ✓ | Hanya order sendiri |
| Edit order | ✓ | ✓ | ✗ |
| Kredit wallet agen lain | ✓ (server) | ✓ (server) | ✗ (blocked) |
| Invite/remove member | ✓ (server) | ✗ | ✗ |
| Laporan keuangan | ✓ | ✓ | ✗ (hanya overview) |
| Bootstrap agency | ✓ (BOOTSTRAP_SECRET) | ✗ | ✗ |

### ✅ RLS Supabase
- Helper functions `is_member()`, `is_owner()`, `is_agent()` digunakan konsisten
- Service role hanya diekspose di server Express, tidak pernah ke client
- Cross-tenant isolation terkonfirmasi di endpoint wallet, bootstrap, invite

---

## VII. AUDIT ALUR ORDER

### ✅ Order State Machine
```
Draft → Calculated → Confirmed → Paid → Completed → [Cancelled bisa dari mana saja]
```

- Agent fee hanya dikreditkan saat status → `Completed` (bukan Paid)
- Flag `agentFeeCredited`, `pelaksanaFeeCredited`, `voaFieldFeeCredited`, `kurirFeeCredited` mencegah double-credit
- Idempotency key per-order di wallet memastikan retry safe
- `fromRow/toRow` mapping di ordersRepo terkonfirmasi benar untuk semua field

### ✅ VOA Order
- `voaFieldAgentId` dikreditkan dengan `voa_agent_fee` wallet type
- `voaOpCost` dikurangkan dari profit agency (voaAgentFee + transport + other)
- Field agent berbeda dari sales agent — masing-masing punya alur pembayaran terpisah

---

## VIII. AUDIT UI/UX & MOBILE RESPONSIVENESS

### ✅ Sudah Baik
- Splash screen / login screen dengan transisi yang halus
- Dark/light mode support via CSS variables
- Touch targets memadai (h-8/h-9 minimum)
- Loading states dan error states ada di semua form utama
- Framer Motion animations tidak mengganggu perf (lazy loading)
- PWA service worker aktif

### ⚠️ Catatan Mobile
- AgentProfileOwnerView sekarang `max-w-[1400px]` — di mobile tetap bekerja karena tidak ada `min-w` yang membatasi
- Beberapa tabel di Reports.tsx memiliki horizontal scroll yang perlu gesture di mobile — sudah ada `overflow-x-auto`

---

## IX. AUDIT SUPABASE & DATABASE

### ✅ Observasi
- Schema di `supabase/schema.sql` adalah canonical — tidak dimodifikasi
- RLS policies menggunakan security-definer helpers
- Realtime subscriptions aktif untuk orders dan trips
- Storage buckets untuk foto agen/kartu sudah ada dengan signed URL flow

### ⚠️ Catatan Skema
- `agent_wallet_transactions` memiliki CHECK constraint pada kolom `type` — semua 8 tipe wallet sudah terdaftar: `mission_conversion`, `mission_fee`, `order_bonus`, `pelaksana_fee`, `voa_agent_fee`, `kurir_fee`, `payout`, `adjustment`

---

## X. RINGKASAN SEMUA PERUBAHAN KODE

| File | Jenis Perubahan | Alasan |
|------|----------------|--------|
| `src/lib/agentWallet.ts` | Tambah `convertMissionPointsAsync()` + `recordPayoutAsync()` | Fix RLS bug — gunakan server endpoint |
| `src/components/AgentWalletCard.tsx` | Gunakan async functions + `pullWalletTxs` setelah operasi | Fix RLS bug + UI sync akurat |
| `src/pages/Reports.tsx` | `max-w-6xl` → `max-w-[1400px]` | Desktop scaling |
| `src/pages/Calculator.tsx` | `max-w-5xl` → `max-w-[1400px]` | Desktop scaling |
| `src/pages/PackageDetail.tsx` | `max-w-5xl` → `max-w-[1400px]` | Desktop scaling |
| `src/pages/AgentDashboard.tsx` | `max-w-6xl` → `max-w-[1400px]` | Desktop scaling |
| `src/pages/AgentProfileOwnerView.tsx` | `max-w-3xl` → `max-w-[1400px]` | Desktop scaling |
| `src/pages/AgentCommandCenter.tsx` | `max-w-7xl` → `max-w-[1400px]` | Desktop scaling |
| `src/pages/JamaahProfile.tsx` | `max-w-4xl` → `max-w-[1400px]` | Desktop scaling |
| `src/pages/ProgressTracker.tsx` | `max-w-3xl` → `max-w-[1400px]` | Desktop scaling |

**Total file diubah: 10**  
**Build status: ✓ Sukses (TypeScript 0 error)**

---

## XI. REKOMENDASI ITERASI BERIKUTNYA

1. **Dual Date Filter di Reports** — Tambahkan toggle "Filter berdasarkan: Tanggal Dibuat / Tanggal Dibayar" untuk laporan keuangan yang lebih akurat secara akuntansi
2. **Rate Limiting Server** — Tambahkan `express-rate-limit` pada endpoint publik dan endpoint yang membutuhkan service role key
3. **Bundle Size** — Index JS 6.4 MB (1.75 MB gzip) terlalu besar. Tambahkan code splitting via dynamic `import()` untuk halaman-halaman berat (Calculator, Reports, AgentCommandCenter)
4. **PWA Precache** — Konfigurasi `workbox.maximumFileSizeToCacheInBytes` atau exclude `index-*.js` dari precache manifest
5. **Error Boundary** — Tambahkan React Error Boundary di route-level untuk mencegah white screen saat komponen crash

---

*Laporan ini dibuat berdasarkan audit statis penuh codebase + analisis runtime flow. Semua bug yang ditemukan telah diperbaiki pada sesi ini.*
