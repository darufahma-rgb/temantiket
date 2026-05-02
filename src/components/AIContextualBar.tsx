/**
 * AIContextualBar — Fase 26
 * Strip tipis di atas konten setiap halaman dengan chip perintah AI
 * yang relevan untuk halaman tersebut. Klik chip = langsung buka chat
 * dengan teks sudah terisi.
 */

import { useLocation } from "react-router-dom";
import { Bot, Sparkles } from "lucide-react";
import { useAIChatStore } from "@/store/aiChatStore";
import { cn } from "@/lib/utils";

// ── Per-page suggestion definitions ─────────────────────────────────────────

interface PageConfig {
  label: string;
  chips: string[];
}

const PAGE_CONFIGS: { match: (p: string) => boolean; config: PageConfig }[] = [
  {
    match: (p) => p === "/" || p === "/dashboard",
    config: {
      label: "Beranda",
      chips: [
        "Gimana performa bisnis hari ini?",
        "Siapa agen terbaik bulan ini?",
        "Buat misi harian untuk agen",
        "Ada order yang belum Completed?",
      ],
    },
  },
  {
    match: (p) => p.startsWith("/clients"),
    config: {
      label: "Manajemen Klien",
      chips: [
        "Cari klien Ahmad",
        "List 10 klien terbaru",
        "Berapa total klien saat ini?",
        "Ada klien dengan order flight?",
      ],
    },
  },
  {
    match: (p) => p.startsWith("/orders"),
    config: {
      label: "Order Hub",
      chips: [
        "List order flight status Confirmed",
        "Ada order umrah yang masih Draft?",
        "Berapa total revenue dari order Completed?",
        "List 5 order terbaru semua tipe",
      ],
    },
  },
  {
    match: (p) => p.startsWith("/itinerary"),
    config: {
      label: "Generator Itinerary",
      chips: [
        'Ekstrak: "1 QR978 Y 15MAR CGK DOH HK1 2355 0430 16MAR"',
        'Ekstrak: "EK317 CAI-DXB 20MAY 0310 0755 EK350 DXB-JED 0940 1100"',
        "Buat itinerary CGK-DOH-JED Qatar Airways 15 Maret",
        "Cari order flight terbaru untuk referensi rute",
      ],
    },
  },
  {
    match: (p) => p.startsWith("/calculator"),
    config: {
      label: "Kalkulator & Kurs",
      chips: [
        "Hitung profit EGP 1.500 modal EGP 1.200",
        "Hitung profit IDR 15.000.000 modal IDR 12.000.000",
        "Update kurs EGP ke 520",
        "Update kurs SAR ke 4.300",
      ],
    },
  },
  {
    match: (p) => p.startsWith("/reports"),
    config: {
      label: "Laporan Keuangan",
      chips: [
        "Berapa total revenue & profit semua order?",
        "Gimana ringkasan performa bisnis?",
        "Siapa agen dengan order terbanyak?",
        "List order Completed bulan ini",
      ],
    },
  },
  {
    match: (p) => p.startsWith("/agent-center"),
    config: {
      label: "Agent Command Center",
      chips: [
        "Buat misi: share promo umrah ke 5 kontak, reward 20 poin, deadline besok",
        "Siapa agen dengan poin terbanyak?",
        "List performa semua agen",
        "Buat misi: update foto profil agen reward 15 poin",
      ],
    },
  },
  {
    match: (p) => p.startsWith("/ticket-prices"),
    config: {
      label: "Harga Tiket",
      chips: [
        "List order flight terbaru",
        "Update kurs EGP ke 520",
        "Cari klien dengan order flight",
        "Hitung profit tiket EGP 1.200 modal EGP 950",
      ],
    },
  },
  {
    match: (p) => p.startsWith("/bc-templates"),
    config: {
      label: "Template BC WhatsApp",
      chips: [
        "List semua klien untuk broadcast",
        "Berapa jumlah klien aktif?",
        "Gimana performa bisnis untuk bahan broadcast?",
        "Cari klien dengan nomor HP 081",
      ],
    },
  },
  {
    match: (p) => p.startsWith("/notes"),
    config: {
      label: "Catatan",
      chips: [
        "Ringkasan bisnis hari ini untuk dicatat",
        "Berapa total revenue & profit bulan ini?",
        "List order yang baru Completed",
        "Gimana status performa agen?",
      ],
    },
  },
  {
    match: (p) => p.startsWith("/settings"),
    config: {
      label: "Pengaturan",
      chips: [
        "Update kurs EGP ke 520",
        "Update kurs SAR ke 4.300",
        "Update kurs USD ke 16.500",
        "Gimana ringkasan bisnis saat ini?",
      ],
    },
  },
  {
    match: (p) => p.startsWith("/exports"),
    config: {
      label: "Export Center",
      chips: [
        "List semua klien beserta paspor mereka",
        "Berapa total jamaah/klien terdaftar?",
        "List order Completed untuk laporan",
        "Gimana data order bulan ini?",
      ],
    },
  },
  {
    match: (p) => p.startsWith("/packages"),
    config: {
      label: "Paket Trip",
      chips: [
        "Hitung profit paket umrah EGP 2.500 modal EGP 2.000",
        "List klien yang sudah punya order umrah",
        "Gimana performa bisnis paket umrah?",
        "Buat misi: promosikan paket umrah terbaru",
      ],
    },
  },
  {
    match: (p) => p.startsWith("/agent/leaderboard"),
    config: {
      label: "Leaderboard Agen",
      chips: [
        "Siapa agen dengan poin terbanyak?",
        "List performa semua agen",
        "Berapa total poin agen bulan ini?",
      ],
    },
  },
];

function getPageConfig(pathname: string): PageConfig | null {
  const found = PAGE_CONFIGS.find((p) => p.match(pathname));
  return found?.config ?? null;
}

// ── Component ────────────────────────────────────────────────────────────────

export function AIContextualBar() {
  const { pathname } = useLocation();
  const openWithText = useAIChatStore((s) => s.openWithText);

  const config = getPageConfig(pathname);
  if (!config) return null;

  return (
    <div className="w-full px-0 pb-2.5 shrink-0">
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
        {/* Label */}
        <div className="flex items-center gap-1.5 shrink-0 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-full px-2.5 py-1 text-[10px] font-semibold shadow-sm shadow-sky-500/20">
          <Bot className="w-3 h-3" />
          <span>Tanya AI</span>
        </div>

        {/* Chips */}
        {config.chips.map((chip, i) => (
          <button
            key={i}
            onClick={() => openWithText(chip)}
            className={cn(
              "shrink-0 text-[10.5px] font-medium px-3 py-1 rounded-full border transition-all whitespace-nowrap",
              "bg-white/80 border-sky-100 text-sky-700 hover:bg-sky-50 hover:border-sky-300 hover:shadow-sm",
              "active:scale-95"
            )}
          >
            {chip.length > 42 ? chip.slice(0, 42) + "…" : chip}
          </button>
        ))}

        {/* Sparkle tail */}
        <Sparkles className="w-3.5 h-3.5 text-sky-300 shrink-0 ml-1" />
      </div>
    </div>
  );
}
