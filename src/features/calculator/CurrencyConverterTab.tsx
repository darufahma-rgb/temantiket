import { useEffect, useState, useCallback } from "react";
import { ArrowLeftRight, RefreshCw, TrendingUp } from "lucide-react";
import { useRatesStore } from "@/store/ratesStore";
import { cn } from "@/lib/utils";

const M: React.CSSProperties = { fontFamily: "inherit" };

type ConvCurrency = "IDR" | "USD" | "SAR" | "EGP";

interface AllRates {
  IDR: number;
  USD: number;
  SAR: number;
  EGP: number;
}

const CURRENCY_META: Record<ConvCurrency, { label: string; flag: string; symbol: string }> = {
  IDR: { label: "Rupiah Indonesia", flag: "🇮🇩", symbol: "Rp" },
  USD: { label: "Dolar Amerika",    flag: "🇺🇸", symbol: "$"  },
  SAR: { label: "Riyal Saudi",      flag: "🇸🇦", symbol: "SR" },
  EGP: { label: "Pound Mesir",      flag: "🇪🇬", symbol: "£"  },
};

const QUICK_AMOUNTS: Record<ConvCurrency, number[]> = {
  IDR: [100_000, 500_000, 1_000_000, 5_000_000],
  USD: [1, 10, 100, 500],
  SAR: [10, 50, 100, 500],
  EGP: [10, 50, 100, 500],
};

