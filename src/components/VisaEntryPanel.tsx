/**
 * VisaEntryPanel — Panel pelaksana visa student di OrderDetail
 *
 * Fitur:
 * - Owner: assign staff pelaksana ke order visa student
 * - Owner: catat komisi Rp 200.000 ke wallet pelaksana saat selesai
 * - Pelaksana: update progress step & catat kendala
 * - Semua: lihat progress tracker real-time
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Users, CheckCircle2, AlertTriangle, ChevronRight,
  Loader2, MessageSquare, Wallet, UserCheck, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuthStore } from "@/store/authStore";
import { useOrdersStore } from "@/store/ordersStore";
import { ORDER_PROCESS_STEPS } from "@/components/OrderProgressTracker";
import { addWalletTx } from "@/lib/agentWallet";
import { fmtIDR } from "@/lib/profit";
import { toast } from "sonner";
import type { Order } from "@/features/orders/ordersRepo";

const VISA_STEPS = ORDER_PROCESS_STEPS["visa_student"];
const PELAKSANA_FEE = 200_000;

interface Props {
  order: Order;
  onMetaChange: (meta: Record<string, unknown>) => void;
}

export function VisaEntryPanel({ order, onMetaChange }: Props) {
  const user = useAuthStore((s) => s.user);
  const listMembers = useAuthStore((s) => s.listMembers);
  const { patchOrder } = useOrdersStore();

  const [staffMembers, setStaffMembers] = useState<{ userId: string; displayName: string; email: string }[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [creditingFee, setCreditingFee] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState("");

  const isOwner = user?.role === "owner";
  const meta = (order.metadata ?? {}) as Record<string, unknown>;
  const currentStep = Number(meta.processStep ?? 0);
  const pelaksanaId = (meta.pelaksanaId as string | null) ?? null;
  const kendala = (meta.visaKendala as string | null) ?? null;
  const feeCredited = !!(meta.pelaksanaFeeCredited as boolean | null);
  const isDone = currentStep >= VISA_STEPS.length - 1;

  const isPelaksana = user?.id === pelaksanaId;
  const canAdvance = (isOwner || isPelaksana) && !isDone;

  useEffect(() => {
    if (!isOwner) return;
    setLoadingMembers(true);
    void listMembers().then((members) => {
      setStaffMembers(
        members.filter((m) => m.role === "staff").map((m) => ({
          userId: m.userId,
          displayName: m.displayName,
          email: m.email,
        })),
      );
      setLoadingMembers(false);
    });
  }, [isOwner]); // eslint-disable-line react-hooks/exhaustive-deps

  const assignedStaff = useMemo(
    () => staffMembers.find((s) => s.userId === pelaksanaId),
    [staffMembers, pelaksanaId],
  );

  async function handleAssign(staffId: string) {
    setAssigning(true);
    try {
      const newMeta = { ...meta, pelaksanaId: staffId === "__none" ? null : staffId };
      await patchOrder(order.id, { metadata: newMeta });
      onMetaChange(newMeta);
      toast.success(staffId === "__none" ? "Pelaksana dilepas" : "Pelaksana berhasil di-assign!");
    } catch {
      toast.error("Gagal assign pelaksana.");
    } finally {
      setAssigning(false);
    }
  }

  async function handleAdvance() {
    const nextStep = currentStep + 1;
    if (nextStep >= VISA_STEPS.length) return;
    setAdvancing(true);
    try {
      const newMeta = {
        ...meta,
        processStep: nextStep,
        [`stepUpdatedAt_${nextStep}`]: new Date().toISOString(),
      };
      await patchOrder(order.id, { metadata: newMeta });
      onMetaChange(newMeta);
      toast.success(`Progress: ${VISA_STEPS[nextStep]?.label}`);
    } catch {
      toast.error("Gagal update progress.");
    } finally {
      setAdvancing(false);
    }
  }

  async function handleSaveNote() {
    setSavingNote(true);
    try {
      const newMeta = { ...meta, visaKendala: noteText.trim() || null };
      await patchOrder(order.id, { metadata: newMeta });
      onMetaChange(newMeta);
      setEditingNote(false);
      toast.success("Catatan disimpan.");
    } catch {
      toast.error("Gagal simpan catatan.");
    } finally {
      setSavingNote(false);
    }
  }

  async function handleCreditFee() {
    if (!pelaksanaId) return;
    setCreditingFee(true);
    try {
      addWalletTx(pelaksanaId, {
        agentId: pelaksanaId,
        type: "order_bonus",
        pointsDelta: 0,
        amountIDR: PELAKSANA_FEE,
        description: `Komisi berkas Visa Student #${order.id.slice(0, 8)}${order.title ? ` — ${order.title}` : ""}`,
        createdBy: user?.id ?? "owner",
      });
      const newMeta = { ...meta, pelaksanaFeeCredited: true };
      await patchOrder(order.id, { metadata: newMeta });
      onMetaChange(newMeta);
      toast.success(`Komisi ${fmtIDR(PELAKSANA_FEE)} berhasil dikreditkan ke wallet pelaksana!`, {
        duration: 5000,
      });
    } catch {
      toast.error("Gagal catat komisi.");
    } finally {
      setCreditingFee(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl border border-indigo-100 bg-white overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-indigo-100 bg-indigo-50 flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg bg-indigo-100 flex items-center justify-center">
          <Users className="h-3.5 w-3.5 text-indigo-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-indigo-900">Pelaksana Visa Entry</p>
          <p className="text-[11px] text-indigo-600">Tracking progress berkas ke kedutaan</p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Assign Pelaksana — owner only */}
        {isOwner && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Assign Pelaksana
            </p>
            <div className="flex items-center gap-2">
              <Select
                value={pelaksanaId ?? "__none"}
                onValueChange={(v) => void handleAssign(v)}
                disabled={assigning || loadingMembers}
              >
                <SelectTrigger className="flex-1 h-9 text-[12px]">
                  <SelectValue placeholder="Pilih staff pelaksana…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Belum ditugaskan —</SelectItem>
                  {staffMembers.map((s) => (
                    <SelectItem key={s.userId} value={s.userId}>
                      {s.displayName} <span className="text-muted-foreground text-[10px]">({s.email})</span>
                    </SelectItem>
                  ))}
                  {staffMembers.length === 0 && !loadingMembers && (
                    <SelectItem value="__empty" disabled>
                      Belum ada staff terdaftar
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {assigning && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
            </div>
            {assignedStaff && (
              <div className="flex items-center gap-1.5 text-[11px] text-indigo-700 font-medium">
                <UserCheck className="h-3.5 w-3.5" />
                Ditugaskan ke: <span className="font-bold">{assignedStaff.displayName}</span>
              </div>
            )}
          </div>
        )}

        {/* Tidak ada pelaksana — info saja */}
        {!pelaksanaId && !isOwner && (
          <div className="rounded-xl bg-muted/30 border px-3 py-2.5 text-[11px] text-muted-foreground">
            Belum ada pelaksana yang ditugaskan untuk berkas ini.
          </div>
        )}

        {/* Progress Tracker */}
        {pelaksanaId && (
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Progress Berkas
            </p>

            {/* Step track visual */}
            <div className="flex items-start gap-1">
              {VISA_STEPS.map((step, i) => {
                const done = i < currentStep;
                const active = i === currentStep;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className={`h-1.5 w-full rounded-full transition-all ${
                      done ? "bg-emerald-500" : active ? "bg-indigo-500" : "bg-muted/40"
                    }`} />
                    <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs border-2 transition-all ${
                      done
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : active
                        ? "bg-indigo-500 border-indigo-500 text-white shadow-sm"
                        : "bg-white border-slate-200 text-slate-400"
                    }`}>
                      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="text-[9px]">{step.emoji}</span>}
                    </div>
                    <p className={`text-center text-[8.5px] leading-tight ${
                      active ? "text-indigo-700 font-bold" : done ? "text-emerald-600 font-medium" : "text-slate-400"
                    }`} style={{ maxWidth: 48 }}>
                      {step.label}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Status baris */}
            <div className={`rounded-xl px-3 py-2 text-[12px] font-semibold flex items-center gap-2 ${
              isDone ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-indigo-50 border border-indigo-200 text-indigo-700"
            }`}>
              {isDone
                ? <><CheckCircle2 className="h-4 w-4" /> Visa Terbit — Proses Selesai</>
                : <><ChevronRight className="h-4 w-4" /> {VISA_STEPS[currentStep]?.label} → {VISA_STEPS[currentStep + 1]?.label ?? "Selesai"}</>
              }
            </div>

            {/* Advance button */}
            {canAdvance && (
              <Button
                size="sm"
                className="w-full h-9 text-[12px] bg-indigo-600 hover:bg-indigo-700 text-white"
                disabled={advancing}
                onClick={() => void handleAdvance()}
              >
                {advancing
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  : <ChevronRight className="h-3.5 w-3.5 mr-1.5" />
                }
                Lanjut ke: {VISA_STEPS[currentStep + 1]?.label}
              </Button>
            )}
          </div>
        )}

        {/* Kendala / Catatan */}
        {pelaksanaId && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Kendala / Catatan
              </p>
              {!editingNote && (isOwner || isPelaksana) && (
                <button
                  onClick={() => {
                    setNoteText(kendala ?? "");
                    setEditingNote(true);
                  }}
                  className="text-[10px] font-semibold text-primary hover:underline"
                >
                  {kendala ? "Edit" : "+ Tambah"}
                </button>
              )}
            </div>

            {editingNote ? (
              <div className="space-y-2">
                <textarea
                  autoFocus
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Tulis kendala atau catatan progress di sini…"
                  className="w-full min-h-[80px] rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 text-[11px] bg-amber-600 hover:bg-amber-700 text-white"
                    disabled={savingNote}
                    onClick={() => void handleSaveNote()}
                  >
                    {savingNote ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <MessageSquare className="h-3 w-3 mr-1" />}
                    Simpan
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setEditingNote(false)}>
                    <X className="h-3 w-3 mr-1" /> Batal
                  </Button>
                </div>
              </div>
            ) : kendala ? (
              <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-800">{kendala}</p>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground italic">Tidak ada kendala dicatat.</p>
            )}
          </div>
        )}

        {/* Kredit Komisi — owner only, setelah ada pelaksana */}
        {isOwner && pelaksanaId && (
          <div className="border-t pt-3 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Komisi Pelaksana
            </p>
            {feeCredited ? (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-[12px] font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Komisi {fmtIDR(PELAKSANA_FEE)} sudah dikreditkan ke wallet pelaksana
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground">
                  Fee pelaksana lapangan: <span className="font-bold text-indigo-700">{fmtIDR(PELAKSANA_FEE)}/berkas</span>
                </p>
                <Button
                  size="sm"
                  className="w-full h-9 text-[12px] bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={creditingFee}
                  onClick={() => void handleCreditFee()}
                >
                  {creditingFee
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    : <Wallet className="h-3.5 w-3.5 mr-1.5" />
                  }
                  Kredit Komisi {fmtIDR(PELAKSANA_FEE)} ke Wallet Pelaksana
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
