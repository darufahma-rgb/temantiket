import { useState } from "react";
import { CheckCircle2, XCircle, Loader2, FlaskConical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { createPackage } from "@/features/packages/packagesRepo";
import { createTrip, createJamaah } from "@/features/trips/tripsRepo";
import { createClient } from "@/features/clients/clientsRepo";
import { createOrder } from "@/features/orders/ordersRepo";
import { createTemplate as createBCTemplate } from "@/features/bcTemplates/bcTemplatesRepo";
import { createMission } from "@/features/missions/missionsRepo";
import { useAuthStore } from "@/store/authStore";

type Status = "idle" | "loading" | "ok" | "error";

interface SeedItem {
  key: string;
  label: string;
  emoji: string;
  description: string;
  status: Status;
  error?: string;
}

const INITIAL_ITEMS: SeedItem[] = [
  { key: "package",     label: "Paket Umrah",          emoji: "📦", description: "1 paket umrah reguler",         status: "idle" },
  { key: "trip",        label: "Trip + Jamaah",         emoji: "✈️", description: "1 trip + 1 jamaah manifest",   status: "idle" },
  { key: "client",      label: "Klien",                 emoji: "👤", description: "1 data klien baru",            status: "idle" },
  { key: "order_umrah", label: "Order Umrah",           emoji: "🕋", description: "1 order paket umrah",          status: "idle" },
  { key: "order_flight",label: "Order Tiket Pesawat",   emoji: "🛫", description: "1 order tiket pesawat",        status: "idle" },
  { key: "order_voa",   label: "Order Visa VOA",        emoji: "🛂", description: "1 order visa on arrival",      status: "idle" },
  { key: "order_study", label: "Order Visa Pelajar",    emoji: "🎓", description: "1 order visa pelajar",         status: "idle" },
  { key: "bc_template", label: "Template BC WhatsApp",  emoji: "💬", description: "1 template broadcast WA",      status: "idle" },
  { key: "mission",     label: "Misi Harian Agen",      emoji: "🎯", description: "1 misi untuk agen",            status: "idle" },
  { key: "note",        label: "Catatan",               emoji: "📝", description: "1 catatan (Notes)",            status: "idle" },
];

function StatusIcon({ status }: { status: Status }) {
  if (status === "loading") return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
  if (status === "ok")      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (status === "error")   return <XCircle className="w-4 h-4 text-red-500" />;
  return <div className="w-4 h-4 rounded-full border-2 border-slate-300" />;
}

function seedNote() {
  const STORAGE_KEY = "travelhub.notes.v2";
  const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  const alreadyExists = existing.some((n: { title?: string }) => n.title === "🗒️ Demo — Catatan Pertama");
  if (alreadyExists) return;
  const demoNote = {
    id: `note-demo-${Date.now()}`,
    title: "🗒️ Demo — Catatan Pertama",
    content: "Ini adalah catatan demo untuk memverifikasi fitur Notes berjalan dengan baik.\n\n• Klien: Pak Ahmad Fauzi\n• Status: Proses dokumen paspor\n• Follow-up: Hubungi H-7 keberangkatan",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    color: "bg-sky-50 border-sky-200",
    pinned: true,
    tags: ["demo", "follow-up"],
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify([demoNote, ...existing]));
}

export default function DemoSeed() {
  const [items, setItems] = useState<SeedItem[]>(INITIAL_ITEMS);
  const [running, setRunning] = useState(false);
  const user = useAuthStore((s) => s.user);
  const agencyId = user?.agencyId ?? "";
  const userId = user?.id ?? "";

  function setStatus(key: string, status: Status, error?: string) {
    setItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, status, error } : it)),
    );
  }

  function resetAll() {
    setItems(INITIAL_ITEMS.map((it) => ({ ...it, status: "idle", error: undefined })));
  }

  async function runSeed() {
    if (!agencyId) {
      toast.error("Kamu harus login terlebih dahulu untuk menyemai data demo.");
      return;
    }
    setRunning(true);
    resetAll();

    // ── 1. Paket Umrah ────────────────────────────────────────────────────────
    let packageId = "";
    try {
      setStatus("package", "loading");
      const pkg = await createPackage({
        name: "Demo — Umrah Reguler Desember",
        destination: "Makkah & Madinah",
        people: 30,
        days: 12,
        hpp: 22_500_000,
        totalIDR: 26_000_000,
        status: "Confirmed",
        emoji: "🕋",
        departureDate: "2026-12-10",
        returnDate: "2026-12-22",
        airline: "Saudi Arabian Airlines",
        hotelLevel: "Bintang 4",
        notes: "Data demo — paket reguler akhir tahun",
        facilities: ["Hotel Bintang 4", "Makan 3x", "Manasik 2x", "Tour Leader"],
      });
      packageId = pkg.id;
      setStatus("package", "ok");
    } catch (e) {
      setStatus("package", "error", String(e));
    }

    // ── 2. Trip + Jamaah ──────────────────────────────────────────────────────
    let tripId = "";
    try {
      setStatus("trip", "loading");
      const trip = await createTrip({
        name: "Demo — Paket Trip Umrah Jan 2027",
        destination: "Makkah & Madinah",
        startDate: "2027-01-15",
        endDate: "2027-01-27",
        emoji: "✈️",
        quotaPax: 40,
        pricePerPax: 26_000_000,
      });
      tripId = trip.id;
      await createJamaah({
        tripId,
        name: "Ahmad Fauzi",
        phone: "081234567890",
        birthDate: "1980-06-15",
        passportNumber: "B1234567",
        passportExpiry: "2030-06-15",
        gender: "L",
        paymentStatus: "DP",
        bookingCode: "TMT-DEMO1",
      });
      setStatus("trip", "ok");
    } catch (e) {
      setStatus("trip", "error", String(e));
    }

    // ── 3. Klien ──────────────────────────────────────────────────────────────
    let clientId = "";
    try {
      setStatus("client", "loading");
      const client = await createClient({
        name: "Siti Rahmawati",
        phone: "08567891234",
        email: "siti.demo@temantiket.co.id",
        birthDate: "1992-03-20",
        passportNumber: "C9876543",
        passportExpiry: "2029-03-20",
        gender: "P",
        notes: "Klien demo — minat umrah plus Turki",
      });
      clientId = client.id;
      setStatus("client", "ok");
    } catch (e) {
      setStatus("client", "error", String(e));
    }

    // ── 4. Order Umrah ────────────────────────────────────────────────────────
    try {
      setStatus("order_umrah", "loading");
      await createOrder({
        clientId: clientId || null,
        type: "umrah",
        status: "Confirmed",
        title: "Demo — Umrah Reguler Desember 2026",
        totalPrice: 26_000_000,
        costPrice: 22_500_000,
        currency: "IDR",
        metadata: { packageName: "Umrah Reguler Desember", pax: 1 },
        tripId: tripId || null,
        packageId: packageId || null,
        jamaahId: null,
        notes: "Data demo order umrah",
      });
      setStatus("order_umrah", "ok");
    } catch (e) {
      setStatus("order_umrah", "error", String(e));
    }

    // ── 5. Order Tiket Pesawat ────────────────────────────────────────────────
    try {
      setStatus("order_flight", "loading");
      await createOrder({
        clientId: clientId || null,
        type: "flight",
        status: "Paid",
        title: "Demo — CGK → MED QR4982",
        totalPrice: 4_850_000,
        costPrice: 4_200_000,
        currency: "IDR",
        metadata: {
          legs: [{
            airline: "Qatar Airways",
            flightNumber: "QR4982",
            fromCode: "CGK", fromCity: "Jakarta",
            toCode: "MED", toCity: "Madinah",
            departDate: "2026-12-10",
            departTime: "23:45",
            arriveDate: "2026-12-11",
            arriveTime: "06:30",
          }],
          pnr: "DEMOQR",
        },
        tripId: null,
        packageId: null,
        jamaahId: null,
        notes: "Data demo tiket pesawat Jakarta → Madinah",
      });
      setStatus("order_flight", "ok");
    } catch (e) {
      setStatus("order_flight", "error", String(e));
    }

    // ── 6. Order Visa VOA ─────────────────────────────────────────────────────
    try {
      setStatus("order_voa", "loading");
      await createOrder({
        clientId: clientId || null,
        type: "visa_voa",
        status: "Confirmed",
        title: "Demo — Visa on Arrival Thailand",
        totalPrice: 550_000,
        costPrice: 400_000,
        currency: "IDR",
        metadata: { country: "Thailand", duration: "30 hari" },
        tripId: null,
        packageId: null,
        jamaahId: null,
        notes: "Data demo visa on arrival Thailand",
      });
      setStatus("order_voa", "ok");
    } catch (e) {
      setStatus("order_voa", "error", String(e));
    }

    // ── 7. Order Visa Pelajar ─────────────────────────────────────────────────
    try {
      setStatus("order_study", "loading");
      await createOrder({
        clientId: clientId || null,
        type: "visa_student",
        status: "Draft",
        title: "Demo — Visa Pelajar Mesir (Cairo University)",
        totalPrice: 1_200_000,
        costPrice: 900_000,
        currency: "IDR",
        metadata: { country: "Mesir", institution: "Cairo University", duration: "1 tahun" },
        tripId: null,
        packageId: null,
        jamaahId: null,
        notes: "Data demo visa pelajar Mesir",
      });
      setStatus("order_study", "ok");
    } catch (e) {
      setStatus("order_study", "error", String(e));
    }

    // ── 8. Template BC WhatsApp ───────────────────────────────────────────────
    try {
      setStatus("bc_template", "loading");
      await createBCTemplate({
        title: "Demo — Konfirmasi Keberangkatan Umrah",
        category: "umrah",
        body: "Assalamu'alaikum Bapak/Ibu {{NAMA_KLIEN}} 🕋\n\nKami dari *Temantiket* ingin menginformasikan bahwa keberangkatan umrah Anda telah *DIKONFIRMASI*.\n\n✅ Nama: {{NAMA_KLIEN}}\n✅ Kode Booking: {{KODE_BOOKING}}\n✅ Tanggal Berangkat: {{TGL_BERANGKAT}}\n✅ Maskapai: {{MASKAPAI}}\n\nSilakan siapkan dokumen paspor & visa Anda. Kami akan hubungi kembali H-7 keberangkatan.\n\nJazakumullah khairan 🤲",
        sortOrder: 1,
      });
      setStatus("bc_template", "ok");
    } catch (e) {
      setStatus("bc_template", "error", String(e));
    }

    // ── 9. Misi Harian Agen ───────────────────────────────────────────────────
    try {
      setStatus("mission", "loading");
      if (agencyId && userId) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(23, 59, 59, 0);
        await createMission(
          agencyId,
          {
            title: "Demo — Share konten Umrah ke Story Instagram",
            description: "Upload 1 story Instagram dengan template marketing Temantiket, tag @temantiket, dan screenshot sebagai bukti.",
            rewardPoints: 50,
            deadline: tomorrow.toISOString(),
          },
          userId,
        );
      }
      setStatus("mission", "ok");
    } catch (e) {
      setStatus("mission", "error", String(e));
    }

    // ── 10. Catatan (localStorage) ────────────────────────────────────────────
    try {
      setStatus("note", "loading");
      await new Promise((r) => setTimeout(r, 100));
      seedNote();
      setStatus("note", "ok");
    } catch (e) {
      setStatus("note", "error", String(e));
    }

    setRunning(false);
    const hasError = items.some((it) => it.status === "error");
    if (!hasError) {
      toast.success("Semua data demo berhasil ditambahkan! 🎉", {
        description: "Refresh halaman masing-masing untuk melihat datanya.",
      });
    } else {
      toast.warning("Sebagian data demo gagal dimasukkan — cek detail di bawah.");
    }
  }

  const doneCount = items.filter((it) => it.status === "ok").length;
  const errorCount = items.filter((it) => it.status === "error").length;
  const allDone = !running && doneCount > 0;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-violet-100 dark:bg-violet-900/30">
          <FlaskConical className="w-6 h-6 text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Demo Data Seeder</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Tambah 1 data dummy per fitur untuk pengujian tampilan
          </p>
        </div>
      </div>

      <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800">
        <CardContent className="pt-4 pb-3">
          <p className="text-sm text-amber-800 dark:text-amber-300">
            ⚠️ <strong>Hanya untuk testing.</strong> Data yang dimasukkan tersimpan di Supabase dengan akun agency kamu saat ini (<code className="font-mono text-xs bg-amber-100 dark:bg-amber-900/30 px-1 rounded">{agencyId || "belum login"}</code>). Hapus manual kalau sudah tidak diperlukan.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Daftar Data Demo</CardTitle>
              <CardDescription>
                {running
                  ? "Sedang memasukkan data…"
                  : allDone
                  ? `${doneCount} berhasil${errorCount > 0 ? `, ${errorCount} gagal` : " semua"}`
                  : "Klik tombol untuk mulai"}
              </CardDescription>
            </div>
            {allDone && (
              <Badge
                variant="outline"
                className={
                  errorCount === 0
                    ? "border-green-300 text-green-700 bg-green-50"
                    : "border-amber-300 text-amber-700 bg-amber-50"
                }
              >
                {errorCount === 0 ? "✅ Semua Berhasil" : `⚠️ ${errorCount} Gagal`}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.map((item) => (
            <div
              key={item.key}
              className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40"
            >
              <StatusIcon status={item.status} />
              <span className="text-lg">{item.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{item.label}</p>
                <p className="text-xs text-slate-400 truncate">
                  {item.error ? (
                    <span className="text-red-500">{item.error}</span>
                  ) : (
                    item.description
                  )}
                </p>
              </div>
              {item.status === "ok" && (
                <Badge variant="outline" className="text-[10px] border-green-200 text-green-700 bg-green-50 shrink-0">
                  Selesai
                </Badge>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button
          className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
          size="lg"
          disabled={running}
          onClick={runSeed}
        >
          {running ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Menyemai Data…
            </>
          ) : (
            <>
              <FlaskConical className="w-4 h-4 mr-2" />
              {allDone ? "Jalankan Ulang" : "Masukkan Semua Data Demo"}
            </>
          )}
        </Button>
        {allDone && (
          <Button variant="outline" size="lg" onClick={resetAll} disabled={running}>
            <Trash2 className="w-4 h-4 mr-1" />
            Reset
          </Button>
        )}
      </div>

      {allDone && errorCount === 0 && (
        <Card className="border-green-200 bg-green-50 dark:bg-green-900/10 dark:border-green-800">
          <CardContent className="pt-4 pb-3 space-y-1">
            <p className="text-sm font-semibold text-green-800 dark:text-green-300">✅ Semua berhasil! Cek di halaman ini:</p>
            <ul className="text-sm text-green-700 dark:text-green-400 list-disc list-inside space-y-0.5">
              <li><a href="/packages" className="underline">/packages</a> — Paket Umrah Demo</li>
              <li><a href="/progress" className="underline">/progress</a> — Trip + Manifest Jamaah</li>
              <li><a href="/clients" className="underline">/clients</a> — Siti Rahmawati</li>
              <li><a href="/orders" className="underline">/orders</a> — 4 order berbeda</li>
              <li><a href="/bc-templates" className="underline">/bc-templates</a> — Template WA Konfirmasi</li>
              <li><a href="/agent-center" className="underline">/agent-center</a> — Misi Harian</li>
              <li><a href="/notes" className="underline">/notes</a> — Catatan Demo (refresh dulu)</li>
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
