/**
 * PublicOrderProgressSection — "Status Pemesanan Saya" block on the public member card page.
 *
 * Shows per-order progress timeline, payment badge, admin notes, missing-doc alert,
 * and action buttons (WhatsApp admin, copy order ID).
 *
 * Safe for public / unauthenticated display — never exposes profit, cost, agent, or
 * internal operator notes.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, Circle, Clock, Copy, Check, MessageCircle,
  ChevronDown, AlertTriangle, Info, FileText, CalendarClock,
} from "lucide-react";
import type { PublicOrderData } from "@/features/portal/memberCardRepo";

// ── Public-facing step definitions ───────────────────────────────────────────

interface PublicStep {
  label:    string;
  emoji:    string;
  sublabel: string;
}

const PUBLIC_ORDER_STEPS: Record<string, PublicStep[]> = {
  visa_student: [
    { label: "Order Dibuat",      emoji: "📋", sublabel: "Pesanan terdaftar" },
    { label: "Pembayaran / DP",   emoji: "💳", sublabel: "DP / lunas diterima" },
    { label: "Dokumen Diterima",  emoji: "📥", sublabel: "Berkas dikirim ke kami" },
    { label: "Dokumen Dicek",     emoji: "✅", sublabel: "Verifikasi dokumen" },
    { label: "Proses Pengajuan",  emoji: "🏛️", sublabel: "Masuk kedutaan" },
    { label: "Visa Terbit",       emoji: "🎉", sublabel: "Visa siap" },
  ],
  visa_voa: [
    { label: "Order Dibuat",       emoji: "📋", sublabel: "Pesanan terdaftar" },
    { label: "Pembayaran",         emoji: "💳", sublabel: "Pembayaran diterima" },
    { label: "Data Penumpang",     emoji: "👤", sublabel: "Data dicek & diverifikasi" },
    { label: "Agent Ditugaskan",   emoji: "👷", sublabel: "Agent lapangan ready" },
    { label: "Mendekati Berangkat",emoji: "✈️", sublabel: "Siap keberangkatan" },
    { label: "Selesai",            emoji: "✅", sublabel: "Proses selesai" },
  ],
  flight: [
    { label: "Request Tiket",      emoji: "📋", sublabel: "Pesanan diterima" },
    { label: "Pencarian Jadwal",   emoji: "🔍", sublabel: "Cek ketersediaan kursi" },
    { label: "Konfirmasi Harga",   emoji: "💰", sublabel: "Harga & jadwal dikonfirmasi" },
    { label: "Pembayaran",         emoji: "💳", sublabel: "Pembayaran selesai" },
    { label: "Tiket Diterbitkan",  emoji: "🎫", sublabel: "E-tiket dikirim" },
  ],
  umrah: [
    { label: "Daftar Paket",       emoji: "📝", sublabel: "Pendaftaran berhasil" },
    { label: "Bayar DP",           emoji: "💳", sublabel: "Down payment diterima" },
    { label: "Kelengkapan Berkas", emoji: "📁", sublabel: "Dokumen dilengkapi" },
    { label: "Pelunasan",          emoji: "💰", sublabel: "Pembayaran penuh selesai" },
    { label: "Keberangkatan",      emoji: "✈️", sublabel: "Siap berangkat" },
    { label: "Selesai",            emoji: "🕋", sublabel: "Alhamdulillah selesai" },
  ],
};

function getSteps(type: string): PublicStep[] {
  return PUBLIC_ORDER_STEPS[type] ?? PUBLIC_ORDER_STEPS.umrah;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  umrah:        "Paket Umrah",
  flight:       "Tiket Pesawat",
  visa_voa:     "Visa on Arrival",
  visa_student: "Visa Pelajar / Entry",
};
const TYPE_EMOJI: Record<string, string> = {
  umrah: "🕋", flight: "✈️", visa_voa: "🔺", visa_student: "📘",
};

interface PaymentBadgeCfg {
  label: string;
  cls:   string;
}
const PAYMENT_BADGE: Record<string, PaymentBadgeCfg> = {
  UNPAID:   { label: "Belum Bayar", cls: "bg-red-50 text-red-700 border-red-200" },
  DP:       { label: "DP Terbayar", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  PAID:     { label: "Lunas",       cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  REFUNDED: { label: "Direfund",    cls: "bg-slate-50 text-slate-500 border-slate-200" },
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  } catch { return iso; }
}

function fmtIDR(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Horizontal step track — desktop */
function StepTrackHorizontal({ steps, current }: { steps: PublicStep[]; current: number }) {
  return (
    <div className="hidden sm:flex items-start justify-between relative">
      {steps.map((step, i) => {
        const done   = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex-1 flex flex-col items-center relative group">
            {i > 0 && (
              <div
                className="absolute top-[14px] h-0.5 -translate-y-px transition-all duration-500"
                style={{
                  left: "-50%", width: "100%",
                  background: done ? "#10b981" : active ? "#3b82f6" : "#e2e8f0",
                }}
              />
            )}
            <div
              className={`relative z-10 h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300 ${
                done   ? "bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-200"
                : active ? "bg-blue-500 border-blue-500 text-white shadow-sm shadow-blue-200 ring-2 ring-blue-200"
                : "bg-white border-slate-200 text-slate-400"
              }`}
            >
              {done   ? <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
               : active ? <span className="text-[11px]">{step.emoji}</span>
               : <span className="text-[9px] tabular-nums">{i + 1}</span>}
            </div>
            <p
              className={`mt-1.5 text-center leading-tight text-[9.5px] ${
                active ? "font-bold text-blue-700" : done ? "font-medium text-emerald-600" : "text-slate-400"
              }`}
              style={{ maxWidth: 56 }}
            >
              {step.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/** Vertical step track — mobile */
function StepTrackVertical({ steps, current }: { steps: PublicStep[]; current: number }) {
  return (
    <div className="sm:hidden flex flex-col gap-0">
      {steps.map((step, i) => {
        const done   = i < current;
        const active = i === current;
        const isLast = i === steps.length - 1;
        return (
          <div key={i} className="flex items-start gap-3 relative">
            {/* Vertical connector */}
            {!isLast && (
              <div className="absolute left-[13px] top-7 w-0.5 h-[calc(100%-4px)]"
                style={{ background: done ? "#10b981" : "#e2e8f0" }}
              />
            )}
            {/* Circle */}
            <div className={`relative z-10 h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300 mt-0.5 ${
              done   ? "bg-emerald-500 border-emerald-500 text-white"
              : active ? "bg-blue-500 border-blue-500 text-white ring-2 ring-blue-200"
              : "bg-white border-slate-200 text-slate-400"
            }`}>
              {done   ? <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
               : active ? <span className="text-[11px]">{step.emoji}</span>
               : <Circle className="h-3 w-3" />}
            </div>
            {/* Label */}
            <div className={`pb-4 min-w-0 ${isLast ? "pb-0" : ""}`}>
              <p className={`text-[12px] leading-tight font-semibold ${
                active ? "text-blue-700" : done ? "text-emerald-700" : "text-slate-400"
              }`}>{step.label}</p>
              {(done || active) && (
                <p className={`text-[11px] mt-0.5 ${active ? "text-blue-500" : "text-slate-400"}`}>
                  {step.sublabel}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Per-Order Card ────────────────────────────────────────────────────────────

function OrderProgressCard({
  order,
  adminWa,
  clientName,
  memberIdStr,
}: {
  order:       PublicOrderData;
  adminWa:     string;
  clientName:  string;
  memberIdStr: string;
}) {
  const [copied,    setCopied]    = useState(false);
  const [expanded,  setExpanded]  = useState(true);

  const steps   = getSteps(order.type);
  const current = Math.min(Math.max(0, order.processStep), steps.length - 1);

  const payBadge  = PAYMENT_BADGE[order.paymentStatus] ?? PAYMENT_BADGE.UNPAID;
  const typeLabel = TYPE_LABEL[order.type] ?? order.type;
  const typeEmoji = TYPE_EMOJI[order.type] ?? "•";

  const orderId = order.id.slice(0, 8).toUpperCase();

  const waMsg = encodeURIComponent(
    `Halo Admin Temantiket! 👋\n\nSaya ${clientName} (${memberIdStr}) ingin menanyakan status pesanan saya.\n\n📦 *${typeLabel}*\n🔖 Order ID: ${orderId}\n📅 Dibuat: ${fmtDate(order.createdAt)}\n\nBisa bantu update statusnya? Terima kasih! ✈️`
  );
  const waUrl = adminWa
    ? `https://wa.me/${adminWa}?text=${waMsg}`
    : `https://wa.me/?text=${waMsg}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(order.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* silent */ }
  };

  const needsAction: string[] = [];
  if (order.paymentStatus === "UNPAID") needsAction.push("Lakukan pembayaran untuk melanjutkan proses pesanan Anda.");
  if (order.paymentStatus === "DP")     needsAction.push("Segera lunasi sisa pembayaran agar proses dapat dilanjutkan.");
  if (order.missingDocs)       needsAction.push(`Dokumen kurang: ${order.missingDocs}`);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">

      {/* ── Card Header ── */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-start gap-3 px-4 py-4 hover:bg-gray-50/80 transition-colors text-left"
      >
        <div className="h-11 w-11 rounded-xl bg-blue-50 border border-blue-100 text-2xl flex items-center justify-center shrink-0 mt-0.5">
          {typeEmoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <p className="text-sm font-bold text-gray-900 leading-tight">
              {order.title || typeLabel}
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${payBadge.cls}`}>
              {payBadge.label}
            </span>
            <span className="text-xs text-gray-400">#{orderId}</span>
            <span className="text-xs text-gray-400">{fmtDate(order.createdAt)}</span>
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-gray-400 shrink-0 mt-1 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100 px-4 py-4 space-y-4">

              {/* ── Current status label ── */}
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full shrink-0 ${current >= steps.length - 1 ? "bg-emerald-500" : "bg-blue-500 animate-pulse"}`} />
                <p className={`text-sm font-bold ${current >= steps.length - 1 ? "text-emerald-700" : "text-blue-700"}`}>
                  {current >= steps.length - 1
                    ? "✅ Proses Selesai"
                    : `📍 ${steps[current]?.label}`}
                </p>
                {order.estimatedCompletion && (
                  <span className="ml-auto flex items-center gap-1 text-[11px] text-slate-500 shrink-0">
                    <CalendarClock className="h-3 w-3" />
                    Est. {order.estimatedCompletion}
                  </span>
                )}
              </div>

              {/* ── Progress track ── */}
              <div className="bg-gray-50 rounded-xl px-3 py-3 border border-gray-100">
                <StepTrackHorizontal steps={steps} current={current} />
                <StepTrackVertical   steps={steps} current={current} />
              </div>

              {/* ── Aksi yang perlu dilakukan ── */}
              {needsAction.length > 0 && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Yang Perlu Kamu Lakukan</p>
                  </div>
                  {needsAction.map((msg, i) => (
                    <p key={i} className="text-xs text-amber-800 leading-relaxed pl-5">{msg}</p>
                  ))}
                </div>
              )}

              {/* ── Catatan dari Admin ── */}
              {order.adminNotes && (
                <div className="rounded-xl bg-blue-50 border border-blue-100 px-3.5 py-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Info className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                    <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Info dari Admin</p>
                  </div>
                  <p className="text-xs text-blue-800 leading-relaxed pl-5">{order.adminNotes}</p>
                </div>
              )}

              {/* ── Payment info row ── */}
              {order.totalPrice > 0 && (
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
                    <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-0.5">Total Harga</p>
                    <p className="text-sm font-bold text-gray-900 leading-tight">{fmtIDR(order.totalPrice)}</p>
                  </div>
                  {order.paidAmount > 0 && (
                    <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
                      <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-0.5">Sudah Dibayar</p>
                      <p className="text-sm font-bold text-emerald-700 leading-tight">{fmtIDR(order.paidAmount)}</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Action buttons ── */}
              <div className="flex gap-2.5">
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1eb858] text-white text-sm font-bold py-2.5 rounded-xl transition-colors"
                >
                  <MessageCircle className="h-4 w-4 shrink-0" />
                  Tanya Admin
                </a>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-600 text-sm font-semibold py-2.5 px-4 rounded-xl transition-colors shrink-0"
                >
                  {copied
                    ? <><Check className="h-3.5 w-3.5 text-emerald-500" /> Tersalin</>
                    : <><Copy className="h-3.5 w-3.5" /> Salin ID</>}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main exported section ─────────────────────────────────────────────────────

export interface PublicOrderProgressSectionProps {
  orders:      PublicOrderData[];
  loading:     boolean;
  adminWa:     string;
  clientName:  string;
  memberIdStr: string;
}

export function PublicOrderProgressSection({
  orders,
  loading,
  adminWa,
  clientName,
  memberIdStr,
}: PublicOrderProgressSectionProps) {
  if (loading) {
    return (
      <section className="rounded-2xl border border-gray-100 bg-white shadow-sm px-5 py-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
            <FileText className="h-4 w-4 text-blue-500" />
          </div>
          <span className="text-base font-bold text-gray-900">Status Pemesanan</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
          <Clock className="h-4 w-4 animate-pulse" />
          Memuat status pesanan…
        </div>
      </section>
    );
  }

  if (orders.length === 0) return null;

  return (
    <section className="space-y-3">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
          <FileText className="h-4 w-4 text-blue-600" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-gray-900 leading-tight">Status Pemesanan</h2>
          <p className="text-xs text-gray-400 mt-0.5">{orders.length} pesanan aktif</p>
        </div>
      </div>

      {/* Cards per order */}
      {orders.map((order) => (
        <OrderProgressCard
          key={order.id}
          order={order}
          adminWa={adminWa}
          clientName={clientName}
          memberIdStr={memberIdStr}
        />
      ))}
    </section>
  );
}
