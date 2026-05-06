/**
 * OrderProgressTracker — visual step-by-step transaction progress per product type.
 *
 * Steps per product:
 *  - flight      : Booking → Issued → Pembayaran Selesai
 *  - visa_student: Berkas Dikirim → Berkas Lengkap → Masuk Kedutaan → Proses Visa → Visa Terbit
 *  - visa_voa    : Berkas Masuk → OK to Board → Mendekati Keberangkatan → Selesai
 *  - umrah       : Pendaftaran → Dokumen Lengkap → Pelunasan → Keberangkatan → Selesai
 *
 * Stored in order.metadata.processStep (0-based index).
 */

import { CheckCircle2, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ProcessStep {
  label: string;
  emoji: string;
}

export const ORDER_PROCESS_STEPS: Record<string, ProcessStep[]> = {
  flight: [
    { label: "Booking",             emoji: "📋" },
    { label: "Tiket Issued",        emoji: "🎫" },
    { label: "Selesai",             emoji: "✅" },
  ],
  visa_student: [
    { label: "Berkas Dikirim",      emoji: "📤" },
    { label: "Berkas Lengkap",      emoji: "📁" },
    { label: "Masuk Kedutaan",      emoji: "🏛️" },
    { label: "Proses Visa",         emoji: "⏳" },
    { label: "Visa Terbit",         emoji: "🎉" },
  ],
  visa_voa: [
    { label: "Berkas Masuk",        emoji: "📥" },
    { label: "OK to Board",         emoji: "🟢" },
    { label: "Mendekati\nBerangkat", emoji: "✈️" },
    { label: "Selesai",             emoji: "✅" },
  ],
  umrah: [
    { label: "Pendaftaran",         emoji: "📝" },
    { label: "Dok. Lengkap",        emoji: "📁" },
    { label: "Pelunasan",           emoji: "💳" },
    { label: "Keberangkatan",       emoji: "✈️" },
    { label: "Selesai",             emoji: "🕋" },
  ],
};

export function OrderProgressTracker({
  type,
  currentStep = 0,
  onAdvance,
  isAdvancing = false,
  readOnly = false,
}: {
  type: string;
  currentStep?: number;
  onAdvance?: () => void;
  isAdvancing?: boolean;
  readOnly?: boolean;
}) {
  const steps = ORDER_PROCESS_STEPS[type] ?? ORDER_PROCESS_STEPS.umrah;
  const safeStep = Math.min(Math.max(0, currentStep), steps.length - 1);
  const isComplete = safeStep >= steps.length - 1;
  const canAdvance = !readOnly && !isComplete && !!onAdvance;
  const currentLabel = steps[safeStep]?.label ?? "";
  const nextLabel = !isComplete ? steps[safeStep + 1]?.label : null;

  return (
    <div className="space-y-2.5">
      {/* ── Step track ── */}
      <div className="flex items-start justify-between relative">
        {steps.map((step, i) => {
          const done   = i < safeStep;
          const active = i === safeStep;
          return (
            <div key={i} className="flex-1 flex flex-col items-center relative">
              {/* Connector line — spans from center of previous to center of this */}
              {i > 0 && (
                <div
                  className={`absolute top-[13px] h-0.5 -translate-y-px`}
                  style={{
                    left: "-50%",
                    width: "100%",
                    background: done || active ? (done ? "#10b981" : "#0ea5e9") : "#e2e8f0",
                  }}
                />
              )}

              {/* Circle */}
              <div
                className={`relative z-10 h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300 ${
                  done
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : active
                    ? "bg-sky-500 border-sky-500 text-white shadow-sm shadow-sky-200"
                    : "bg-white border-slate-200 text-slate-400"
                }`}
              >
                {done ? (
                  <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                ) : active ? (
                  <span className="text-[11px] leading-none">{step.emoji}</span>
                ) : (
                  <span className="text-[9px]">{i + 1}</span>
                )}
              </div>

              {/* Label */}
              <p
                className={`mt-1 text-center leading-tight whitespace-pre-line ${
                  active
                    ? "text-[9.5px] font-bold text-sky-700"
                    : done
                    ? "text-[9.5px] font-medium text-emerald-600"
                    : "text-[9px] text-slate-400"
                }`}
                style={{ maxWidth: 52 }}
              >
                {step.label}
              </p>
            </div>
          );
        })}
      </div>

      {/* ── Status + action row ── */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="min-w-0">
          <p className={`text-[11px] font-semibold leading-tight ${isComplete ? "text-emerald-700" : "text-sky-700"}`}>
            {isComplete ? "✅ Proses Selesai" : `📍 ${currentLabel.replace("\n", " ")}`}
          </p>
          {!isComplete && nextLabel && !readOnly && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Berikutnya: {nextLabel.replace("\n", " ")}
            </p>
          )}
        </div>

        {canAdvance && (
          <Button
            size="sm"
            className="h-7 text-[11px] px-2.5 shrink-0 bg-sky-600 hover:bg-sky-700 text-white"
            disabled={isAdvancing}
            onClick={onAdvance}
          >
            {isAdvancing ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 mr-0.5" />
            )}
            {(nextLabel ?? "").replace("\n", " ")}
          </Button>
        )}
      </div>
    </div>
  );
}
