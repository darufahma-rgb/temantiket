import { useState } from "react";
import {
  CheckCircle2, XCircle, Loader2, FlaskConical, Trash2, ShieldAlert,
  Star, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
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
import {
  createMission, listMissions, deleteMission,
  createTemplate as createMissionTemplate,
  listTemplates as listMissionTemplates,
  deleteTemplate as deleteMissionTemplate,
  submitMission, listSubmissions,
} from "@/features/missions/missionsRepo";
import {
  createTicketPrice, listTicketPrices, deleteTicketPrice,
} from "@/features/ticketPrices/ticketPricesRepo";
import { useAuthStore } from "@/store/authStore";

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Basic seed items ──────────────────────────────────────────────────────────

const BASIC_ITEMS: Omit<SeedItem, "status">[] = [
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

// ── Masisir Edition items ─────────────────────────────────────────────────────

const MASISIR_ITEMS: Omit<SeedItem, "status">[] = [
  { key: "m_clients",     label: "5 Klien Mahasiswa Al-Azhar", emoji: "🎓", description: "5 klien realistis Masisir Cairo",       cleanDescription: "Hapus klien dengan notes 'Masisir —'" },
  { key: "m_orders",      label: "10 Order Rute Cairo",        emoji: "✈️", description: "10 order (EGP/SAR + markup logis)",     cleanDescription: "Hapus order bertitel 'Masisir —'" },
  { key: "m_tickets",     label: "5 Harga Tiket Ekstraksi AI", emoji: "🎟️", description: "5 rute Cairo (CGK/KNO), harga EGP",    cleanDescription: "Hapus tiket notes 'Masisir —'" },
  { key: "m_missions",    label: "Misi + Template + Submission",emoji: "🎯", description: "3 template + 3 misi + 2 submission",   cleanDescription: "Hapus misi/template berjudul 'Masisir —'" },
  { key: "m_itineraries", label: "2 Itinerary CAI→DXB→CGK",   emoji: "🗺️", description: "2 itinerary tersimpan di Riwayat",     cleanDescription: "Hapus itinerary demo dari localStorage" },
  { key: "m_notes",       label: "5 Catatan Follow-up Klien",  emoji: "📝", description: "5 catatan per skenario klien",         cleanDescription: "Hapus catatan Masisir dari localStorage" },
  { key: "m_templates",   label: "3 Template BC Masisir",      emoji: "💬", description: "3 template broadcast WA Masisir",      cleanDescription: "Hapus template bertitel 'Masisir —'" },
];

function toItems(defs: Omit<SeedItem, "status">[], status: Status): SeedItem[] {
  return defs.map((it) => ({ ...it, status }));
}

// ── Status icon ───────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: Status }) {
  if (status === "loading") return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
  if (status === "ok")      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (status === "error")   return <XCircle className="w-4 h-4 text-red-500" />;
  if (status === "skipped") return <CheckCircle2 className="w-4 h-4 text-slate-300" />;
  return <div className="w-4 h-4 rounded-full border-2 border-slate-300" />;
}

// ── localStorage helpers ──────────────────────────────────────────────────────

const NOTES_KEY = "travelhub.notes.v2";
const ITIN_KEY  = "temantiket.itinerary.history.v1";

function seedNote() {
  const existing = JSON.parse(localStorage.getItem(NOTES_KEY) ?? "[]");
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
  localStorage.setItem(NOTES_KEY, JSON.stringify([demoNote, ...existing]));
}

function cleanNote(): number {
  const existing: Array<{ title?: string }> = JSON.parse(localStorage.getItem(NOTES_KEY) ?? "[]");
  const filtered = existing.filter((n) => !n.title?.startsWith("🗒️ Demo —"));
  const removed = existing.length - filtered.length;
  localStorage.setItem(NOTES_KEY, JSON.stringify(filtered));
  return removed;
}

// ── Masisir localStorage helpers ──────────────────────────────────────────────

function seedMasisirNotes() {
  const existing = JSON.parse(localStorage.getItem(NOTES_KEY) ?? "[]");
  const masisirNotes = [
    {
      id: "note-masisir-1",
      title: "Masisir — Follow-up Ahmad Faruq Habibi",
      content: "• Tiket CAI→CGK sudah Completed ✓\n• Bagasi 30kg sudah dikonfirmasi Qatar Airways\n• Visa VOA Thailand perlu diperpanjang bulan depan\n• WA terakhir: minta invoice PDF untuk kampus",
      createdAt: Date.now() - 172800000,
      updatedAt: Date.now() - 86400000,
      color: "bg-sky-50 border-sky-200",
      pinned: true,
      tags: ["masisir", "follow-up", "faruq"],
    },
    {
      id: "note-masisir-2",
      title: "Masisir — Dokumen Siti Nur Amaliyah",
      content: "• Paspor valid hingga Jul 2031 ✓\n• Tiket CAI→KNO Confirmed — tunggu e-ticket\n• Paket Umrah Ramadan belum DP\n• Catatan: lebih suka komunikasi via WA pagi hari",
      createdAt: Date.now() - 259200000,
      updatedAt: Date.now() - 43200000,
      color: "bg-yellow-50 border-yellow-200",
      pinned: false,
      tags: ["masisir", "dokumen", "siti"],
    },
    {
      id: "note-masisir-3",
      title: "Masisir — Umrah Rizky Hidayat — Konfirmasi Jadwal",
      content: "• Paket Umrah Pra-Wisuda masih Pending — tunggu kabar dari kampus\n• Tiket balik CGK masih Pending, tunda booking dulu\n• Rizky minta rute via Doha (stopover pendek)\n• Budget: maks SAR 5.000 inclusive semua",
      createdAt: Date.now() - 345600000,
      updatedAt: Date.now() - 7200000,
      color: "bg-sky-50 border-sky-200",
      pinned: true,
      tags: ["masisir", "umrah", "rizky"],
    },
    {
      id: "note-masisir-4",
      title: "Masisir — Status Visa Fatimah Azzahra",
      content: "• Visa Pelajar Mesir perpanjang COMPLETED ✓\n• Tiket CAI→BDO Confirmed — jadwal mau balik liburan\n• Fatimah tanya apakah bisa split bagasi 30+10kg\n• Hubungi H-14 untuk check-in reminder",
      createdAt: Date.now() - 432000000,
      updatedAt: Date.now() - 3600000,
      color: "bg-green-50 border-green-200",
      pinned: false,
      tags: ["masisir", "visa", "fatimah"],
    },
    {
      id: "note-masisir-5",
      title: "Masisir — Tiket Balik Hasan Lubis",
      content: "• Tiket CAI→KNO masih Pending — nunggu info tanggal wisuda\n• Paket Umrah Pasca-Wisuda COMPLETED ✓ — jadi referensi ke teman-teman\n• Hasan sudah refer 3 temannya → cocok untuk program Agen Bronze\n• Invite ke WhatsApp Group Mitra Temantiket",
      createdAt: Date.now() - 518400000,
      updatedAt: Date.now() - 1800000,
      color: "bg-purple-50 border-purple-200",
      pinned: false,
      tags: ["masisir", "referral", "hasan"],
    },
  ];
  const existingIds = existing.map((n: { id?: string }) => n.id);
  const toAdd = masisirNotes.filter((n) => !existingIds.includes(n.id));
  if (toAdd.length > 0) {
    localStorage.setItem(NOTES_KEY, JSON.stringify([...toAdd, ...existing]));
  }
  return toAdd.length;
}

function cleanMasisirNotes(): number {
  const existing: Array<{ id?: string; title?: string }> = JSON.parse(localStorage.getItem(NOTES_KEY) ?? "[]");
  const filtered = existing.filter((n) => !n.id?.startsWith("note-masisir-") && !n.title?.startsWith("Masisir —"));
  const removed = existing.length - filtered.length;
  localStorage.setItem(NOTES_KEY, JSON.stringify(filtered));
  return removed;
}

function seedMasisirItineraries() {
  const existing = JSON.parse(localStorage.getItem(ITIN_KEY) ?? "[]");
  const demos = [
    {
      id: "masisir-demo-1",
      label: "CAI → DXB → CGK (EK325 + EK368)",
      savedAt: Date.now() - 7200000,
      data: {
        pnr: "MASISIR1",
        passengerName: "Ahmad Faruq Habibi",
        totalPrice: 2450,
        priceCurrency: "EGP",
        legs: [
          {
            airline: "Emirates",
            flightNumber: "EK325",
            fromCode: "CAI",
            fromCity: "Cairo",
            toCode: "DXB",
            toCity: "Dubai",
            departDate: "2026-06-15",
            departTime: "02:15",
            arriveDate: "2026-06-15",
            arriveTime: "07:45",
            duration: "5j 30m",
            class: "Economy",
            baggage: "30kg",
            terminal: "T3",
          },
          {
            airline: "Emirates",
            flightNumber: "EK368",
            fromCode: "DXB",
            fromCity: "Dubai",
            toCode: "CGK",
            toCity: "Jakarta",
            departDate: "2026-06-15",
            departTime: "10:20",
            arriveDate: "2026-06-15",
            arriveTime: "22:45",
            duration: "8j 25m",
            class: "Economy",
            baggage: "30kg",
            terminal: "T1",
          },
        ],
      },
    },
    {
      id: "masisir-demo-2",
      label: "CAI → DXB → CGK (EK327 + EK370) — Siti Nur",
      savedAt: Date.now() - 3600000,
      data: {
        pnr: "MASISIR2",
        passengerName: "Siti Nur Amaliyah",
        totalPrice: 2450,
        priceCurrency: "EGP",
        legs: [
          {
            airline: "Emirates",
            flightNumber: "EK327",
            fromCode: "CAI",
            fromCity: "Cairo",
            toCode: "DXB",
            toCity: "Dubai",
            departDate: "2026-07-10",
            departTime: "23:45",
            arriveDate: "2026-07-11",
            arriveTime: "05:15",
            duration: "5j 30m",
            class: "Economy",
            baggage: "30kg",
            terminal: "T3",
          },
          {
            airline: "Emirates",
            flightNumber: "EK370",
            fromCode: "DXB",
            fromCity: "Dubai",
            toCode: "CGK",
            toCity: "Jakarta",
            departDate: "2026-07-11",
            departTime: "08:50",
            arriveDate: "2026-07-11",
            arriveTime: "21:10",
            duration: "8j 20m",
            class: "Economy",
            baggage: "30kg",
            terminal: "T1",
          },
        ],
      },
    },
  ];
  const existingIds = existing.map((e: { id?: string }) => e.id);
  const toAdd = demos.filter((d) => !existingIds.includes(d.id));
  if (toAdd.length > 0) {
    localStorage.setItem(ITIN_KEY, JSON.stringify([...toAdd, ...existing]));
  }
  return toAdd.length;
}

function cleanMasisirItineraries(): number {
  const existing: Array<{ id?: string }> = JSON.parse(localStorage.getItem(ITIN_KEY) ?? "[]");
  const filtered = existing.filter((e) => !e.id?.startsWith("masisir-demo-"));
  const removed = existing.length - filtered.length;
  localStorage.setItem(ITIN_KEY, JSON.stringify(filtered));
  return removed;
}

// ── Item row UI ───────────────────────────────────────────────────────────────

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

// ── Main component ────────────────────────────────────────────────────────────

export default function DemoSeed() {
  const [basicSeedItems,  setBasicSeedItems]  = useState<SeedItem[]>(toItems(BASIC_ITEMS, "idle"));
  const [basicCleanItems, setBasicCleanItems] = useState<SeedItem[]>(toItems(BASIC_ITEMS, "idle"));
  const [masisirSeedItems,  setMasisirSeedItems]  = useState<SeedItem[]>(toItems(MASISIR_ITEMS, "idle"));
  const [masisirCleanItems, setMasisirCleanItems] = useState<SeedItem[]>(toItems(MASISIR_ITEMS, "idle"));
  const [runningBasic,  setRunningBasic]  = useState(false);
  const [cleaningBasic, setCleaningBasic] = useState(false);
  const [runningMasisir,  setRunningMasisir]  = useState(false);
  const [cleaningMasisir, setCleaningMasisir] = useState(false);
  const [basicOpen, setBasicOpen] = useState(false);

  const user     = useAuthStore((s) => s.user);
  const agencyId = user?.agencyId ?? "";
  const userId   = user?.id ?? "";

  function setBasicSeed(key: string, status: Status, extra?: { error?: string; count?: number }) {
    setBasicSeedItems((prev) => prev.map((it) => (it.key === key ? { ...it, status, ...extra } : it)));
  }
  function setBasicClean(key: string, status: Status, extra?: { error?: string; count?: number }) {
    setBasicCleanItems((prev) => prev.map((it) => (it.key === key ? { ...it, status, ...extra } : it)));
  }
  function setMasisirSeed(key: string, status: Status, extra?: { error?: string; count?: number }) {
    setMasisirSeedItems((prev) => prev.map((it) => (it.key === key ? { ...it, status, ...extra } : it)));
  }
  function setMasisirClean(key: string, status: Status, extra?: { error?: string; count?: number }) {
    setMasisirCleanItems((prev) => prev.map((it) => (it.key === key ? { ...it, status, ...extra } : it)));
  }

  // ── BASIC SEED ──────────────────────────────────────────────────────────────
  async function runBasicSeed() {
    if (!agencyId) { toast.error("Login dulu ya!"); return; }
    setRunningBasic(true);
    setBasicSeedItems(toItems(BASIC_ITEMS, "idle"));

    let packageId = "";
    let tripId    = "";
    let clientId  = "";

    try {
      setBasicSeed("package", "loading");
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
      setBasicSeed("package", "ok");
    } catch (e) { setBasicSeed("package", "error", { error: String(e) }); }

    try {
      setBasicSeed("trip", "loading");
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
      setBasicSeed("trip", "ok");
    } catch (e) { setBasicSeed("trip", "error", { error: String(e) }); }

    try {
      setBasicSeed("client", "loading");
      const client = await createClient({
        name: "Siti Rahmawati", phone: "08567891234",
        email: "siti.demo@temantiket.co.id",
        birthDate: "1992-03-20", passportNumber: "C9876543",
        passportExpiry: "2029-03-20", gender: "P",
        notes: "Klien demo — minat umrah plus Turki",
      });
      clientId = client.id;
      setBasicSeed("client", "ok");
    } catch (e) { setBasicSeed("client", "error", { error: String(e) }); }

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
        setBasicSeed(key, "loading");
        await createOrder(draft);
        setBasicSeed(key, "ok");
      } catch (e) { setBasicSeed(key, "error", { error: String(e) }); }
    }

    try {
      setBasicSeed("bc_template", "loading");
      await createBCTemplate({
        title: "Demo — Konfirmasi Keberangkatan Umrah",
        category: "umrah",
        body: "Assalamu'alaikum Bapak/Ibu {{NAMA_KLIEN}} 🕋\n\nKami dari *Temantiket* ingin menginformasikan bahwa keberangkatan umrah Anda telah *DIKONFIRMASI*.\n\n✅ Nama: {{NAMA_KLIEN}}\n✅ Kode Booking: {{KODE_BOOKING}}\n✅ Tanggal Berangkat: {{TGL_BERANGKAT}}\n✅ Maskapai: {{MASKAPAI}}\n\nSilakan siapkan dokumen paspor & visa Anda. Kami akan hubungi kembali H-7 keberangkatan.\n\nJazakumullah khairan 🤲",
        sortOrder: 1,
      });
      setBasicSeed("bc_template", "ok");
    } catch (e) { setBasicSeed("bc_template", "error", { error: String(e) }); }

    try {
      setBasicSeed("mission", "loading");
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
      setBasicSeed("mission", "ok");
    } catch (e) { setBasicSeed("mission", "error", { error: String(e) }); }

    try {
      setBasicSeed("note", "loading");
      await new Promise((r) => setTimeout(r, 80));
      seedNote();
      setBasicSeed("note", "ok");
    } catch (e) { setBasicSeed("note", "error", { error: String(e) }); }

    setRunningBasic(false);
    toast.success("Data demo dasar berhasil ditambahkan!", {
      description: "Refresh halaman masing-masing untuk melihat datanya.",
    });
  }

  // ── BASIC CLEANUP ────────────────────────────────────────────────────────────
  async function runBasicCleanup() {
    if (!agencyId) { toast.error("Login dulu ya!"); return; }
    setCleaning: setCleaningBasic(true);
    setBasicCleanItems(toItems(BASIC_ITEMS, "idle"));

    try {
      setBasicClean("package", "loading");
      const all = await listPackages();
      const demos = all.filter((p) => p.name.startsWith("Demo —"));
      for (const p of demos) await deletePackage(p.id);
      setBasicClean("package", demos.length ? "ok" : "skipped", { count: demos.length });
    } catch (e) { setBasicClean("package", "error", { error: String(e) }); }

    try {
      setBasicClean("trip", "loading");
      const all = await listTrips();
      const demos = all.filter((t) => t.name.startsWith("Demo —"));
      let jamaahCount = 0;
      for (const t of demos) {
        const jamaah = await listJamaah(t.id);
        jamaahCount += jamaah.length;
        await deleteTrip(t.id);
      }
      setBasicClean("trip", demos.length ? "ok" : "skipped", { count: demos.length + jamaahCount });
    } catch (e) { setBasicClean("trip", "error", { error: String(e) }); }

    try {
      setBasicClean("client", "loading");
      const all = await listClients();
      const demos = all.filter((c) => c.notes?.includes("Klien demo") || c.email?.endsWith("@temantiket.co.id"));
      for (const c of demos) await deleteClient(c.id);
      setBasicClean("client", demos.length ? "ok" : "skipped", { count: demos.length });
    } catch (e) { setBasicClean("client", "error", { error: String(e) }); }

    const orderKeys = ["order_umrah", "order_flight", "order_voa", "order_study"] as const;
    try {
      const all = await listOrders();
      const demos = all.filter((o) => o.title?.startsWith("Demo —"));
      const byType: Record<string, typeof demos> = {
        order_umrah:  demos.filter((o) => o.type === "umrah"),
        order_flight: demos.filter((o) => o.type === "flight"),
        order_voa:    demos.filter((o) => o.type === "visa_voa"),
        order_study:  demos.filter((o) => o.type === "visa_student"),
      };
      for (const key of orderKeys) setBasicClean(key, "loading");
      for (const o of demos) await deleteOrder(o.id);
      for (const key of orderKeys) {
        const n = byType[key].length;
        setBasicClean(key, n ? "ok" : "skipped", { count: n });
      }
    } catch (e) {
      for (const key of orderKeys) setBasicClean(key, "error", { error: String(e) });
    }

    try {
      setBasicClean("bc_template", "loading");
      const all = await listBCTemplates();
      const demos = all.filter((t) => t.title.startsWith("Demo —"));
      for (const t of demos) await deleteBCTemplate(t.id);
      setBasicClean("bc_template", demos.length ? "ok" : "skipped", { count: demos.length });
    } catch (e) { setBasicClean("bc_template", "error", { error: String(e) }); }

    try {
      setBasicClean("mission", "loading");
      const all = await listMissions(agencyId);
      const demos = all.filter((m) => m.title.startsWith("Demo —"));
      for (const m of demos) await deleteMission(m.id);
      setBasicClean("mission", demos.length ? "ok" : "skipped", { count: demos.length });
    } catch (e) { setBasicClean("mission", "error", { error: String(e) }); }

    try {
      setBasicClean("note", "loading");
      await new Promise((r) => setTimeout(r, 80));
      const removed = cleanNote();
      setBasicClean("note", removed > 0 ? "ok" : "skipped", { count: removed });
    } catch (e) { setBasicClean("note", "error", { error: String(e) }); }

    setCleaningBasic(false);
    toast.success("Data demo dasar berhasil dihapus!", { description: "Database sudah bersih." });
  }

  // ── MASISIR SEED ──────────────────────────────────────────────────────────────
  async function runMasisirSeed() {
    if (!agencyId || !userId) { toast.error("Login dulu ya!"); return; }
    setRunningMasisir(true);
    setMasisirSeedItems(toItems(MASISIR_ITEMS, "idle"));

    // 5 Clients
    const clientIds: string[] = [];
    try {
      setMasisirSeed("m_clients", "loading");
      const clientDrafts = [
        {
          name: "Ahmad Faruq Habibi", phone: "08119234567",
          email: "faruq.habibi@gmail.com", gender: "L" as const,
          birthDate: "2000-03-15", passportNumber: "B5234789", passportExpiry: "2030-03-15",
          notes: "Masisir — Mahasiswa Syariah Al-Azhar semester 6. Minat rute Cairo-Jakarta via Doha. Sering nanya soal bagasi 30kg.",
        },
        {
          name: "Siti Nur Amaliyah", phone: "08112345678",
          email: "siti.amaliyah@gmail.com", gender: "P" as const,
          birthDate: "2001-07-22", passportNumber: "B8123456", passportExpiry: "2031-07-22",
          notes: "Masisir — Mahasiswi Dakwah Al-Azhar. Mau pulang lebaran ke Medan. Butuh tiket 2 minggu sebelum lebaran.",
        },
        {
          name: "Muhammad Rizky Hidayat", phone: "08122334455",
          email: "rizky.hidayat@gmail.com", gender: "L" as const,
          birthDate: "1999-11-08", passportNumber: "C2345678", passportExpiry: "2029-11-08",
          notes: "Masisir — Mahasiswa Ushuluddin, tahun terakhir. Tertarik umrah sebelum wisuda. Budget maks SAR 5.000.",
        },
        {
          name: "Fatimah Azzahra Putri", phone: "08133445566",
          email: "fatimah.azzahra@gmail.com", gender: "P" as const,
          birthDate: "2002-01-30", passportNumber: "C8765432", passportExpiry: "2032-01-30",
          notes: "Masisir — Mahasiswi Bahasa Arab Al-Azhar semester 4. Perlu visa pelajar perpanjang dan tiket balik ke Bandung.",
        },
        {
          name: "Hasan Abdurrahman Lubis", phone: "08144556677",
          email: "hasan.lubis@gmail.com", gender: "L" as const,
          birthDate: "1998-05-20", passportNumber: "B6789012", passportExpiry: "2028-05-20",
          notes: "Masisir — Mahasiswa Fiqih Al-Azhar. Alumni PPMI Mesir. Sering referral teman ke Temantiket. Kandidat agen Bronze.",
        },
      ];
      for (const draft of clientDrafts) {
        const c = await createClient(draft);
        clientIds.push(c.id);
      }
      setMasisirSeed("m_clients", "ok", { count: clientIds.length });
    } catch (e) { setMasisirSeed("m_clients", "error", { error: String(e) }); }

    // 10 Orders — EGP/SAR pricing with markup (EGP ≈ 515 IDR, SAR ≈ 4250 IDR)
    try {
      setMasisirSeed("m_orders", "loading");
      const [cFaruq, cSiti, cRizky, cFatimah, cHasan] = clientIds;
      const orderDrafts: Parameters<typeof createOrder>[0][] = [
        // Faruq — Cairo-Jakarta via Doha (Completed)
        {
          clientId: cFaruq ?? null, type: "flight", status: "Completed",
          title: "Masisir — CAI→CGK via DOH (QR578) — Faruq",
          totalPrice: 2_450 * 515, costPrice: 2_100 * 515, currency: "IDR",
          metadata: {
            originalCurrency: "EGP", originalPrice: 2450, originalCost: 2100,
            markup: 350, markupIDR: 350 * 515,
            pnr: "QRFR2501", operasional: { bankFee: 25000, adminFee: 15000 },
            legs: [
              { airline: "Qatar Airways", flightNumber: "QR578", fromCode: "CAI", fromCity: "Cairo", toCode: "DOH", toCity: "Doha", departDate: "2026-04-10", departTime: "01:30", arriveDate: "2026-04-10", arriveTime: "05:50" },
              { airline: "Qatar Airways", flightNumber: "QR958", fromCode: "DOH", fromCity: "Doha", toCode: "CGK", toCity: "Jakarta", departDate: "2026-04-10", departTime: "10:10", arriveDate: "2026-04-10", arriveTime: "22:45" },
            ],
          },
          tripId: null, packageId: null, jamaahId: null,
          notes: "Masisir — Bagasi 30kg confirmed. E-ticket sudah terkirim.",
        },
        // Faruq — VOA Thailand (Confirmed)
        {
          clientId: cFaruq ?? null, type: "visa_voa", status: "Confirmed",
          title: "Masisir — VOA Thailand 30 Hari — Faruq",
          totalPrice: 650_000, costPrice: 450_000, currency: "IDR",
          metadata: { country: "Thailand", duration: "30 hari", markup: 200000 },
          tripId: null, packageId: null, jamaahId: null,
          notes: "Masisir — Proses di konter imigrasi Suvarnabhumi.",
        },
        // Siti — Cairo-Medan via Dubai (Confirmed)
        {
          clientId: cSiti ?? null, type: "flight", status: "Confirmed",
          title: "Masisir — CAI→KNO via DXB (EK323) — Siti",
          totalPrice: 2_200 * 515, costPrice: 1_900 * 515, currency: "IDR",
          metadata: {
            originalCurrency: "EGP", originalPrice: 2200, originalCost: 1900,
            markup: 300, markupIDR: 300 * 515,
            pnr: "EKSN2502", operasional: { bankFee: 25000, adminFee: 15000 },
            legs: [
              { airline: "Emirates", flightNumber: "EK323", fromCode: "CAI", fromCity: "Cairo", toCode: "DXB", toCity: "Dubai", departDate: "2026-05-20", departTime: "02:15", arriveDate: "2026-05-20", arriveTime: "07:45" },
              { airline: "Emirates", flightNumber: "EK352", fromCode: "DXB", fromCity: "Dubai", toCode: "KNO", toCity: "Medan", departDate: "2026-05-20", departTime: "11:00", arriveDate: "2026-05-20", arriveTime: "19:30" },
            ],
          },
          tripId: null, packageId: null, jamaahId: null,
          notes: "Masisir — Menunggu e-ticket. Reminder H-3.",
        },
        // Siti — Paket Umrah Ramadan (Confirmed)
        {
          clientId: cSiti ?? null, type: "umrah", status: "Confirmed",
          title: "Masisir — Paket Umrah Ramadan 2027 — Siti",
          totalPrice: 5_200 * 4250, costPrice: 4_500 * 4250, currency: "IDR",
          metadata: {
            originalCurrency: "SAR", originalPrice: 5200, originalCost: 4500,
            markup: 700, markupIDR: 700 * 4250,
            packageName: "Umrah Ramadan 1448H", pax: 1,
            operasional: { bankFee: 50000, adminFee: 25000 },
            hotel: "Hotel Hilton Madinah Bintang 5",
            nights: 14, airline: "Saudia",
          },
          tripId: null, packageId: null, jamaahId: null,
          notes: "Masisir — DP 30% sudah masuk. Sisa pelunasan H-30 keberangkatan.",
        },
        // Rizky — Umrah Pra-Wisuda (Pending)
        {
          clientId: cRizky ?? null, type: "umrah", status: "Draft",
          title: "Masisir — Umrah Pra-Wisuda — Rizky",
          totalPrice: 4_800 * 4250, costPrice: 4_200 * 4250, currency: "IDR",
          metadata: {
            originalCurrency: "SAR", originalPrice: 4800, originalCost: 4200,
            markup: 600, markupIDR: 600 * 4250,
            packageName: "Umrah Reguler Mei 2027", pax: 1,
            operasional: { bankFee: 50000, adminFee: 25000 },
            hotel: "Al-Marwa Rayhaan Makkah Bintang 5", nights: 12,
          },
          tripId: null, packageId: null, jamaahId: null,
          notes: "Masisir — Menunggu konfirmasi tanggal wisuda sebelum booking final.",
        },
        // Rizky — Cairo-Jakarta via KUL (Pending)
        {
          clientId: cRizky ?? null, type: "flight", status: "Draft",
          title: "Masisir — CAI→CGK via KUL (MS735) — Rizky",
          totalPrice: 2_350 * 515, costPrice: 2_050 * 515, currency: "IDR",
          metadata: {
            originalCurrency: "EGP", originalPrice: 2350, originalCost: 2050,
            markup: 300, markupIDR: 300 * 515,
            pnr: null, operasional: { bankFee: 25000, adminFee: 15000 },
            legs: [
              { airline: "EgyptAir", flightNumber: "MS735", fromCode: "CAI", fromCity: "Cairo", toCode: "KUL", toCity: "Kuala Lumpur", departDate: "2026-07-15", departTime: "23:45", arriveDate: "2026-07-16", arriveTime: "14:20" },
              { airline: "EgyptAir", flightNumber: "MS959", fromCode: "KUL", fromCity: "Kuala Lumpur", toCode: "CGK", toCity: "Jakarta", departDate: "2026-07-16", departTime: "17:10", arriveDate: "2026-07-16", arriveTime: "18:20" },
            ],
          },
          tripId: null, packageId: null, jamaahId: null,
          notes: "Masisir — Hold sementara. Konfirmasi after wisuda.",
        },
        // Fatimah — Visa Pelajar Mesir (Completed)
        {
          clientId: cFatimah ?? null, type: "visa_student", status: "Completed",
          title: "Masisir — Visa Pelajar Mesir Perpanjang — Fatimah",
          totalPrice: 1_100 * 515, costPrice: 850 * 515, currency: "IDR",
          metadata: {
            originalCurrency: "EGP", originalPrice: 1100, originalCost: 850,
            markup: 250, markupIDR: 250 * 515,
            country: "Mesir", institution: "Universitas Al-Azhar",
            duration: "1 tahun", operasional: { adminFee: 30000 },
          },
          tripId: null, packageId: null, jamaahId: null,
          notes: "Masisir — Visa sudah terbit. Berlaku s/d Jan 2027.",
        },
        // Fatimah — Cairo-Bandung via DXB (Confirmed)
        {
          clientId: cFatimah ?? null, type: "flight", status: "Confirmed",
          title: "Masisir — CAI→BDO via DXB (EK) — Fatimah",
          totalPrice: 2_400 * 515, costPrice: 2_080 * 515, currency: "IDR",
          metadata: {
            originalCurrency: "EGP", originalPrice: 2400, originalCost: 2080,
            markup: 320, markupIDR: 320 * 515,
            pnr: "EKFZ2503", operasional: { bankFee: 25000, adminFee: 15000 },
            legs: [
              { airline: "Emirates", flightNumber: "EK927", fromCode: "CAI", fromCity: "Cairo", toCode: "DXB", toCity: "Dubai", departDate: "2026-06-25", departTime: "23:55", arriveDate: "2026-06-26", arriveTime: "05:25" },
              { airline: "Emirates", flightNumber: "EK360", fromCode: "DXB", fromCity: "Dubai", toCode: "CGK", toCity: "Jakarta", departDate: "2026-06-26", departTime: "08:50", arriveDate: "2026-06-26", arriveTime: "21:10" },
            ],
          },
          tripId: null, packageId: null, jamaahId: null,
          notes: "Masisir — Transit Jakarta → lanjut ke Bandung mandiri.",
        },
        // Hasan — Cairo-Medan via Doha (Pending)
        {
          clientId: cHasan ?? null, type: "flight", status: "Draft",
          title: "Masisir — CAI→KNO via DOH (QR1184) — Hasan",
          totalPrice: 2_180 * 515, costPrice: 1_900 * 515, currency: "IDR",
          metadata: {
            originalCurrency: "EGP", originalPrice: 2180, originalCost: 1900,
            markup: 280, markupIDR: 280 * 515,
            pnr: null, operasional: { bankFee: 25000, adminFee: 15000 },
            legs: [
              { airline: "Qatar Airways", flightNumber: "QR1184", fromCode: "CAI", fromCity: "Cairo", toCode: "DOH", toCity: "Doha", departDate: "2026-08-01", departTime: "01:30", arriveDate: "2026-08-01", arriveTime: "05:50" },
              { airline: "Qatar Airways", flightNumber: "QR960", fromCode: "DOH", fromCity: "Doha", toCode: "KNO", toCity: "Medan", departDate: "2026-08-01", departTime: "10:00", arriveDate: "2026-08-01", arriveTime: "20:00" },
            ],
          },
          tripId: null, packageId: null, jamaahId: null,
          notes: "Masisir — Menunggu konfirmasi tanggal wisuda Hasan.",
        },
        // Hasan — Umrah Pasca-Wisuda (Completed)
        {
          clientId: cHasan ?? null, type: "umrah", status: "Completed",
          title: "Masisir — Umrah Pasca-Wisuda — Hasan",
          totalPrice: 5_500 * 4250, costPrice: 4_800 * 4250, currency: "IDR",
          metadata: {
            originalCurrency: "SAR", originalPrice: 5500, originalCost: 4800,
            markup: 700, markupIDR: 700 * 4250,
            packageName: "Umrah Plus Madinah Apr 2026", pax: 1,
            operasional: { bankFee: 50000, adminFee: 25000 },
            hotel: "Dar Al-Iman Intercontinental Madinah", nights: 14,
            airline: "Saudia SV",
          },
          tripId: null, packageId: null, jamaahId: null,
          notes: "Masisir — COMPLETED. Hasan sudah balik ke Indonesia. Potensi referral 3 teman.",
        },
      ];

      let orderCount = 0;
      for (const draft of orderDrafts) {
        await createOrder(draft);
        orderCount++;
      }
      setMasisirSeed("m_orders", "ok", { count: orderCount });
    } catch (e) { setMasisirSeed("m_orders", "error", { error: String(e) }); }

    // 5 Ticket Prices (Cairo routes, EGP-based)
    try {
      setMasisirSeed("m_tickets", "loading");
      const ticketDrafts: Parameters<typeof createTicketPrice>[0][] = [
        {
          airline: "Qatar Airways", airlineCode: "QR",
          fromCode: "CAI", fromCity: "Cairo", toCode: "CGK", toCity: "Jakarta",
          departDate: null, basePrice: 2450, currency: "EGP",
          validUntil: "2026-12-31",
          notes: "Masisir — Via Doha (DOH). Harga termasuk bagasi 30kg. Hasil ekstraksi AI dari GDS.",
          isPublished: true, sortOrder: 1,
          flightNumber: "QR578 + QR958",
          etd: "01:30", eta: "22:45",
          terminal: "T3",
          transitCode: "DOH", transitCity: "Doha", transitDuration: "4j 20m",
        },
        {
          airline: "Emirates", airlineCode: "EK",
          fromCode: "CAI", fromCity: "Cairo", toCode: "KNO", toCity: "Medan",
          departDate: null, basePrice: 2200, currency: "EGP",
          validUntil: "2026-12-31",
          notes: "Masisir — Via Dubai (DXB). Bagasi 30kg. Hasil ekstraksi AI dari GDS.",
          isPublished: true, sortOrder: 2,
          flightNumber: "EK323 + EK352",
          etd: "02:15", eta: "19:30",
          terminal: "T3",
          transitCode: "DXB", transitCity: "Dubai", transitDuration: "3j 15m",
        },
        {
          airline: "EgyptAir", airlineCode: "MS",
          fromCode: "CAI", fromCity: "Cairo", toCode: "CGK", toCity: "Jakarta",
          departDate: null, basePrice: 2150, currency: "EGP",
          validUntil: "2026-12-31",
          notes: "Masisir — Via Kuala Lumpur (KUL). Bagasi 30kg. Hasil ekstraksi AI dari GDS.",
          isPublished: true, sortOrder: 3,
          flightNumber: "MS735 + MS959",
          etd: "23:45", eta: "+2h 16:20",
          terminal: "T1",
          transitCode: "KUL", transitCity: "Kuala Lumpur", transitDuration: "2j 50m",
        },
        {
          airline: "Qatar Airways", airlineCode: "QR",
          fromCode: "CAI", fromCity: "Cairo", toCode: "KNO", toCity: "Medan",
          departDate: null, basePrice: 2180, currency: "EGP",
          validUntil: "2026-12-31",
          notes: "Masisir — Via Doha (DOH). Bagasi 30kg. Hasil ekstraksi AI dari GDS.",
          isPublished: true, sortOrder: 4,
          flightNumber: "QR1184 + QR960",
          etd: "01:30", eta: "20:00",
          terminal: "T3",
          transitCode: "DOH", transitCity: "Doha", transitDuration: "4j 10m",
        },
        {
          airline: "Saudia", airlineCode: "SV",
          fromCode: "CAI", fromCity: "Cairo", toCode: "CGK", toCity: "Jakarta",
          departDate: null, basePrice: 2380, currency: "EGP",
          validUntil: "2026-12-31",
          notes: "Masisir — Via Jeddah (JED). Bagasi 30kg. Cocok untuk yang mau umrah sebelum pulang.",
          isPublished: true, sortOrder: 5,
          flightNumber: "SV259 + SV819",
          etd: "08:00", eta: "18:30",
          terminal: "T1",
          transitCode: "JED", transitCity: "Jeddah", transitDuration: "3j 30m",
        },
      ];
      let ticketCount = 0;
      for (const draft of ticketDrafts) {
        await createTicketPrice(draft);
        ticketCount++;
      }
      setMasisirSeed("m_tickets", "ok", { count: ticketCount });
    } catch (e) { setMasisirSeed("m_tickets", "error", { error: String(e) }); }

    // 3 Mission Templates + 3 Missions + 2 Submissions
    try {
      setMasisirSeed("m_missions", "loading");
      let missionCount = 0;

      // Templates
      const t1 = await createMissionTemplate(agencyId, {
        title: "Masisir — Share promo Umrah di grup kekeluargaan",
        description: "Kirim pesan broadcast promo Umrah Temantiket ke minimal 1 grup WhatsApp kekeluargaan/PPMI. Screenshot percakapan sebagai bukti.",
        defaultPoints: 50,
      }, userId);

      const t2 = await createMissionTemplate(agencyId, {
        title: "Masisir — Upload story Instagram rute Cairo-Jakarta",
        description: "Upload 1 story Instagram promosi rute Cairo-Jakarta/Medan dari Temantiket. Tag @temantiket_id. Screenshot story aktif sebagai bukti.",
        defaultPoints: 75,
      }, userId);

      const t3 = await createMissionTemplate(agencyId, {
        title: "Masisir — Rekrut 1 jamaah baru untuk Temantiket",
        description: "Ajak minimal 1 orang kenalan/teman untuk bertanya soal layanan Temantiket. Screenshot percakapan WA dengan calon jamaah sebagai bukti.",
        defaultPoints: 100,
      }, userId);

      // Missions from templates
      const deadline1 = new Date(); deadline1.setDate(deadline1.getDate() + 1); deadline1.setHours(23, 59, 59, 0);
      const deadline2 = new Date(); deadline2.setHours(23, 59, 59, 0);
      const deadline3 = new Date(); deadline3.setDate(deadline3.getDate() + 3); deadline3.setHours(23, 59, 59, 0);

      const m1 = await createMission(agencyId, {
        title: "Masisir — Misi: Share Promo Umrah ke Grup PPMI Cairo",
        description: "Kirim pesan promo Umrah Temantiket ke grup PPMI Cairo atau grup kekeluargaan Masisir. Screenshot pesan terkirim sebagai bukti.",
        rewardPoints: 50,
        deadline: deadline1.toISOString(),
      }, userId);

      const m2 = await createMission(agencyId, {
        title: "Masisir — Misi: Story IG Rute Mudik Cairo-Jakarta",
        description: "Upload story Instagram dengan template promosi rute Cairo-Jakarta Temantiket. Tag @temantiket_id dan screenshot story aktif.",
        rewardPoints: 75,
        deadline: deadline2.toISOString(),
      }, userId);

      await createMission(agencyId, {
        title: "Masisir — Misi: Rekrut Jamaah Baru dari Asrama Al-Azhar",
        description: "Ajak teman asrama atau kenalan sesama Masisir untuk tanya-tanya soal layanan Temantiket. Screenshot percakapan WA sebagai bukti.",
        rewardPoints: 100,
        deadline: deadline3.toISOString(),
      }, userId);
      missionCount += 3;

      // Submissions (current user as agent for demo)
      if (m1) {
        await submitMission(agencyId, m1.id, userId, 50, null,
          "Sudah share ke grup PPMI Cairo dan grup Ma'had Al-Azhar Pondok. Total 2 grup dengan 87 member.");
      }
      if (m2) {
        await submitMission(agencyId, m2.id, userId, 75, null,
          "Story sudah diupload dan sudah dapat 23 views. Screenshot terlampir.");
      }

      void t1; void t2; void t3;
      setMasisirSeed("m_missions", "ok", { count: missionCount + 2 });
    } catch (e) { setMasisirSeed("m_missions", "error", { error: String(e) }); }

    // 2 Itinerary history entries (localStorage)
    try {
      setMasisirSeed("m_itineraries", "loading");
      await new Promise((r) => setTimeout(r, 60));
      const count = seedMasisirItineraries();
      setMasisirSeed("m_itineraries", count > 0 ? "ok" : "skipped", { count });
    } catch (e) { setMasisirSeed("m_itineraries", "error", { error: String(e) }); }

    // 5 Notes
    try {
      setMasisirSeed("m_notes", "loading");
      await new Promise((r) => setTimeout(r, 60));
      const count = seedMasisirNotes();
      setMasisirSeed("m_notes", count > 0 ? "ok" : "skipped", { count });
    } catch (e) { setMasisirSeed("m_notes", "error", { error: String(e) }); }

    // 3 BC Templates
    try {
      setMasisirSeed("m_templates", "loading");
      const bcDrafts: Parameters<typeof createBCTemplate>[0][] = [
        {
          title: "Masisir — Promo Tiket Cairo-Jakarta Hemat",
          category: "tiket_pesawat",
          body: "Assalamu'alaikum Kak {{NAMA_KLIEN}} ✈️\n\nAda info tiket *CAIRO → JAKARTA* harga terbaik bulan ini!\n\n📍 Rute: Cairo (CAI) → Jakarta (CGK)\n✈️ Maskapai: Qatar Airways / Emirates\n💰 Harga mulai *EGP 2.150* (≈ Rp 1,1 juta)\n🧳 Bagasi: 30kg included\n📅 Jadwal: Fleksibel sesuai kebutuhan\n\nSudah termasuk:\n✅ E-ticket & konfirmasi resmi\n✅ Layanan WhatsApp 24 jam\n✅ Support dari Cairo hingga landing Jakarta\n\nSlot terbatas! Hubungi kami segera:\n_Temantiket — mudah, cepat, amanah_",
          sortOrder: 10,
        },
        {
          title: "Masisir — Paket Umrah Khusus Mahasiswa Mesir",
          category: "umrah",
          body: "Assalamu'alaikum Akh/Ukh {{NAMA_KLIEN}} 🕋\n\nSpesial untuk *Mahasiswa Indonesia di Mesir* — Paket Umrah 2027!\n\n🌙 Paket Umrah Reguler:\n• 12 malam di Makkah & Madinah\n• Hotel bintang 4-5 dekat Masjidil Haram\n• Tiket PP Cairo → Madinah → Jakarta\n• Manasik 2x + Tour Leader berpengalaman\n• Makan 3x sehari\n\n💰 Harga: Mulai *SAR 4.800* per orang\n(≈ Rp 20,4 juta — kurs SAR {{KURS_SAR}})\n\nBisa DP *30%* dulu!\n\nDaftar sebelum *{{DEADLINE_DAFTAR}}* untuk early bird!\n\n_Temantiket — Mitra Perjalanan Masisir_",
          sortOrder: 11,
        },
        {
          title: "Masisir — Info Booking Tiket Pulang Lebaran",
          category: "tiket_pesawat",
          body: "Assalamu'alaikum Kak {{NAMA_KLIEN}} ✈️\n\nPengingat penting untuk yang mau *Mudik Lebaran* dari Cairo!\n\nJangan sampai kehabisan tiket — booking sekarang!\n\n📅 Periode peak season: *15 Maret — 15 April 2027*\n✈️ Rute tersedia:\n• Cairo → Jakarta (CGK)\n• Cairo → Medan (KNO)\n• Cairo → Surabaya (SUB) via transit\n\n⚠️ Harga naik signifikan di H-30!\n\n💡 Tips hemat:\n• Book minimal 2 bulan sebelum\n• Pilih hari Selasa/Rabu untuk harga terbaik\n• Bagasi 30kg lebih hemat daripada kelebihan\n\nMau cek harga sekarang?\nReply *CEKTIKET* dan kami bantu proses!\n\n_Temantiket — mudah, cepat, amanah_",
          sortOrder: 12,
        },
      ];
      let bcCount = 0;
      for (const draft of bcDrafts) {
        await createBCTemplate(draft);
        bcCount++;
      }
      setMasisirSeed("m_templates", "ok", { count: bcCount });
    } catch (e) { setMasisirSeed("m_templates", "error", { error: String(e) }); }

    setRunningMasisir(false);
    const errors = masisirSeedItems.filter((it) => it.status === "error").length;
    if (errors === 0) {
      toast.success("Data Masisir Edition berhasil ditambahkan!", {
        description: "Cek Klien, Orders, Harga Tiket, Misi, dan Itinerary.",
      });
    } else {
      toast.warning(`${errors} item gagal — cek detail di bawah.`);
    }
  }

  // ── MASISIR CLEANUP ───────────────────────────────────────────────────────────
  async function runMasisirCleanup() {
    if (!agencyId) { toast.error("Login dulu ya!"); return; }
    setCleaningMasisir(true);
    setMasisirCleanItems(toItems(MASISIR_ITEMS, "idle"));

    // Clients
    try {
      setMasisirClean("m_clients", "loading");
      const all = await listClients();
      const demos = all.filter((c) => c.notes?.includes("Masisir —"));
      for (const c of demos) await deleteClient(c.id);
      setMasisirClean("m_clients", demos.length ? "ok" : "skipped", { count: demos.length });
    } catch (e) { setMasisirClean("m_clients", "error", { error: String(e) }); }

    // Orders
    try {
      setMasisirClean("m_orders", "loading");
      const all = await listOrders();
      const demos = all.filter((o) => o.title?.startsWith("Masisir —"));
      for (const o of demos) await deleteOrder(o.id);
      setMasisirClean("m_orders", demos.length ? "ok" : "skipped", { count: demos.length });
    } catch (e) { setMasisirClean("m_orders", "error", { error: String(e) }); }

    // Ticket prices
    try {
      setMasisirClean("m_tickets", "loading");
      const all = await listTicketPrices();
      const demos = all.filter((t) => t.notes?.includes("Masisir —"));
      for (const t of demos) await deleteTicketPrice(t.id);
      setMasisirClean("m_tickets", demos.length ? "ok" : "skipped", { count: demos.length });
    } catch (e) { setMasisirClean("m_tickets", "error", { error: String(e) }); }

    // Missions + templates
    try {
      setMasisirClean("m_missions", "loading");
      const [allM, allT] = await Promise.all([listMissions(agencyId), listMissionTemplates(agencyId)]);
      const demoM = allM.filter((m) => m.title.startsWith("Masisir —"));
      const demoT = allT.filter((t) => t.title.startsWith("Masisir —"));
      for (const m of demoM) await deleteMission(m.id);
      for (const t of demoT) await deleteMissionTemplate(t.id);
      const total = demoM.length + demoT.length;
      setMasisirClean("m_missions", total ? "ok" : "skipped", { count: total });
    } catch (e) { setMasisirClean("m_missions", "error", { error: String(e) }); }

    // Itineraries (localStorage)
    try {
      setMasisirClean("m_itineraries", "loading");
      await new Promise((r) => setTimeout(r, 60));
      const removed = cleanMasisirItineraries();
      setMasisirClean("m_itineraries", removed > 0 ? "ok" : "skipped", { count: removed });
    } catch (e) { setMasisirClean("m_itineraries", "error", { error: String(e) }); }

    // Notes (localStorage)
    try {
      setMasisirClean("m_notes", "loading");
      await new Promise((r) => setTimeout(r, 60));
      const removed = cleanMasisirNotes();
      setMasisirClean("m_notes", removed > 0 ? "ok" : "skipped", { count: removed });
    } catch (e) { setMasisirClean("m_notes", "error", { error: String(e) }); }

    // BC templates
    try {
      setMasisirClean("m_templates", "loading");
      const all = await listBCTemplates();
      const demos = all.filter((t) => t.title.startsWith("Masisir —"));
      for (const t of demos) await deleteBCTemplate(t.id);
      setMasisirClean("m_templates", demos.length ? "ok" : "skipped", { count: demos.length });
    } catch (e) { setMasisirClean("m_templates", "error", { error: String(e) }); }

    setCleaningMasisir(false);
    toast.success("Data Masisir Edition berhasil dihapus!", { description: "Database sudah bersih." });
  }

  // ── Computed state ────────────────────────────────────────────────────────────
  const masisirSeedDone = masisirSeedItems.filter((it) => it.status === "ok").length;
  const masisirSeedErr  = masisirSeedItems.filter((it) => it.status === "error").length;
  const masisirCleanDone = masisirCleanItems.filter((it) => it.status === "ok" || it.status === "skipped").length;
  const masisirCleanErr  = masisirCleanItems.filter((it) => it.status === "error").length;
  const anyMasisirSeedRan  = !runningMasisir  && masisirSeedItems.some((it)  => it.status !== "idle");
  const anyMasisirCleanRan = !cleaningMasisir && masisirCleanItems.some((it) => it.status !== "idle");

  const basicSeedDone  = basicSeedItems.filter((it)  => it.status === "ok").length;
  const basicSeedErr   = basicSeedItems.filter((it)  => it.status === "error").length;
  const basicCleanDone = basicCleanItems.filter((it) => it.status === "ok" || it.status === "skipped").length;
  const basicCleanErr  = basicCleanItems.filter((it) => it.status === "error").length;
  const anyBasicSeedRan  = !runningBasic  && basicSeedItems.some((it)  => it.status !== "idle");
  const anyBasicCleanRan = !cleaningBasic && basicCleanItems.some((it) => it.status !== "idle");

  const anyRunning = runningBasic || cleaningBasic || runningMasisir || cleaningMasisir;

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

      {/* ══════════════════════════════════════════════════════════════════════
          FASE 25 — MASISIR EDITION
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border-2 border-sky-200 bg-sky-50/50 dark:bg-sky-950/10 dark:border-sky-800 overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 bg-sky-500 text-white">
          <Star className="w-5 h-5 fill-white" />
          <div>
            <p className="font-bold text-[15px]">Fase 25 — Masisir Edition</p>
            <p className="text-[12px] text-sky-100">Dataset realistis mahasiswa Al-Azhar Cairo</p>
          </div>
          {anyMasisirSeedRan && (
            <Badge className={`ml-auto ${masisirSeedErr === 0 ? "bg-white text-sky-700" : "bg-amber-400 text-white"}`}>
              {masisirSeedErr === 0 ? `${masisirSeedDone}/${MASISIR_ITEMS.length} OK` : `${masisirSeedErr} gagal`}
            </Badge>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Seed items */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Yang akan dibuat</CardTitle>
              <CardDescription className="text-xs">
                5 klien · 10 order · 5 tiket · 3 misi · 2 itinerary · 5 catatan · 3 template BC
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {masisirSeedItems.map((item) => <ItemRow key={item.key} item={item} mode="seed" />)}
            </CardContent>
          </Card>

          <Button
            className="w-full bg-sky-500 hover:bg-sky-600 text-white"
            size="lg"
            disabled={anyRunning}
            onClick={runMasisirSeed}
          >
            {runningMasisir
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Memasukkan Data Masisir…</>
              : <><Star className="w-4 h-4 mr-2" />{anyMasisirSeedRan ? "Jalankan Ulang Masisir Edition" : "Masukkan Semua Data Masisir Edition"}</>}
          </Button>

          {anyMasisirSeedRan && masisirSeedErr === 0 && (
            <Card className="border-green-200 bg-green-50 dark:bg-green-900/10">
              <CardContent className="pt-4 pb-3 space-y-1">
                <p className="text-sm font-semibold text-green-800">Cek data di halaman berikut:</p>
                <ul className="text-sm text-green-700 list-disc list-inside space-y-0.5">
                  <li><a href="/clients" className="underline">/clients</a> — 5 mahasiswa Al-Azhar</li>
                  <li><a href="/orders" className="underline">/orders</a> — 10 order EGP/SAR dengan markup</li>
                  <li><a href="/ticket-prices" className="underline">/ticket-prices</a> — 5 harga tiket Cairo</li>
                  <li><a href="/agent-center" className="underline">/agent-center</a> — 3 misi + template + submission</li>
                  <li><a href="/itinerary" className="underline">/itinerary</a> — 2 itinerary Cairo-Dubai-Jakarta</li>
                  <li><a href="/notes" className="underline">/notes</a> — 5 catatan klien (refresh dulu)</li>
                  <li><a href="/bc-templates" className="underline">/bc-templates</a> — 3 template broadcast</li>
                  <li><a href="/reports" className="underline">/reports</a> — Laporan keuangan EGP/SAR</li>
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Masisir Cleanup */}
          <Separator />
          <Card className="border-red-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-500" /> Hapus Data Masisir
              </CardTitle>
              <CardDescription className="text-xs">
                {anyMasisirCleanRan
                  ? `${masisirCleanDone} selesai${masisirCleanErr > 0 ? `, ${masisirCleanErr} gagal` : ""}`
                  : "Hapus semua data bertanda 'Masisir —' dari Supabase & localStorage"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {masisirCleanItems.map((item) => <ItemRow key={item.key} item={item} mode="clean" />)}
            </CardContent>
          </Card>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full" disabled={anyRunning}>
                {cleaningMasisir
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Menghapus…</>
                  : <><Trash2 className="w-4 h-4 mr-2" />Hapus Semua Data Masisir Edition</>}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Hapus Data Masisir Edition?</AlertDialogTitle>
                <AlertDialogDescription>
                  Semua data dengan judul <strong>"Masisir —"</strong> akan dihapus permanen dari Supabase.
                  Data asli milik agency tidak akan terpengaruh.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Batal</AlertDialogCancel>
                <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={runMasisirCleanup}>
                  Ya, Hapus
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SEED DASAR (collapsible)
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-5 py-3 bg-slate-50 hover:bg-slate-100 text-left transition-colors"
          onClick={() => setBasicOpen((v) => !v)}
        >
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-violet-500" />
            <span className="text-sm font-semibold text-slate-700">Seed Dasar (1 item per fitur)</span>
          </div>
          {basicOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {basicOpen && (
          <div className="p-5 space-y-4">
            {/* Seed */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Tambah Data Demo</CardTitle>
                    <CardDescription>
                      {runningBasic
                        ? "Sedang memasukkan data…"
                        : anyBasicSeedRan
                        ? `${basicSeedDone} berhasil${basicSeedErr > 0 ? `, ${basicSeedErr} gagal` : ""}`
                        : "1 data per fitur akan dimasukkan ke Supabase"}
                    </CardDescription>
                  </div>
                  {anyBasicSeedRan && (
                    <Badge variant="outline" className={basicSeedErr === 0
                      ? "border-green-300 text-green-700 bg-green-50"
                      : "border-amber-300 text-amber-700 bg-amber-50"}>
                      {basicSeedErr === 0 ? "Semua Berhasil" : `${basicSeedErr} Gagal`}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {basicSeedItems.map((item) => <ItemRow key={item.key} item={item} mode="seed" />)}
              </CardContent>
            </Card>

            <Button
              className="w-full bg-violet-600 hover:bg-violet-700 text-white"
              size="lg"
              disabled={anyRunning}
              onClick={runBasicSeed}
            >
              {runningBasic
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Menyemai Data…</>
                : <><FlaskConical className="w-4 h-4 mr-2" />{anyBasicSeedRan ? "Jalankan Ulang" : "Masukkan Semua Data Demo"}</>}
            </Button>

            <Separator />

            {/* Cleanup */}
            <Card className="border-red-100 dark:border-red-900/30">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-red-500" /> Hapus Semua Data Demo
                    </CardTitle>
                    <CardDescription>
                      {cleaningBasic
                        ? "Sedang menghapus data…"
                        : anyBasicCleanRan
                        ? `${basicCleanDone} selesai${basicCleanErr > 0 ? `, ${basicCleanErr} gagal` : ""}`
                        : "Cari dan hapus semua data bertanda 'Demo —' dari Supabase"}
                    </CardDescription>
                  </div>
                  {anyBasicCleanRan && (
                    <Badge variant="outline" className={basicCleanErr === 0
                      ? "border-green-300 text-green-700 bg-green-50"
                      : "border-red-300 text-red-700 bg-red-50"}>
                      {basicCleanErr === 0 ? "Bersih" : `${basicCleanErr} Gagal`}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {basicCleanItems.map((item) => <ItemRow key={item.key} item={item} mode="clean" />)}
              </CardContent>
            </Card>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full" size="lg" disabled={anyRunning}>
                  {cleaningBasic
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Menghapus…</>
                    : <><Trash2 className="w-4 h-4 mr-2" />Hapus Semua Data Demo</>}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Hapus Semua Data Demo?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Semua data di Supabase yang judulnya dimulai dengan <strong>"Demo —"</strong> akan dihapus permanen.
                    Data asli milik agency kamu <strong>tidak akan terpengaruh</strong>.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Batal</AlertDialogCancel>
                  <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={runBasicCleanup}>
                    Ya, Hapus Semua
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
    </div>
  );
}
