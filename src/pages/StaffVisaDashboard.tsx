/**
 * StaffVisaDashboard — /staff/visa
 * Shows only the assigned visa berkas list for the staff member.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FileText, AlertTriangle, CheckCircle2,
  Loader2, MessageSquare, ChevronRight, ChevronLeft,
  ArrowUpRight, Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStaffData } from "@/hooks/useStaffData";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: i * 0.07 },
  }),
};

function fmtDate(iso: string) {
  try { return format(new Date(iso), "d MMM yyyy", { locale: idLocale }); } catch { return iso; }
}

function StepBadge({ step, VISA_STEPS }: { step: number; VISA_STEPS: { emoji: string; label: string }[] }) {
  const s = VISA_STEPS[Math.min(step, VISA_STEPS.length - 1)];
  const done = step >= VISA_STEPS.length - 1;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
      done ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"
    }`}>
      {s?.emoji} {s?.label ?? "—"}
    </span>
  );
}

export default function StaffVisaDashboard() {
  const navigate = useNavigate();
  const {
    myOrders, clientMap, orders, patchOrder,
    stats, loading, VISA_STEPS,
  } = useStaffData();

  const [advancing, setAdvancing] = useState<string | null>(null);
  const [goingBack, setGoingBack] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [editingNote, setEditingNote] = useState<string | null>(null);

  async function handleAdvance(orderId: string, currentStep: number) {
    const nextStep = currentStep + 1;
    if (nextStep >= VISA_STEPS.length) return;
    setAdvancing(orderId);
    try {
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;
      await patchOrder(orderId, {
        metadata: {
          ...(order.metadata as Record<string, unknown>),
          processStep: nextStep,
          [`stepUpdatedAt_${nextStep}`]: new Date().toISOString(),
        },
      });
    } finally {
      setAdvancing(null);
    }
  }

  async function handleGoBack(orderId: string, currentStep: number) {
    const prevStep = currentStep - 1;
    if (prevStep < 0) return;
    setGoingBack(orderId);
    try {
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;
      await patchOrder(orderId, {
        metadata: {
          ...(order.metadata as Record<string, unknown>),
          processStep: prevStep,
        },
      });
    } finally {
      setGoingBack(null);
    }
  }

  async function handleSaveNote(orderId: string) {
    setSavingNote(orderId);
    try {
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;
      const note = notes[orderId] ?? "";
      await patchOrder(orderId, {
        metadata: {
          ...(order.metadata as Record<string, unknown>),
          visaKendala: note.trim() || null,
        },
      });
      setEditingNote(null);
    } finally {
      setSavingNote(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Memuat data visa…</span>
      </div>
    );
  }

  return (
    <div className="pb-8 md:p-6 max-w-5xl md:mx-auto space-y-4 md:space-y-5">

      {/* ── Page Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="rounded-2xl md:rounded-3xl bg-white border border-slate-100 shadow-sm p-4 md:p-6"
      >
        <p className="text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 mb-1">
          Visa Saya
        </p>
        <h1 className="text-[18px] md:text-[24px] font-extrabold leading-tight text-slate-900 tracking-tight">
          Berkas Ditugaskan
        </h1>
        <p className="text-[11px] md:text-[12.5px] text-slate-400 mt-1">
          Kelola berkas visa student yang ditugaskan ke kamu.
        </p>
      </motion.div>

      {/* ── Section header ── */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-bold text-slate-700">Daftar Berkas Ditugaskan</h2>
          {myOrders.length > 0 && (
            <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full">
              {myOrders.length}
            </span>
          )}
        </div>
        {stats.kendala > 0 && (
          <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
            <AlertTriangle className="h-3 w-3" /> {stats.kendala} kendala
          </span>
        )}
      </div>

      {/* ── Empty state ── */}
      {myOrders.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="h-16 w-16 rounded-2xl bg-blue-50 flex items-center justify-center">
              <Target className="h-8 w-8 text-blue-300 stroke-[1.25]" />
            </div>
            <div>
              <p className="text-[13px] font-bold text-slate-600">Belum ada berkas ditugaskan</p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-[240px] leading-relaxed">
                Owner akan menugaskan berkas visa student ke kamu dari halaman order.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {[...myOrders]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((order, idx) => {
              const meta = (order.metadata ?? {}) as Record<string, unknown>;
              const currentStep = Number(meta.processStep ?? 0);
              const isDone = currentStep >= VISA_STEPS.length - 1;
              const kendala = (meta.visaKendala as string | null) ?? null;
              const client = clientMap.get(order.clientId ?? "");
              const isEditing = editingNote === order.id;

              return (
                <motion.div
                  key={order.id}
                  custom={idx}
                  variants={fadeUp}
                  initial="hidden"
                  animate="visible"
                  className={`rounded-2xl border bg-white shadow-sm overflow-hidden ${
                    isDone ? "border-emerald-200" : kendala ? "border-amber-200" : "border-slate-100"
                  }`}
                >
                  {/* Card header */}
                  <div className="px-4 pt-4 pb-3 border-b border-slate-50">
                    {/* Name row — name truncates, badge + detail button always visible */}
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-[13px] font-bold text-slate-800 leading-tight truncate flex-1 min-w-0">
                        {client?.name ?? order.title ?? `Order #${order.id.slice(0, 8)}`}
                      </p>
                      <StepBadge step={currentStep} VISA_STEPS={VISA_STEPS} />
                      <button
                        onClick={() => navigate(`/orders/detail/${order.id}`)}
                        className="flex items-center gap-0.5 text-[10.5px] text-blue-600 font-semibold hover:text-blue-800 transition-colors shrink-0"
                      >
                        <ArrowUpRight className="h-3.5 w-3.5 stroke-[2]" />
                      </button>
                    </div>
                    {/* Meta row */}
                    <div className="flex items-center gap-2 mt-1 flex-wrap text-[10px] text-slate-400">
                      {kendala && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                          ⚠️ Kendala
                        </span>
                      )}
                      <span>{fmtDate(order.createdAt)}</span>
                      <span className="font-mono opacity-60">#{order.id.slice(0, 8)}</span>
                      {client?.phone && <span>· {client.phone}</span>}
                      {client?.passportNumber && (
                        <span className="font-mono">· Paspor {client.passportNumber}</span>
                      )}
                    </div>
                  </div>

                  <div className="px-4 py-3 space-y-3">
                    {/* Progress track */}
                    <div className="flex items-center gap-1">
                      {VISA_STEPS.map((step, i) => {
                        const done   = i < currentStep;
                        const active = i === currentStep;
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                            <div className={`h-1.5 w-full rounded-full transition-colors ${
                              done ? "bg-emerald-500" : active ? "bg-blue-500" : "bg-slate-100"
                            }`} />
                            <span className={`text-[8px] text-center leading-tight ${
                              active ? "text-blue-700 font-bold" : done ? "text-emerald-600" : "text-slate-300"
                            }`}>
                              {step.emoji}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Kendala note */}
                    {kendala && !isEditing && (
                      <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-800 flex-1 leading-relaxed">{kendala}</p>
                        <button
                          onClick={() => {
                            setNotes((n) => ({ ...n, [order.id]: kendala }));
                            setEditingNote(order.id);
                          }}
                          className="text-[10px] text-amber-700 font-bold hover:underline shrink-0"
                        >
                          Edit
                        </button>
                      </div>
                    )}

                    {isEditing && (
                      <div className="space-y-2">
                        <textarea
                          autoFocus
                          value={notes[order.id] ?? ""}
                          onChange={(e) => setNotes((n) => ({ ...n, [order.id]: e.target.value }))}
                          placeholder="Tulis kendala / catatan progress di sini…"
                          className="w-full min-h-[72px] rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="h-7 text-[11px] bg-amber-600 hover:bg-amber-700 text-white rounded-lg"
                            disabled={savingNote === order.id}
                            onClick={() => void handleSaveNote(order.id)}
                          >
                            {savingNote === order.id
                              ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              : <MessageSquare className="h-3 w-3 mr-1" />}
                            Simpan Catatan
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px] rounded-lg"
                            onClick={() => setEditingNote(null)}
                          >
                            Batal
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* New note input (no existing kendala) */}
                    {!kendala && !isEditing && (
                      <div className="space-y-2">
                        <textarea
                          value={notes[order.id] ?? ""}
                          onChange={(e) => setNotes((n) => ({ ...n, [order.id]: e.target.value }))}
                          onFocus={() => setEditingNote(order.id)}
                          placeholder="Tulis kendala / catatan progress…"
                          className="w-full min-h-[56px] rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[11.5px] text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-200 resize-none transition-all"
                        />
                      </div>
                    )}

                    {/* Action row */}
                    <div className="flex items-center gap-2 pt-1 border-t border-slate-50">
                      {currentStep > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-[11px] rounded-xl shrink-0 border-slate-200 text-slate-500 hover:bg-slate-50 px-2"
                          disabled={goingBack === order.id}
                          title={`Kembali ke: ${VISA_STEPS[currentStep - 1]?.label}`}
                          onClick={() => void handleGoBack(order.id, currentStep)}
                        >
                          {goingBack === order.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <ChevronLeft className="h-3 w-3" />
                          }
                        </Button>
                      )}
                      {!isDone ? (
                        <Button
                          size="sm"
                          className="h-8 text-[11px] bg-blue-600 hover:bg-blue-700 text-white flex-1 min-w-0 rounded-xl"
                          disabled={advancing === order.id}
                          onClick={() => void handleAdvance(order.id, currentStep)}
                        >
                          {advancing === order.id ? (
                            <Loader2 className="h-3 w-3 animate-spin shrink-0 mr-1" />
                          ) : (
                            <ChevronRight className="h-3 w-3 shrink-0 mr-1" />
                          )}
                          <span className="truncate">
                            {VISA_STEPS[currentStep + 1]?.emoji}{" "}
                            {VISA_STEPS[currentStep + 1]?.label ?? "Selesai"}
                          </span>
                        </Button>
                      ) : (
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 flex-1 min-w-0">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">Visa Terbit — Selesai</span>
                        </div>
                      )}
                      {!isEditing && (
                        <Button
                          size="sm"
                          variant="outline"
                          className={`h-8 text-[11px] rounded-xl shrink-0 gap-1 ${
                            kendala
                              ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                              : "border-slate-200 text-slate-600"
                          }`}
                          onClick={() => {
                            setNotes((n) => ({ ...n, [order.id]: (meta.visaKendala as string) ?? "" }));
                            setEditingNote(order.id);
                          }}
                        >
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          {kendala ? "Edit" : "Kendala"}
                        </Button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
        </div>
      )}

      {/* ── Completion tip ── */}
      {myOrders.length > 0 && stats.selesai > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-[11px] text-emerald-700">
          <FileText className="h-4 w-4 shrink-0" />
          <span>
            <strong>{stats.selesai}</strong> dari <strong>{stats.total}</strong> berkas sudah selesai. Lihat komisi kamu di{" "}
            <button
              className="font-bold underline underline-offset-2"
              onClick={() => navigate("/staff/commission")}
            >
              Komisi Saya
            </button>.
          </span>
        </div>
      )}
    </div>
  );
}