function fmt(n: number, cur: ConvCurrency): string {
  if (!isFinite(n)) return "—";
  if (cur === "IDR") {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
  }
  const sym = CURRENCY_META[cur].symbol;
  if (n >= 1) return `${sym} ${new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
  return `${sym} ${n.toFixed(4)}`;
}

function fmtPlain(n: number): string {
  if (!isFinite(n) || n === 0) return "";
  return String(Math.round(n * 1000) / 1000);
}

async function fetchEgpRate(): Promise<number> {
  const CACHE_KEY = "igh.egp.rate.v1";
  const CACHE_TTL = 5 * 60 * 1000;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const { rate, at } = JSON.parse(raw) as { rate: number; at: number };
      if (Date.now() - at < CACHE_TTL && rate > 0) return rate;
    }
  } catch { /* ignore */ }

  const endpoints = [
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/idr.json",
    "https://latest.currency-api.pages.dev/v1/currencies/idr.json",
  ];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const data = await res.json();
      const egpPerIdr = Number(data?.idr?.egp);
      if (egpPerIdr > 0) {
        const rate = Math.round((1 / egpPerIdr) * 100) / 100;
        localStorage.setItem(CACHE_KEY, JSON.stringify({ rate, at: Date.now() }));
        return rate;
      }
    } catch { /* try next */ }
  }
  return 515; // fallback ~ IDR per EGP
}

export function CurrencyConverterTab() {
  const storeRates = useRatesStore((s) => s.rates);
  const lastUpdated = useRatesStore((s) => s.lastUpdated);
  const refresh = useRatesStore((s) => s.refresh);
  const loading = useRatesStore((s) => s.loading);

  const [egpRate, setEgpRate] = useState<number>(515);
  const [egpLoading, setEgpLoading] = useState(false);

  const allRates: AllRates = {
    IDR: 1,
    USD: storeRates.USD,
    SAR: storeRates.SAR,
    EGP: egpRate,
  };

  const [amountStr, setAmountStr] = useState("1000000");
  const [from, setFrom] = useState<ConvCurrency>("IDR");
  const [to, setTo] = useState<ConvCurrency>("EGP");

  const loadEgp = useCallback(async () => {
    setEgpLoading(true);
    try {
      const r = await fetchEgpRate();
      setEgpRate(r);
    } finally {
      setEgpLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEgp();
    if (!lastUpdated) refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const amount = parseFloat(amountStr.replace(/[^0-9.]/g, "")) || 0;

  function toIDR(val: number, cur: ConvCurrency): number {
    return val * allRates[cur];
  }
  function fromIDR(val: number, cur: ConvCurrency): number {
    return allRates[cur] > 0 ? val / allRates[cur] : 0;
  }

  const resultIDR = toIDR(amount, from);
  const result = fromIDR(resultIDR, to);

  function swap() {
    setFrom(to);
    setTo(from);
    if (result > 0) setAmountStr(fmtPlain(result));
  }

  const CURRENCIES: ConvCurrency[] = ["IDR", "USD", "SAR", "EGP"];

  const refreshBusy = loading || egpLoading;

  const rateLabel = (() => {
    const r = fromIDR(toIDR(1, from), to);
    return `1 ${from} = ${fmt(r, to)}`;
  })();

  return (
    <div className="space-y-4 max-w-lg mx-auto" style={M}>
      {/* Title & refresh */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] text-muted-foreground" style={M}>
            IDR · USD · SAR · EGP (Pound Mesir) — kurs real-time
          </p>
        </div>
        <button
          onClick={() => { refresh(); loadEgp(); }}
          disabled={refreshBusy}
          className="flex items-center gap-1 text-[10.5px] text-sky-600 hover:text-sky-700 disabled:opacity-50"
          style={M}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshBusy && "animate-spin")} />
          {refreshBusy ? "Memperbarui..." : "Perbarui Kurs"}
        </button>
      </div>

      {/* Rate context strip */}
      <div className="grid grid-cols-2 gap-2">
        {(["USD", "SAR", "EGP"] as ConvCurrency[]).map((cur) => (
          <div key={cur} className="flex items-center justify-between rounded-xl border bg-slate-50 px-3 py-2">
            <span className="text-[11px] font-semibold text-slate-600" style={M}>
              {CURRENCY_META[cur].flag} 1 {cur}
            </span>
            <span className="text-[12px] font-bold text-emerald-600 tabular-nums" style={M}>
              {new Intl.NumberFormat("id-ID").format(allRates[cur])} IDR
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between rounded-xl border bg-sky-50 px-3 py-2">
          <span className="text-[11px] font-semibold text-sky-600" style={M}>
            {CURRENCY_META[from].flag} {rateLabel.split("=")[0].trim()}
          </span>
          <span className="text-[12px] font-bold text-sky-700 tabular-nums" style={M}>
            = {rateLabel.split("=")[1].trim()}
          </span>
        </div>
      </div>

      {/* Converter card */}
      <div className="rounded-2xl border border-sky-200 bg-white shadow-sm overflow-hidden">
        {/* FROM */}
        <div className="p-4 space-y-2">
          <label className="text-[10.5px] font-extrabold text-slate-400 uppercase tracking-wider" style={M}>Dari</label>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 flex-wrap">
              {CURRENCIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setFrom(c)}
                  style={M}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all",
                    from === c ? "bg-sky-500 text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-sky-100"
                  )}
                >
                  {CURRENCY_META[c].flag} {c}
                </button>
              ))}
            </div>
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-bold text-slate-400" style={M}>
              {CURRENCY_META[from].symbol}
            </span>
            <input
              type="number"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="w-full pl-9 pr-4 py-3 rounded-xl border border-slate-200 text-[18px] font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400 bg-slate-50 tabular-nums"
              style={M}
              placeholder="0"
              min={0}
            />
          </div>
          {/* Quick amounts */}
          <div className="flex gap-1.5 flex-wrap">
            {QUICK_AMOUNTS[from].map((q) => (
              <button
                key={q}
                onClick={() => setAmountStr(String(q))}
                style={M}
                className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-sky-50 text-sky-600 hover:bg-sky-100 border border-sky-200"
              >
                {q >= 1_000_000 ? `${q / 1_000_000}jt` : q >= 1000 ? `${q / 1000}rb` : q}
              </button>
            ))}
          </div>
        </div>

        {/* Swap button */}
        <div className="flex items-center justify-center border-y border-slate-100 bg-slate-50 py-1.5">
          <button
            onClick={swap}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold text-sky-600 hover:bg-sky-100 transition-colors"
            style={M}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Tukar
          </button>
        </div>

        {/* TO */}
        <div className="p-4 space-y-2">
          <label className="text-[10.5px] font-extrabold text-slate-400 uppercase tracking-wider" style={M}>Ke</label>
          <div className="flex gap-1 flex-wrap">
            {CURRENCIES.map((c) => (
              <button
                key={c}
                onClick={() => setTo(c)}
                style={M}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all",
                  to === c ? "bg-emerald-500 text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-emerald-100"
                )}
              >
                {CURRENCY_META[c].flag} {c}
              </button>
            ))}
          </div>

          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center justify-between gap-2">
            <span className="text-[12px] font-semibold text-emerald-600" style={M}>
              {CURRENCY_META[to].flag} {CURRENCY_META[to].label}
            </span>
            <span className="text-[22px] font-extrabold text-emerald-700 tabular-nums" style={M}>
              {amount > 0 ? fmt(result, to) : "—"}
            </span>
          </div>

          {amount > 0 && from !== "IDR" && to !== "IDR" && (
            <p className="text-[10px] text-slate-400 text-right" style={M}>
              via IDR · {fmt(resultIDR, "IDR")}
            </p>
          )}
        </div>
      </div>

      {/* Multi-way breakdown */}
      {amount > 0 && (
        <div className="rounded-xl border bg-slate-50 p-3 space-y-1.5">
          <p className="text-[10.5px] font-extrabold text-slate-400 uppercase tracking-wider mb-2" style={M}>
            <TrendingUp className="h-3.5 w-3.5 inline mr-1" />
            {amount.toLocaleString("id-ID")} {from} setara dengan
          </p>
          {CURRENCIES.filter((c) => c !== from).map((c) => {
            const val = fromIDR(resultIDR, c);
            return (
              <div key={c} className="flex items-center justify-between px-2 py-1 rounded-lg bg-white border border-slate-200">
                <span className="text-[11px] font-semibold text-slate-600" style={M}>
                  {CURRENCY_META[c].flag} {c} — {CURRENCY_META[c].label}
                </span>
                <span className="text-[12px] font-bold text-slate-800 tabular-nums" style={M}>
                  {fmt(val, c)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[9.5px] text-muted-foreground text-center" style={M}>
        Kurs mid-market dari currency-api.pages.dev · diperbarui setiap 5 menit · bukan kurs transaksi resmi
      </p>
    </div>
  );
}
