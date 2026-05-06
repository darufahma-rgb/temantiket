import { Plane } from "lucide-react";
import { cn } from "@/lib/utils";

interface Stop {
  code: string;
  city?: string | null;
  airport?: string | null;
  time?: string | null;
}

interface Transit {
  code: string;
  city?: string | null;
  duration?: string | null;
}

export interface RouteTimelineLegProps {
  origin: Stop;
  destination: Stop;
  transit?: Transit | null;
  label?: "Berangkat" | "Pulang";
  date?: string | null;
  flightNumber?: string | null;
}

const SPINE_COLOR = "#64748b";

/** Pill shown ON the connector between two cities */
function SegmentChip({ code }: { code: string }) {
  return (
    <div className="flex items-center gap-1.5 py-1">
      <div className="flex-1 h-px bg-slate-200" />
      <span className="text-[9px] font-mono font-semibold bg-slate-100 text-slate-500 rounded-md px-2 py-0.5 leading-none whitespace-nowrap">
        ✈ {code}
      </span>
      <div className="flex-1 h-px bg-slate-200" />
    </div>
  );
}

function SingleLeg({ origin, destination, transit, label, date, flightNumber }: RouteTimelineLegProps) {
  const isDirect = !transit?.code;
  const labelColor = label === "Pulang" ? "text-violet-600" : "text-slate-500";

  // Split "EK359/EK8501" → ["EK359", "EK8501"] when there is a transit stop
  const flightParts = !isDirect && flightNumber
    ? flightNumber.split("/").map((s) => s.trim()).filter(Boolean)
    : flightNumber ? [flightNumber] : [];
  const leg1Flight = flightParts[0] ?? null;    // origin → transit
  const leg2Flight = flightParts[1] ?? null;    // transit → destination (falls back to leg1 if only one code)

  return (
    <div>
      {label && (
        <div className="flex items-center gap-2 mb-3">
          <p className={cn("text-[9px] font-bold uppercase tracking-widest", labelColor)}>
            {label === "Pulang" ? "↩ " : "↗ "}{label}
          </p>
          {date && <span className="text-[9px] text-slate-400 ml-auto">{date}</span>}
        </div>
      )}

      <div className="flex gap-3">
        {/* Spine */}
        <div className="flex flex-col items-center w-5 shrink-0 pt-1 pb-1">
          <div
            className="h-3.5 w-3.5 rounded-full border-2 bg-white shrink-0"
            style={{ borderColor: SPINE_COLOR, borderStyle: "dotted" }}
          />
          <div className="w-px flex-1 bg-slate-200 my-1" />
          {!isDirect && (
            <>
              <div className="h-2 w-2 rounded-full bg-amber-400 border border-amber-300 shrink-0" />
              <div className="w-px flex-1 bg-slate-200 my-1" />
            </>
          )}
          <Plane className="w-3.5 h-3.5 shrink-0 text-slate-400" style={{ transform: "rotate(90deg)" }} />
          <div className="w-px flex-1 bg-slate-200 my-1" />
          <div className="h-3.5 w-3.5 rounded-full shrink-0 bg-slate-700" />
        </div>

        {/* City info */}
        <div className="flex-1 min-w-0 py-0.5">
          {/* Origin */}
          <div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <p className="font-bold text-[17px] text-slate-900 leading-none">
                {origin.city || origin.code}
              </p>
              {origin.time && (
                <span className="text-[12px] font-bold tabular-nums text-slate-500">
                  {origin.time}
                </span>
              )}
            </div>
            {origin.city && (
              <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">
                {origin.airport ?? origin.code}
              </p>
            )}
          </div>

          {/* Flight chip: origin → transit (first leg code) */}
          {leg1Flight && !isDirect && <SegmentChip code={leg1Flight} />}

          {/* Transit stop */}
          {!isDirect && transit?.code && (
            <div className="mb-0">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <p className="font-semibold text-[13px] text-amber-700 leading-none">
                  {transit.city || transit.code}
                </p>
                <span className="text-[8.5px] text-amber-500 font-semibold">transit</span>
                {transit.duration && (
                  <span className="text-[8.5px] text-amber-400">{transit.duration}</span>
                )}
              </div>
              {transit.city && (
                <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{transit.code}</p>
              )}
            </div>
          )}

          {/* Flight chip: transit → destination (second leg code) OR direct flight */}
          {isDirect && leg1Flight && <SegmentChip code={leg1Flight} />}
          {!isDirect && (leg2Flight ?? leg1Flight) && <SegmentChip code={(leg2Flight ?? leg1Flight)!} />}

          {/* Destination */}
          <div className={!isDirect && transit?.code ? "mt-0" : ""}>
            <div className="flex items-baseline gap-2 flex-wrap">
              <p className="font-bold text-[17px] text-slate-900 leading-none">
                {destination.city || destination.code}
              </p>
              {destination.time && (
                <span className="text-[12px] font-bold tabular-nums text-slate-500">
                  {destination.time}
                </span>
              )}
            </div>
            {destination.city && (
              <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">
                {destination.airport ?? destination.code}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export interface RouteTimelineProps {
  outbound: RouteTimelineLegProps;
  returnTrip?: RouteTimelineLegProps | null;
}

export function RouteTimeline({ outbound, returnTrip }: RouteTimelineProps) {
  const isRoundTrip = !!returnTrip;
  return (
    <div className="space-y-4">
      <SingleLeg
        {...outbound}
        label={isRoundTrip ? "Berangkat" : outbound.label}
      />
      {isRoundTrip && returnTrip && (
        <>
          <div className="border-t border-dashed border-slate-200" />
          <SingleLeg {...returnTrip} label="Pulang" />
        </>
      )}
    </div>
  );
}
