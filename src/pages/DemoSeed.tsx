import { useState } from "react";
import { CheckCircle2, XCircle, Loader2, FlaskConical, Trash2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { createPackage, listPackages, deletePackage } from "@/features/packages/packagesRepo";
import { createTrip, createJamaah, listTrips, listJamaah, deleteTrip } from "@/features/trips/tripsRepo";
import { createClient, listClients, deleteClient } from "@/features/clients/clientsRepo";
import { createOrder, listOrders, deleteOrder } from "@/features/orders/ordersRepo";
import {
  createTemplate as createBCTemplate,
  listTemplates as listBCTemplates,
  deleteTemplate as deleteBCTemplate,
} from "@/features/bcTemplates/bcTemplatesRepo";
import { createMission, listMissions, deleteMission } from "@/features/missions/missionsRepo";
import { useAuthStore } from "@/store/authStore";

type Status = "idle" | "loading" | "ok" | "error" | "skipped";

interface SeedItem {
  key: string;
  label: string;
  emoji: string;
  description: string;
  cleanDescription: string;
  status: Status;
  error?: string;
  count?: number;
}

const INITIAL_ITEMS: Omit<SeedItem, "status">[] = [
  { key: "package",      label: "Paket Umrah",         emoji: "📦", description: "1 paket umrah reguler",        cleanDescription: "Hapus semua paket bernama 'Demo —'" },
  { key: "trip",         label: "Trip + Jamaah",        emoji: "✈️", description: "1 trip + 1 jamaah manifest",  cleanDescription: "Hapus trip 'Demo —' beserta semua jamaahnya" },
  { key: "client",       label: "Klien",                emoji: "👤", description: "1 data klien baru",           cleanDescription: "Hapus klien dengan catatan 'Klien demo'" },
  { key: "order_umrah",  label: "Order Umrah",          emoji: "🕋", description: "1 order paket umrah",         cleanDescription: "Hapus order bertitel 'Demo —'" },
  { key: "order_flight", label: "Order Tiket Pesawat",  emoji: "🛫", description: "1 order tiket pesawat",       cleanDescription: "Hapus order bertitel 'Demo —'" },
  { key: "order_voa",    label: "Order Visa VOA",        emoji: "🛂", description: "1 order visa on arrival",    cleanDescription: "Hapus order bertitel 'Demo —'" },
  { key: "order_study",  label: "Order Visa Pelajar",   emoji: "🎓", description: "1 order visa pelajar",        cleanDescription: "Hapus order bertitel 'Demo —'" },
  { key: "bc_template",  label: "Template BC WhatsApp", emoji: "💬", description: "1 template broadcast WA",     cleanDescription: "Hapus template bertitel 'Demo —'" },
  { key: "mission",      label: "Misi Harian Agen",     emoji: "🎯", description: "1 misi untuk agen",           cleanDescription: "Hapus misi berjudul 'Demo —'" },
  { key: "note",         label: "Catatan",              emoji: "📝", description: "1 catatan (Notes)",           cleanDescription: "Hapus catatan demo dari localStorage" },
];

function toItems(status: Status): SeedItem[] {
  return INITIAL_ITEMS.map((it) => ({ ...it, status }));
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "loading") return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
  if (status === "ok")      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (status === "error")   return <XCircle className="w-4 h-4 text-red-500" />;
  if (status === "skipped") return <CheckCircle2 className="w-4 h-4 text-slate-300" />;
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

function cleanNote(): number {
  const STORAGE_KEY = "travelhub.notes.v2";
  const existing: Array<{ title?: string }> = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  const filtered = existing.filter((n) => !n.title?.startsWith("🗒️ Demo —"));
  const removed = existing.length - filtered.length;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  return removed;
}

export default function DemoSeed() {
  const [seedItems,  setSeedItems]  = useState<SeedItem[]>(toItems("idle"));
  const [cleanItems, setCleanItems] = useState<SeedItem[]>(toItems("idle"));
  const [running,  setRunning]  = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const user      = useAuthStore((s) => s.user);
  const agencyId  = user?.agencyId ?? "";
  const userId    = user?.id ?? "";

  function setSeed(key: string, status: Status, extra?: { error?: string; count?: number }) {
    setSeedItems((prev) => prev.map((it) => (it.key === key ? { ...it, status, ...extra } : it)));
  }
  function setClean(key: string, status: Status, extra?: { error?: string; count?: number }) {
    setCleanItems((prev) => prev.map((it) => (it.key === key ? { ...it, status, ...extra } : it)));
  }

  // ── SEED ────────────────────────────────────────────────────────────────────
  async function runSeed() {
    if (!agencyId) { toast.error("Login dulu ya!"); return; }
    setRunning(true);
    setSeedItems(toItems("idle"));

    let packageId = "";
    let tripId    = "";
    let clientId  = "";

    try {
      setSeed("package", "loading");
      const pkg = await createPackage({
        name: "Demo — Umrah Reguler Desember",
        destination: "Makkah & Madinah",
        people: 30, days: 12,
        hpp: 22_500_000, totalIDR: 26_000_000,
        status: "Confirmed", emoji: "🕋",
        departureDate: "2026-12-10", returnDate: "2026-12-22",
        airline: "Saudi Arabian Airlines", hotelLevel: "Bintang 4",
        notes: "Data demo — paket reguler akhir tahun",
        facilities: ["Hotel Bintang 4", "Makan 3x", "Manasik 2x", "Tour Leader"],
      });
      packageId = pkg.id;
      setSeed("package", "ok");
    } catch (e) { setSeed("package", "error", { error: String(e) }); }

    try {
      setSeed("trip", "loading");
      const trip = await createTrip({
        name: "Demo — Paket Trip Umrah Jan 2027",
        destination: "Makkah & Madinah",
        startDate: "2027-01-15", endDate: "2027-01-27",
        emoji: "✈️", quotaPax: 40, pricePerPax: 26_000_000,
      });
      tripId = trip.id;
      await createJamaah({
        tripId, name: "Ahmad Fauzi", phone: "081234567890",
        birthDate: "1980-06-15", passportNumber: "B1234567",
        passportExpiry: "2030-06-15", gender: "L",
        paymentStatus: "DP", bookingCode: "TMT-DEMO1",
      });
      setSeed("trip", "ok");
    } catch (e) { setSeed("trip", "error", { error: String(e) }); }

    try {
      setSeed("client", "loading");
      const client = await createClient({
        name: "Siti Rahmawati", phone: "08567891234",
        email: "siti.demo@temantiket.co.id",
        birthDate: "1992-03-20", passportNumber: "C9876543",
        passportExpiry: "2029-03-20", gender: "P",
        notes: "Klien demo — minat umrah plus Turki",
      });
      clientId = client.id;
      setSeed("client", "ok");
    } catch (e) { setSeed("client", "error", { error: String(e) }); }

    const orderSeeds: Array<{ key: string; draft: Parameters<typeof createOrder>[0] }> = [
      {
        key: "order_umrah",
        draft: {
          clientId: clientId || null, type: "umrah", status: "Confirmed",
          title: "Demo — Umrah Reguler Desember 2026",
          totalPrice: 26_000_000, costPrice: 22_500_000, currency: "IDR",
          metadata: { packageName: "Umrah Reguler Desember", pax: 1 },
          tripId: tripId || null, packageId: packageId || null, jamaahId: null,
          notes: "Data demo order umrah",
        },
      },
      {
        key: "order_flight",
        draft: {
          clientId: clientId || null, type: "flight", status: "Paid",
          title: "Demo — CGK → MED QR4982",
          totalPrice: 4_850_000, costPrice: 4_200_000, currency: "IDR",
          metadata: { legs: [{ airline: "Qatar Airways", flightNumber: "QR4982", fromCode: "CGK", fromCity: "Jakarta", toCode: "MED", toCity: "Madinah", departDate: "2026-12-10", departTime: "23:45", arriveDate: "2026-12-11", arriveTime: "06:30" }], pnr: "DEMOQR" },
          tripId: null, packageId: null, jamaahId: null,
          notes: "Data demo tiket pesawat Jakarta → Madinah",
        },
      },
      {
        key: "order_voa",
        draft: {
          clientId: clientId || null, type: "visa_voa", status: "Confirmed",
          title: "Demo — Visa on Arrival Thailand",
          totalPrice: 550_000, costPrice: 400_000, currency: "IDR",
          metadata: { country: "Thailand", duration: "30 hari" },
          tripId: null, packageId: null, jamaahId: null,
          notes: "Data demo visa on arrival Thailand",
        },
      },
      {
        key: "order_study",
        draft: {
          clientId: clientId || null, type: "visa_student", status: "Draft",
          title: "Demo — Visa Pelajar Mesir (Cairo University)",
          totalPrice: 1_200_000, costPrice: 900_000, currency: "IDR",
          metadata: { country: "Mesir", institution: "Cairo University", duration: "1 tahun" },
          tripId: null, packageId: null, jamaahId: null,
          notes: "Data demo visa pelajar Mesir",
        },
      },
    ];
    for (const { key, draft } of orderSeeds) {
      try {
        setSeed(key, "loading");
        await createOrder(draft);
        setSeed(key, "ok");
      } catch (e) { setSeed(key, "error", { error: String(e) }); }
    }

    try {
      setSeed("bc_template", "loading");
      await createBCTemplate({
        title: "Demo — Konfirmasi Keberangkatan Umrah",
        category: "umrah",
        body: "Assalamu'alaikum Bapak/Ibu {{NAMA_KLIEN}} 🕋\n\nKami dari *Temantiket* ingin menginformasikan bahwa keberangkatan umrah Anda telah *DIKONFIRMASI*.\n\n✅ Nama: {{NAMA_KLIEN}}\n✅ Kode Booking: {{KODE_BOOKING}}\n✅ Tanggal Berangkat: {{TGL_BERANGKAT}}\n✅ Maskapai: {{MASKAPAI}}\n\nSilakan siapkan dokumen paspor & visa Anda. Kami akan hubungi kembali H-7 keberangkatan.\n\nJazakumullah khairan 🤲",
        sortOrder: 1,
      });
      setSeed("bc_template", "ok");
    } catch (e) { setSeed("bc_template", "error", { error: String(e) }); }

    try {
      setSeed("mission", "loading");
      if (agencyId && userId) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(23, 59, 59, 0);
        await createMission(agencyId, {
          title: "Demo — Share konten Umrah ke Story Instagram",
          description: "Upload 1 story Instagram dengan template marketing Temantiket, tag @temantiket, dan screenshot sebagai bukti.",
          rewardPoints: 50,
          deadline: tomorrow.toISOString(),
        }, userId);
      }
      setSeed("mission", "ok");
    } catch (e) { setSeed("mission", "error", { error: String(e) }); }

    try {
      setSeed("note", "loading");
      await new Promise((r) => setTimeout(r, 80));
      seedNote();
      setSeed("note", "ok");
    } catch (e) { setSeed("note", "error", { error: String(e) }); }

    setRunning(false);
    toast.success("Data demo berhasil ditambahkan! 🎉", {
      description: "Refresh halaman masing-masing untuk melihat datanya.",
    });
  }

  // ── CLEANUP ─────────────────────────────────────────────────────────────────
  async function runCleanup() {
    if (!agencyId) { toast.error("Login dulu ya!"); return; }
    setCleaning(true);
    setCleanItems(toItems("idle"));

    // Packages
    try {
      setClean("package", "loading");
      const all = await listPackages();
      const demos = all.filter((p) => p.name.startsWith("Demo —"));
      for (const p of demos) await deletePackage(p.id);
      setClean("package", demos.length ? "ok" : "skipped", { count: demos.length });
    } catch (e) { setClean("package", "error", { error: String(e) }); }

    // Trips (cascade deletes jamaah via tripsRepo.deleteTrip)
    try {
      setClean("trip", "loading");
      const all = await listTrips();
      const demos = all.filter((t) => t.name.startsWith("Demo —"));
      let jamaahCount = 0;
      for (const t of demos) {
        const jamaah = await listJamaah(t.id);
        jamaahCount += jamaah.length;
        await deleteTrip(t.id);
      }
      setClean("trip", demos.length ? "ok" : "skipped", { count: demos.length + jamaahCount });
    } catch (e) { setClean("trip", "error", { error: String(e) }); }

    // Clients
    try {
      setClean("client", "loading");
      const all = await listClients();
      const demos = all.filter((c) => c.notes?.includes("Klien demo") || c.email?.endsWith("@temantiket.co.id"));
      for (const c of demos) await deleteClient(c.id);
      setClean("client", demos.length ? "ok" : "skipped", { count: demos.length });
    } catch (e) { setClean("client", "error", { error: String(e) }); }

    // Orders (all types in one pass)
    const orderKeys = ["order_umrah", "order_flight", "order_voa", "order_study"] as const;
    try {
      const all = await listOrders();
      const demos = all.filter((o) => o.title?.startsWith("Demo —"));
      const byType: Record<string, typeof demos> = {
        order_umrah: demos.filter((o) => o.type === "umrah"),
        order_flight: demos.filter((o) => o.type === "flight"),
        order_voa: demos.filter((o) => o.type === "visa_voa"),
        order_study: demos.filter((o) => o.type === "visa_student"),
      };
      for (const key of orderKeys) setClean(key, "loading");
      for (const o of demos) await deleteOrder(o.id);
      for (const key of orderKeys) {
        const n = byType[key].length;
        setClean(key, n ? "ok" : "skipped", { count: n });
      }
    } catch (e) {
      for (const key of orderKeys) setClean(key, "error", { error: String(e) });
    }

    // BC Templates
    try {
      setClean("bc_template", "loading");
      const all = await listBCTemplates();
      const demos = all.filter((t) => t.title.startsWith("Demo —"));
      for (const t of demos) await deleteBCTemplate(t.id);
      setClean("bc_template", demos.length ? "ok" : "skipped", { count: demos.length });
    } catch (e) { setClean("bc_template", "error", { error: String(e) }); }

    // Missions
    try {
      setClean("mission", "loading");
      const all = await listMissions(agencyId);
      const demos = all.filter((m) => m.title.startsWith("Demo —"));
      for (const m of demos) await deleteMission(m.id);
      setClean("mission", demos.length ? "ok" : "skipped", { count: demos.length });
    } catch (e) { setClean("mission", "error", { error: String(e) }); }

    // Notes (localStorage)
    try {
      setClean("note", "loading");
      await new Promise((r) => setTimeout(r, 80));
      const removed = cleanNote();
      setClean("note", removed > 0 ? "ok" : "skipped", { count: removed });
    } catch (e) { setClean("note", "error", { error: String(e) }); }

    setCleaning(false);
    const errors = cleanItems.filter((it) => it.status === "error").length;
    if (errors === 0) {
      toast.success("Semua data demo berhasil dihapus!", {
        description: "Database sudah bersih.",
      });
    } else {
      toast.warning(`${errors} item gagal dihapus — cek detail di bawah.`);
    }
  }

  const seedDone  = seedItems.filter((it)  => it.status === "ok").length;
  const seedErr   = seedItems.filter((it)  => it.status === "error").length;
  const cleanDone = cleanItems.filter((it) => it.status === "ok" || it.status === "skipped").length;
  const cleanErr  = cleanItems.filter((it) => it.status === "error").length;
  const anySeedRan  = !running  && seedItems.some((it)  => it.status !== "idle");
  const anyCleanRan = !cleaning && cleanItems.some((it) => it.status !== "idle");

  function ItemRow({ item, mode }: { item: SeedItem; mode: "seed" | "clean" }) {
    const desc = mode === "clean" ? item.cleanDescription : item.description;
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40">
        <StatusIcon status={item.status} />
        <span className="text-lg leading-none">{item.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{item.label}</p>
          <p className="text-xs text-slate-400 truncate">
            {item.error
              ? <span className="text-red-500">{item.error}</span>
              : item.count !== undefined && item.status !== "idle"
              ? <span>{item.count} item {mode === "clean" ? "dihapus" : "dibuat"}</span>
              : desc}
          </p>
        </div>
        {item.status === "ok" && (
          <Badge variant="outline" className="text-[10px] border-green-200 text-green-700 bg-green-50 shrink-0">
            {mode === "clean" ? "Terhapus" : "Selesai"}
          </Badge>
        )}
        {item.status === "skipped" && (
          <Badge variant="outline" className="text-[10px] border-slate-200 text-slate-500 bg-slate-50 shrink-0">
            Kosong
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-violet-100 dark:bg-violet-900/30">
          <FlaskConical className="w-6 h-6 text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Demo Data Seeder</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Tambah atau hapus data dummy untuk pengujian fitur
          </p>
        </div>
      </div>

      <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800">
        <CardContent className="pt-4 pb-3">
          <p className="text-sm text-amber-800 dark:text-amber-300">
            ⚠️ <strong>Hanya untuk testing.</strong> Data tersimpan di Supabase agency{" "}
            <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900/30 px-1 rounded">{agencyId || "belum login"}</code>.
            Hapus setelah selesai pengujian.
          </p>
        </CardContent>
      </Card>

      {/* ── SEED SECTION ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Tambah Data Demo</CardTitle>
              <CardDescription>
                {running
                  ? "Sedang memasukkan data…"
                  : anySeedRan
                  ? `${seedDone} berhasil${seedErr > 0 ? `, ${seedErr} gagal` : ""}`
                  : "1 data per fitur akan dimasukkan ke Supabase"}
              </CardDescription>
            </div>
            {anySeedRan && (
              <Badge variant="outline" className={seedErr === 0
                ? "border-green-300 text-green-700 bg-green-50"
                : "border-amber-300 text-amber-700 bg-amber-50"}>
                {seedErr === 0 ? "✅ Semua Berhasil" : `⚠️ ${seedErr} Gagal`}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {seedItems.map((item) => <ItemRow key={item.key} item={item} mode="seed" />)}
        </CardContent>
      </Card>

      <Button
        className="w-full bg-violet-600 hover:bg-violet-700 text-white"
        size="lg"
        disabled={running || cleaning}
        onClick={runSeed}
      >
        {running ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Menyemai Data…</>
        ) : (
          <><FlaskConical className="w-4 h-4 mr-2" />{anySeedRan ? "Jalankan Ulang" : "Masukkan Semua Data Demo"}</>
        )}
      </Button>

      {anySeedRan && seedErr === 0 && (
        <Card className="border-green-200 bg-green-50 dark:bg-green-900/10 dark:border-green-800">
          <CardContent className="pt-4 pb-3 space-y-1">
            <p className="text-sm font-semibold text-green-800 dark:text-green-300">✅ Cek data di halaman berikut:</p>
            <ul className="text-sm text-green-700 dark:text-green-400 list-disc list-inside space-y-0.5">
              <li><a href="/packages" className="underline">/packages</a> — Paket Umrah Demo</li>
              <li><a href="/progress" className="underline">/progress</a> — Trip + Manifest Jamaah</li>
              <li><a href="/clients" className="underline">/clients</a> — Siti Rahmawati</li>
              <li><a href="/orders" className="underline">/orders</a> — 4 order berbeda</li>
              <li><a href="/bc-templates" className="underline">/bc-templates</a> — Template WA</li>
              <li><a href="/agent-center" className="underline">/agent-center</a> — Misi Harian</li>
              <li><a href="/notes" className="underline">/notes</a> — Catatan Demo (refresh dulu)</li>
            </ul>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* ── CLEANUP SECTION ── */}
      <Card className="border-red-100 dark:border-red-900/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-500" />
                Hapus Semua Data Demo
              </CardTitle>
              <CardDescription>
                {cleaning
                  ? "Sedang menghapus data…"
                  : anyCleanRan
                  ? `${cleanDone} selesai${cleanErr > 0 ? `, ${cleanErr} gagal` : ""}`
                  : "Cari dan hapus semua data bertanda 'Demo —' dari Supabase"}
              </CardDescription>
            </div>
            {anyCleanRan && (
              <Badge variant="outline" className={cleanErr === 0
                ? "border-green-300 text-green-700 bg-green-50"
                : "border-red-300 text-red-700 bg-red-50"}>
                {cleanErr === 0 ? "✅ Bersih" : `⚠️ ${cleanErr} Gagal`}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {cleanItems.map((item) => <ItemRow key={item.key} item={item} mode="clean" />)}
        </CardContent>
      </Card>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="destructive"
            className="w-full"
            size="lg"
            disabled={running || cleaning}
          >
            {cleaning ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Menghapus…</>
            ) : (
              <><Trash2 className="w-4 h-4 mr-2" />Hapus Semua Data Demo</>
            )}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Semua Data Demo?</AlertDialogTitle>
            <AlertDialogDescription>
              Semua data di Supabase yang judulnya dimulai dengan <strong>"Demo —"</strong> akan dihapus permanen.
              Data asli milik agency kamu <strong>tidak akan terpengaruh</strong>.
              Tindakan ini tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={runCleanup}
            >
              Ya, Hapus Sekarang
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
