import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HotelRow } from "./pricing";

const M = { fontFamily: "Montserrat, sans-serif" } as const;

type CurrencyCode = "IDR" | "SAR" | "USD";

interface Props {
  hotel: HotelRow;
  onChange: (patch: Partial<HotelRow>) => void;
}

/**
 * Cluster of 3 nightly-rate inputs (Quad / Triple / Double) for a single
 * hotel row. Two input modes:
 *   - "rates"      → user types each room-type rate explicitly.
 *   - "supplement" → user types Quad rate + supplement values. Triple/Double
 *                    rates are auto = base + supplement.
 *
 * Mode is persisted on the row via `useSupplement`. A small toggle button
 * (icon) flips between modes; switching to "rates" pre-fills explicit
 * Triple/Double from the supplement-derived values for convenience.
 */
export function HotelRatesCell({ hotel, onChange }: Props) {
  const [_, force] = useState(0);
  const supplementMode = !!hotel.useSupplement;
  const cur: CurrencyCode = (hotel.currency ?? "SAR") as CurrencyCode;

  function setMode(toSupplement: boolean) {
    if (toSupplement === supplementMode) return;
    if (toSupplement) {
      // Switching → supplement: derive supplements from current explicit rates
      const base = hotel.pricePerNight ?? 0;
      const triple = typeof hotel.pricePerNightTriple === "number" && hotel.pricePerNightTriple > 0
        ? hotel.pricePerNightTriple : base;
      const double = typeof hotel.pricePerNightDouble === "number" && hotel.pricePerNightDouble > 0
        ? hotel.pricePerNightDouble : base;
      onChange({
        useSupplement: true,
        supplementTriple: Math.max(0, triple - base),
        supplementDouble: Math.max(0, double - base),
      });
    } else {
      // Switching → rates: pre-fill explicit Triple/Double from supplements
      const base = hotel.pricePerNight ?? 0;
      onChange({
        useSupplement: false,
        pricePerNightTriple: base + (hotel.supplementTriple ?? 0),
        pricePerNightDouble: base + (hotel.supplementDouble ?? 0),
      });
    }
    force((n) => n + 1);
  }

  function setNum(field: keyof HotelRow, raw: string) {
    const stripped = raw.replace(/\./g, "").replace(/[^0-9]/g, "");
    onChange({ [field]: stripped ? Number(stripped) : 0 } as Partial<HotelRow>);
  }

  const inputBase =
    "h-6 px-1.5 rounded-md border border-orange-200 bg-white text-[11px] text-right focus:outline-none focus:ring-1 focus:ring-orange-400 focus:border-orange-400";

  return (
    <div className="flex flex-col gap-1 min-w-[150px]">
      {/* ── Header row: currency selector + mode toggle ── */}
      <div className="flex items-center justify-between gap-1">
        <select
          value={cur}
          onChange={(e) => onChange({ currency: e.target.value as CurrencyCode })}
          style={M}
          className="h-5 rounded border border-orange-200 bg-white px-1 text-[10px] font-bold text-orange-700"
          aria-label="Currency"
        >
          <option value="SAR">SAR</option>
          <option value="USD">USD</option>
          <option value="IDR">IDR</option>
        </select>
        <button
          type="button"
          onClick={() => setMode(!supplementMode)}
          title={supplementMode
            ? "Mode: supplement (klik utk ganti ke rate eksplisit)"
            : "Mode: rate eksplisit (klik utk ganti ke supplement)"}
          className={cn(
            "h-5 px-1.5 rounded text-[9px] font-bold inline-flex items-center gap-0.5 transition-colors",
            supplementMode
              ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200",
          )}
          aria-label="Toggle supplement mode"
        >
          <ArrowLeftRight className="h-2.5 w-2.5" />
          {supplementMode ? "supp" : "rate"}
        </button>
      </div>

      {/* ── 3 rate inputs (Q / T / D) ── */}
      <div className="grid grid-cols-[14px_1fr] gap-x-1 gap-y-0.5 items-center">
        {/* Quad — always base */}
        <span style={M} className="text-[9px] font-bold text-slate-500">Q</span>
        <input
          type="text"
          inputMode="numeric"
          value={hotel.pricePerNight > 0 ? hotel.pricePerNight.toLocaleString("id-ID") : ""}
          onChange={(e) => setNum("pricePerNight", e.target.value)}
          placeholder="0"
          style={M}
          className={inputBase}
        />

        {/* Triple */}
        <span style={M} className="text-[9px] font-bold text-slate-500">T</span>
        {supplementMode ? (
          <div className="flex items-center gap-0.5">
            <span style={M} className="text-[9px] font-bold text-amber-600">+</span>
            <input
              type="text"
              inputMode="numeric"
              value={(hotel.supplementTriple ?? 0) > 0 ? (hotel.supplementTriple ?? 0).toLocaleString("id-ID") : ""}
              onChange={(e) => setNum("supplementTriple", e.target.value)}
              placeholder="supp"
              style={M}
              className={cn(inputBase, "flex-1")}
            />
          </div>
        ) : (
          <input
            type="text"
            inputMode="numeric"
            value={(hotel.pricePerNightTriple ?? 0) > 0 ? (hotel.pricePerNightTriple ?? 0).toLocaleString("id-ID") : ""}
            onChange={(e) => setNum("pricePerNightTriple", e.target.value)}
            placeholder={hotel.pricePerNight > 0 ? `= ${hotel.pricePerNight.toLocaleString("id-ID")}` : "0"}
            style={M}
            className={inputBase}
          />
        )}

        {/* Double */}
        <span style={M} className="text-[9px] font-bold text-slate-500">D</span>
        {supplementMode ? (
          <div className="flex items-center gap-0.5">
            <span style={M} className="text-[9px] font-bold text-amber-600">+</span>
            <input
              type="text"
              inputMode="numeric"
              value={(hotel.supplementDouble ?? 0) > 0 ? (hotel.supplementDouble ?? 0).toLocaleString("id-ID") : ""}
              onChange={(e) => setNum("supplementDouble", e.target.value)}
              placeholder="supp"
              style={M}
              className={cn(inputBase, "flex-1")}
            />
          </div>
        ) : (
          <input
            type="text"
            inputMode="numeric"
            value={(hotel.pricePerNightDouble ?? 0) > 0 ? (hotel.pricePerNightDouble ?? 0).toLocaleString("id-ID") : ""}
            onChange={(e) => setNum("pricePerNightDouble", e.target.value)}
            placeholder={hotel.pricePerNight > 0 ? `= ${hotel.pricePerNight.toLocaleString("id-ID")}` : "0"}
            style={M}
            className={inputBase}
          />
        )}
      </div>
    </div>
  );
}
