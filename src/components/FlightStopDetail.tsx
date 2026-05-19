import { Plane, Clock, ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LegInfo } from "@/lib/ticketPriceAI";

export const AIRPORT_NAMES: Record<string, string> = {
  JED: "King Abdulaziz Intl Airport",   MED: "Prince Mohammad Bin Abdulaziz Airport",
  CAI: "Cairo International Airport",   CGK: "Soekarno-Hatta Intl Airport",
  SUB: "Juanda International Airport",  DXB: "Dubai International Airport",
  AUH: "Abu Dhabi International Airport", DOH: "Hamad International Airport",
  AMM: "Queen Alia International Airport", IST: "Istanbul Airport",
  KUL: "Kuala Lumpur Intl Airport",     SIN: "Singapore Changi Airport",
  MCT: "Muscat International Airport",  RUH: "King Khalid Intl Airport",
  BAH: "Bahrain International Airport", KWI: "Kuwait International Airport",
  ADD: "Addis Ababa Bole International", BOM: "Chhatrapati Shivaji Maharaj Intl",
  GYD: "Heydar Aliyev International",   CDG: "Paris Charles de Gaulle",
  LHR: "London Heathrow Airport",       FRA: "Frankfurt Airport",
  GOI: "Goa International Airport",     DEL: "Indira Gandhi Intl Airport",
  BOM2: "Mumbai Chhatrapati Shivaji",    CMB: "Bandaranaike Intl Airport",
  KHI: "Jinnah International Airport",  LHE: "Allama Iqbal Intl Airport",
  DAC: "Hazrat Shahjalal Intl Airport",
};

export interface StopData {
  time: string | null;
  code: string;
  city?: string | null;
  flightNumber?: string | null;
  duration?: string | null;
  aircraftType?: string | null;
  layover?: string | null;
  isTransit: boolean;
  isFirst: boolean;
  isLast: boolean;
}

export function calcLegDuration(etd?: string | null, eta?: string | null): string | null {
  if (!etd || !eta) return null;
  const [h1, m1] = etd.split(":").map(Number);
  const [h2, m2] = eta.split(":").map(Number);
  if (isNaN(h1) || isNaN(h2)) return null;
  let m = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (m < 0) m += 24 * 60;
  return `${Math.floor(m / 60)}j ${String(m % 60).padStart(2, "0")}m`;
}

export function calcLayoverStr(eta?: string | null, nextEtd?: string | null): string | null {
  if (!eta || !nextEtd) return null;
  const [h1, m1] = eta.split(":").map(Number);
  const [h2, m2] = nextEtd.split(":").map(Number);
  if (isNaN(h1) || isNaN(h2)) return null;
  let m = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (m < 0) m += 24 * 60;
  if (m <= 0) return null;
  return `${Math.floor(m / 60)}j ${String(m % 60).padStart(2, "0")}m`;
}

export function buildMLStops(legs: LegInfo[]): StopData[] {
  if (!legs.length) return [];
  const stops: StopData[] = [];
  stops.push({
    time: legs[0].etd ?? null, code: legs[0].fromCode, city: legs[0].fromCity ?? null,
    flightNumber: legs[0].flightNumber ?? null,
    duration: calcLegDuration(legs[0].etd, legs[0].eta),
    aircraftType: null,
    layover: null, isTransit: false, isFirst: true, isLast: false,
  });
  for (let i = 0; i < legs.length - 1; i++) {
    stops.push({
      time: legs[i].eta ?? null, code: legs[i].toCode, city: legs[i].toCity ?? null,
      flightNumber: legs[i + 1].flightNumber ?? null,
      duration: calcLegDuration(legs[i + 1].etd, legs[i + 1].eta),
      aircraftType: null,
      layover: calcLayoverStr(legs[i].eta, legs[i + 1].etd),
      isTransit: true, isFirst: false, isLast: false,
    });
  }
  const last = legs[legs.length - 1];
  stops.push({
    time: last.eta ?? null, code: last.toCode, city: last.toCity ?? null,
    flightNumber: null, duration: null, aircraftType: null, layover: null,
    isTransit: false, isFirst: false, isLast: true,
  });
  return stops;
}

export interface SimpleStopOpts {
  leg1Duration?: string | null;
  leg1AircraftType?: string | null;
  leg2FlightNumber?: string | null;
  leg2AircraftType?: string | null;
  leg2Duration?: string | null;
}

