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

function SingleLeg({ origin, destination, transit, label, date, flightNumber }: RouteTimelineLegProps) {
  const isDirect = !transit?.code;
  const labelColor = label === "Pulang" ? "text-violet-600" : "text-slate-500";

  return (
    <div>
      {label && (
        <div className="flex items-center gap-2 mb-3">
          <p className={cn("text-[9px] font-bold uppercase tracking-widest", labelColor)}>
            {label === "Pulang" ? "↩ " : "↗ "}{label}
          </p>
          {date && <span className="text-[9px] text-slate-400 ml-auto">{date}</span>}
          {flightNumber && (
            <span className="text-[9px] font-mono text-slate-400 bg-slate-100 rounded px-1">{flightNumber}</span>
          )}
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
        <div className="flex flex-col justify-between flex-1 min-w-0 py-0.5" style={{ gap: "18px" }}>
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
            {!isDirect && transit?.code && (
              <p className="text-[9.5px] text-amber-600 font-semibold mt-1">
                via {transit.city ? `${transit.city} (${transit.code})` : transit.code}
                {transit.duration && <span className="text-amber-400"> · {transit.duration}</span>}
              </p>
            )}
          </div>

          {/* Destination */}
          <div>
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
