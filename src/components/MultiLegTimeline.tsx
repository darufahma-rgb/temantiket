import { Plane } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MultiLegStop {
  fromCode: string;
  fromCity?: string | null;
  toCode: string;
  toCity?: string | null;
  etd?: string | null;
  eta?: string | null;
  flightNumber?: string | null;
  date?: string | null;
}

interface MultiLegTimelineProps {
  legs: MultiLegStop[];
  label?: "Berangkat" | "Pulang";
  accentColor?: string;
}

export function MultiLegTimeline({
  legs,
  label,
  accentColor = "#1a56a8",
}: MultiLegTimelineProps) {
  if (!legs.length) return null;
  const last = legs[legs.length - 1];
  const labelColor = label === "Pulang" ? "text-violet-600" : "text-[#1a56a8]";
  const resolvedAccent = label === "Pulang" ? "#7c3aed" : accentColor;

  return (
    <div>
      {label && (
        <div className="flex items-center gap-2 mb-2">
          <p className={cn("text-[9px] font-bold uppercase tracking-widest", labelColor)}>
            {label === "Pulang" ? "↩ " : "↗ "}{label}
          </p>
          {legs[0]?.date && (
            <span className="text-[9px] text-slate-400 ml-auto">{legs[0].date}</span>
          )}
        </div>
      )}

      <div className="flex gap-3">
        {/* Spine */}
        <div className="flex flex-col items-center w-4 shrink-0 pt-0.5">
          <div
            className="h-3 w-3 rounded-full border-2 bg-white shrink-0"
            style={{ borderColor: resolvedAccent, borderStyle: "dashed" }}
          />
          {legs.map((_, i) => (
            <div key={i} className="flex flex-col items-center">
              <div className="w-px h-4 bg-slate-200" />
              {i < legs.length - 1 ? (
                <div className="h-2 w-2 rounded-full bg-amber-400 border border-amber-300 shrink-0" />
              ) : (
                <Plane
                  className="w-3 h-3 shrink-0"
                  style={{ color: resolvedAccent, transform: "rotate(90deg)" }}
                />
              )}
            </div>
          ))}
          <div className="w-px h-4 bg-slate-200" />
          <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: resolvedAccent }} />
        </div>

        {/* Text column */}
        <div className="flex-1 min-w-0 py-0.5 space-y-2">
          {/* Origin */}
          <div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <p className="font-bold text-[14px] text-slate-900 leading-none">
                {legs[0]?.fromCity || legs[0]?.fromCode}
              </p>
              {legs[0]?.etd && (
                <span className="text-[11px] font-bold tabular-nums" style={{ color: resolvedAccent }}>
                  {legs[0].etd}
                </span>
              )}
            </div>
            {legs[0]?.fromCity && (
              <p className="text-[9.5px] text-slate-400 leading-tight">{legs[0].fromCode}</p>
            )}
          </div>

          {/* Transit stops */}
          {legs.slice(0, -1).map((leg, i) => (
            <div key={i}>
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <p className="font-semibold text-[12px] text-amber-700 leading-none">
                  {leg.toCity || leg.toCode}
                </p>
                <span className="text-[8.5px] text-amber-500 font-semibold">transit</span>
                {leg.flightNumber && (
                  <span className="text-[8.5px] font-mono text-slate-400">{leg.flightNumber}</span>
                )}
              </div>
              {leg.toCity && (
                <p className="text-[9px] text-slate-400 leading-tight">{leg.toCode}</p>
              )}
            </div>
          ))}

          {/* Destination */}
          <div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <p className="font-bold text-[14px] text-slate-900 leading-none">
                {last?.toCity || last?.toCode}
              </p>
              {last?.eta && (
                <span className="text-[11px] font-bold tabular-nums" style={{ color: resolvedAccent }}>
                  {last.eta}
                </span>
              )}
            </div>
            {last?.toCity && (
              <p className="text-[9.5px] text-slate-400 leading-tight">{last.toCode}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