export function buildSimpleStops(
  fromCode: string, fromCity: string | null, etd: string | null,
  transitCode: string | null, transitCity: string | null, transitDuration: string | null,
  toCode: string, toCity: string | null, eta: string | null,
  flightNumber: string | null,
  opts?: SimpleStopOpts,
): StopData[] {
  const parts = flightNumber ? flightNumber.split("/").map((s) => s.trim()).filter(Boolean) : [];
  const isDirect = !transitCode;
  const stops: StopData[] = [];
  stops.push({
    time: etd, code: fromCode, city: fromCity,
    flightNumber: parts[0] ?? null,
    duration: opts?.leg1Duration ?? (isDirect ? calcLegDuration(etd, eta) : null),
    aircraftType: opts?.leg1AircraftType ?? null,
    layover: null, isTransit: false, isFirst: true, isLast: isDirect,
  });
  if (!isDirect && transitCode) {
    stops.push({
      time: null, code: transitCode, city: transitCity,
      flightNumber: opts?.leg2FlightNumber ?? (parts[1] ?? parts[0] ?? null),
      duration: opts?.leg2Duration ?? null,
      aircraftType: opts?.leg2AircraftType ?? null,
      layover: transitDuration ?? null,
      isTransit: true, isFirst: false, isLast: false,
    });
  }
  stops.push({
    time: eta, code: toCode, city: toCity,
    flightNumber: null, duration: null, aircraftType: null, layover: null,
    isTransit: false, isFirst: false, isLast: true,
  });
  return stops;
}

export function FlightStopRow({
  time, code, city, flightNumber, duration, aircraftType, layover,
  isTransit, isFirst, isLast,
}: StopData) {
  const airportName = AIRPORT_NAMES[code.toUpperCase()] ?? city ?? null;
  return (
    <div className="flex items-start gap-2">
      <span className="w-10 text-right text-[11px] font-mono font-bold text-slate-600 pt-1 shrink-0 leading-none">
        {time ?? "—"}
      </span>
      <div className="flex flex-col items-center w-4 shrink-0 pt-0.5">
        {isFirst ? (
          <div
            className="w-3.5 h-3.5 rounded-full border-[2.5px] border-slate-400 bg-white shrink-0"
            style={{ borderStyle: "dotted" }}
          />
        ) : isTransit ? (
          <div className="w-3.5 h-3.5 rounded-full bg-amber-400 border border-amber-300 shrink-0" />
        ) : (
          <div className="w-3.5 h-3.5 rounded-full bg-slate-700 shrink-0" />
        )}
        {!isLast && (
          <div className="w-px flex-1 bg-slate-200 my-1.5" style={{ minHeight: 28 }} />
        )}
      </div>
      <div className="flex-1 min-w-0 pb-3.5">
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0">
            <p className={cn("text-[18px] font-black leading-none", isTransit ? "text-amber-600" : "text-slate-900")}>
              {code}
            </p>
            {airportName && (
              <p className="text-[10.5px] text-slate-400 mt-0.5 leading-tight">{airportName}</p>
            )}
            {isTransit && (
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className="text-[9px] font-bold uppercase tracking-wide text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  TRANSIT
                </span>
                {layover && (
                  <span className="flex items-center gap-0.5 text-[9px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    <Clock className="w-2.5 h-2.5 shrink-0" />
                    {layover}
                  </span>
                )}
              </div>
            )}
          </div>
          {(flightNumber || duration || aircraftType) && !isLast && (
            <div className="flex flex-col items-end gap-0.5 shrink-0 pt-0.5">
              {flightNumber && (
                <span className="text-[9.5px] font-mono font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md leading-none">
                  {flightNumber}
                </span>
              )}
              {aircraftType && (
                <span className="text-[8.5px] text-slate-400 text-right leading-tight max-w-[90px]">
                  {aircraftType}
                </span>
              )}
              {duration && (
                <span className="flex items-center gap-0.5 text-[9.5px] font-semibold text-slate-500">
                  <Clock className="w-2.5 h-2.5 shrink-0" />{duration}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FlightSection({
  label, date, stops, isReturn,
}: {
  label: string;
  date?: string | null;
  stops: StopData[];
  isReturn?: boolean;
}) {
  if (!stops.length) return null;
  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-sm px-4 pt-3.5 pb-1">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          {isReturn
            ? <ArrowLeftRight className="w-3.5 h-3.5 text-violet-500" />
            : <Plane className="w-3.5 h-3.5 text-blue-500" />
          }
          <span className={cn(
            "text-[10px] font-bold uppercase tracking-widest",
            isReturn ? "text-violet-600" : "text-blue-600",
          )}>
            {label}
          </span>
        </div>
        {date && (
          <span className="text-[10px] text-slate-400 font-medium">{date}</span>
        )}
      </div>
      {stops.map((stop, i) => (
        <FlightStopRow key={i} {...stop} />
      ))}
    </div>
  );
}
