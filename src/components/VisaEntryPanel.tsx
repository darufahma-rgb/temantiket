/**
 * VisaEntryPanel — Panel pelaksana visa student di OrderDetail
 *
 * Fitur:
 * - Owner: assign pelaksana lapangan (semua member, bukan hanya staff)
 * - Owner: set fee pelaksana manual (default Rp 200.000)
 * - Owner: kredit fee pelaksana ke wallet setelah selesai
 * - Pelaksana: update progress step & catat kendala
 * - Tampilan terpisah: Agen Penjual vs Pelaksana Lapangan
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Users, CheckCircle2, AlertTriangle, ChevronRight, ChevronLeft,
  Loader2, MessageSquare, Wallet, UserCheck, X,
  BadgeDollarSign, Edit2, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuthStore } from "@/store/authStore";
import { useOrdersStore } from "@/store/ordersStore";
import { ORDER_PROCESS_STEPS } from "@/components/OrderProgressTracker";
import { fmtIDR } from "@/lib/profit";
import { toast } from "sonner";
import type { Order } from "@/features/orders/ordersRepo";

const VISA_STEPS = ORDER_PROCESS_STEPS["visa_student"];
const DEFAULT_PELAKSANA_FEE = 200_000;

interface Props {
  order: Order;
  onMetaChange: (meta: Record<string, unknown>) => void;
}

export function VisaEntryPanel({ order, onMetaChange }: Props) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const listMembers = useAuthStore((s) => s.listMembers);
  const { patchOrder } = useOrdersStore();

  const [allMembers, setAllMembers] = useState<{ userId: string; displayName: string; email: string; role: string }[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [editingFee, setEditingFee] = useState(false);
  const [feeInput, setFeeInput] = useState("");

  const isOwner = user?.role === "owner";
  const isStaff = user?.role === "staff";
  const meta = (order.metadata ?? {}) as Record<string, unknown>;
  const currentStep = Number(meta.processStep ?? 0);
  const pelaksanaId = (meta.pelaksanaId as string | null) ?? null;
  const kendala = (meta.visaKendala as string | null) ?? null;
  const feeCredited = !!(meta.pelaksanaFeeCredited as boolean | null);
  const pelaksanaFee = Number(meta.pelaksanaFee ?? DEFAULT_PELAKSANA_FEE);
  const isDone = currentStep >= VISA_STEPS.length - 1;

  // Hanya tampilkan "Agen Penjual" + "Fee Agen" jika createdByAgent benar-benar berperan "agent".
  // Owner/staff yang di-set sebagai referral source TIDAK dihitung sebagai penerima komisi.
  const isRealAgentCreator = useMemo(
    () => !!order.createdByAgent && allMembers.some(
      (m) => m.userId === order.createdByAgent && m.role === "agent",
    ),
    [order.createdByAgent, allMembers],
  );

  const isPelaksana = user?.id === pelaksanaId;
  const canAdvance = (isOwner || isPelaksana) && !isDone;

  useEffect(() => {
    setLoadingMembers(true);
    void listMembers().then((members) => {
      setAllMembers(
        members.map((m) => ({
          userId: m.userId,
          displayName: m.displayName,
          email: m.email,
          role: m.role,
        })),
      );
      setLoadingMembers(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const assignedPelaksana = useMemo(
    () => allMembers.find((s) => s.userId === pelaksanaId),
    [allMembers, pelaksanaId],
  );

  async function handleAssign(memberId: string) {
    setAssigning(true);
    try {
      const newMeta = {
        ...meta,
        pelaksanaId: memberId === "__none" ? null : memberId,
      };
      await patchOrder(order.id, { metadata: newMeta });
      onMetaChange(newMeta);
      toast.success(memberId === "__none" ? "Pelaksana dilepas" : "Pelaksana lapangan berhasil di-assign!");
    } catch {
      toast.error("Gagal assign pelaksana.");
    } finally {
      setAssigning(false);
    }
  }

  async function handleSaveFee() {
    const fee = Number(feeInput);
    if (!fee || fee < 0) { toast.error("Nominal fee tidak valid."); return; }
    try {
      const newMeta = { ...meta, pelaksanaFee: fee };
      await patchOrder(order.id, { metadata: newMeta });
      onMetaChange(newMeta);
      setEditingFee(false);
      toast.success(`Fee Pelaksana diperbarui: ${fmtIDR(fee)}`);
    } catch {
      toast.error("Gagal simpan fee.");
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

  const [goingBack, setGoingBack] = useState(false);
  async function handleGoBack() {
    const prevStep = currentStep - 1;
    if (prevStep < 0) return;
    setGoingBack(true);
    try {
      const newMeta = { ...meta, processStep: prevStep };
      await patchOrder(order.id, { metadata: newMeta });
      onMetaChange(newMeta);
      toast.success(`Kembali ke: ${VISA_STEPS[prevStep]?.label}`);
    } catch {
      toast.error("Gagal mundur fase.");
    } finally {
      setGoingBack(false);
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

  const roleLabel: Record<string, string> = {
    owner: "Owner",
    staff: "Staff",
    agent: "Agen",
  };

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
          <p className="text-sm font-semibold text-indigo-900">Visa Student Entry — Pelaksana & Progress</p>
          <p className="text-[11px] text-indigo-600">Komisi agen & fee pelaksana dicatat terpisah</p>
        </div>
      </div>

      <div className="p-4 space-y-5">

        {/* ── Agen Penjual (hanya tampil jika createdByAgent = member role "agent") ── */}
        {isRealAgentCreator && (
          <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2.5 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-sky-700">Agen Penjual</p>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <button
                className="text-[12px] font-semibold text-sky-900 hover:text-sky-600 hover:underline flex items-center gap-1 text-left"
                onClick={() => navigate(`/agents/${order.createdByAgent}`)}
                title="Buka profil agen"
              >
                {allMembers.find((m) => m.userId === order.createdByAgent)?.displayName
                  ?? order.createdByAgent?.slice(0, 8) ?? "—"}
                <ExternalLink className="h-2.5 w-2.5 opacity-60" />
              </button>
              {/* Fee Agen hanya tampil jika benar-benar agen (bukan owner/staff) dan bukan view staff */}
              {!isStaff && (
                <span className="text-[11px] font-mono font-bold text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full">
                  Fee Agen: {fmtIDR(Number((meta.agentFee as number | null) ?? 0))}
                </span>
              )}
            </div>
            <p className="text-[10px] text-sky-600 italic">
              Komisi agen dicatat terpisah di wallet agen saat status → Selesai.
            </p>
          </div>
        )}

        {/* ── Assign Pelaksana Lapangan — owner only ──────────────────── */}
        {isOwner && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Pelaksana Lapangan
            </p>
            <div className="flex items-center gap-2">
              <Select
                value={pelaksanaId ?? "__none"}
                onValueChange={(v) => void handleAssign(v)}
                disabled={assigning || loadingMembers}
              >
                <SelectTrigger className="flex-1 h-9 text-[12px]">
                  <SelectValue placeholder="Pilih pelaksana lapangan…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Belum ditugaskan —</SelectItem>
                  {allMembers.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.displayName}
                      <span className="text-muted-foreground text-[10px] ml-1">
                        ({roleLabel[m.role] ?? m.role} · {m.email})
                      </span>
                    </SelectItem>
                  ))}
                  {allMembers.length === 0 && !loadingMembers && (
                    <SelectItem value="__empty" disabled>
                      Belum ada member terdaftar
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {assigning && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
            </div>
            {assignedPelaksana && (
              <div className="flex items-center gap-1.5 text-[11px] text-indigo-700 font-medium flex-wrap">
                <UserCheck className="h-3.5 w-3.5 shrink-0" />
                Ditugaskan ke:
                <button
                  className="font-bold hover:underline hover:text-indigo-900 flex items-center gap-0.5"
                  onClick={() => pelaksanaId && navigate(`/staff/${pelaksanaId}`)}
                  title="Buka profil pelaksana"
                >
                  {assignedPelaksana.displayName}
                  <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                </button>
                <span className="text-[10px] text-muted-foreground">({roleLabel[assignedPelaksana.role] ?? assignedPelaksana.role})</span>
              </div>
            )}
          </div>
        )}

        {/* Non-owner: tampilkan info pelaksana jika ada */}
        {!isOwner && pelaksanaId && isPelaksana && (
          <div className="rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-2.5">
            <p className="text-[11px] font-bold text-indigo-800">Anda adalah Pelaksana Lapangan berkas ini.</p>
          </div>
        )}

        {!pelaksanaId && !isOwner && (
          <div className="rounded-xl bg-muted/30 border px-3 py-2.5 text-[11px] text-muted-foreground">
            Belum ada pelaksana lapangan yang ditugaskan untuk berkas ini.
          </div>
        )}

        {/* ── Fee Pelaksana Visa — owner configures ──────────────────── */}
        {isOwner && pelaksanaId && (
          <div className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wide text-violet-700">
                Fee Pelaksana Visa
              </p>
              {!editingFee && !feeCredited && (
                <button
                  onClick={() => { setFeeInput(String(pelaksanaFee)); setEditingFee(true); }}
                  className="text-[10px] font-semibold text-violet-700 hover:underline flex items-center gap-0.5"
                >
                  <Edit2 className="h-2.5 w-2.5" /> Edit
                </button>
              )}
            </div>
            {editingFee ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={feeInput}
                  onChange={(e) => setFeeInput(e.target.value)}
                  className="h-8 text-[12px] flex-1"
                  placeholder="Nominal fee IDR"
                />
                <Button size="sm" className="h-8 text-[11px] bg-violet-600 hover:bg-violet-700 text-white" onClick={() => void handleSaveFee()}>
                  Simpan
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => setEditingFee(false)}>
                  Batal
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-extrabold font-mono text-violet-800">{fmtIDR(pelaksanaFee)}</span>
                <span className="text-[10px] text-violet-600">per berkas</span>
              </div>
            )}
          </div>
        )}

        {/* ── Progress Tracker ──────────────────────────────────────── */}
        {pelaksanaId && (
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Status Visa / Progress Berkas
            </p>

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

            <div className={`rounded-xl px-3 py-2 text-[12px] font-semibold flex items-center gap-2 ${
              isDone ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-indigo-50 border border-indigo-200 text-indigo-700"
            }`}>
              {isDone
                ? <><CheckCircle2 className="h-4 w-4" /> Visa Terbit — Proses Selesai</>
                : <><ChevronRight className="h-4 w-4" /> {VISA_STEPS[currentStep]?.label} → {VISA_STEPS[currentStep + 1]?.label ?? "Selesai"}</>
              }
            </div>

            <div className="flex gap-2">
              {(isOwner || isPelaksana) && currentStep > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 text-[12px] text-slate-600 border-slate-300 hover:bg-slate-50 shrink-0"
                  disabled={goingBack}
                  onClick={() => void handleGoBack()}
                  title={`Kembali ke: ${VISA_STEPS[currentStep - 1]?.label}`}
                >
                  {goingBack
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <ChevronLeft className="h-3.5 w-3.5" />
                  }
                </Button>
              )}
              {canAdvance && (
                <Button
                  size="sm"
                  className="flex-1 h-9 text-[12px] bg-indigo-600 hover:bg-indigo-700 text-white"
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
          </div>
        )}

        {/* ── Kendala / Catatan ──────────────────────────────────────── */}
        {pelaksanaId && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Kendala
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

        {/* ── Status Komisi Pelaksana — otomatis dikreditkan saat Completed ─── */}
        {isOwner && pelaksanaId && (
          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <BadgeDollarSign className="h-3.5 w-3.5 text-emerald-600" />
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Komisi Pelaksana
              </p>
            </div>
            {feeCredited ? (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-[12px] font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Fee Pelaksana {fmtIDR(pelaksanaFee)} sudah dikreditkan ke wallet pelaksana
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl bg-violet-50 border border-violet-200 px-3 py-2.5">
                <Wallet className="h-4 w-4 text-violet-500 shrink-0" />
                <p className="text-[11px] text-violet-700">
                  Fee pelaksana{" "}
                  <span className="font-bold">{fmtIDR(pelaksanaFee)}</span>{" "}
                  akan dikreditkan otomatis ke wallet pelaksana saat status order → <span className="font-bold">Selesai</span>.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
