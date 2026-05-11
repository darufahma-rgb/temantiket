/**
 * OrderProgressTracker — visual step-by-step transaction progress per product type.
 *
 * Uses UNIFIED_ORDER_STEPS from orderProgress.ts — the single source of truth.
 * Admin and public pages both read metadata.processStep with the same step array,
 * so the displayed step is always identical.
 */

import { CheckCircle2, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UNIFIED_ORDER_STEPS, getStepsForType } from "@/lib/orderProgress";
import type { OrderStep } from "@/lib/orderProgress";

// Re-export for backwards-compat with existing imports
export type { OrderStep as ProcessStep };
export const ORDER_PROCESS_STEPS = UNIFIED_ORDER_STEPS;

export function OrderProgressTracker({
  type,
  currentStep = 0,
  onAdvance,
  onGoBack,
  isAdvancing = false,
  readOnly = false,
}: {
  type: string;
  currentStep?: number;
  onAdvance?: () => void;
  onGoBack?: () => void;
  isAdvancing?: boolean;
  readOnly?: boolean;
}) {
  const steps = getStepsForType(type);
  const safeStep = Math.min(Math.max(0, currentStep), steps.length - 1);
  const isComplete = safeStep >= steps.length - 1;
  const canAdvance = !readOnly && !isComplete && !!onAdvance;
  const canGoBack  = !readOnly && safeStep > 0 && !!onGoBack;
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
              {i > 0 && (
                <div
                  className="absolute top-[13px] h-0.5 -translate-y-px"
                  style={{
                    left: "-50%",
                    width: "100%",
                    background: done || active ? (done ? "#10b981" : "#0ea5e9") : "#e2e8f0",
                  }}
                />
              )}

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
            {isComplete ? "✅ Proses Selesai" : `📍 ${currentLabel}`}
          </p>
          {!isComplete && nextLabel && !readOnly && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Berikutnya: {nextLabel}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {canGoBack && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] px-2 border-slate-200 text-slate-500"
              onClick={onGoBack}
              disabled={isAdvancing}
            >
              ← Mundur
            </Button>
          )}

          {canAdvance && (
            <Button
              size="sm"
              className="h-7 text-[11px] px-2.5 bg-sky-600 hover:bg-sky-700 text-white"
              disabled={isAdvancing}
              onClick={onAdvance}
            >
              {isAdvancing ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 mr-0.5" />
              )}
              {nextLabel ?? ""}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
