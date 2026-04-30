import { TrendingUp, TrendingDown } from "lucide-react";

const rates = [
  { from: "USD", to: "IDR", rate: "16,245", change: 0.42, up: true },
  { from: "SAR", to: "IDR", rate: "4,331", change: -0.18, up: false },
];

export function CurrencyTicker() {
  return (
    <div className="hidden lg:flex items-center gap-2">
      {rates.map((r) => (
        <div
          key={r.from}
          className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-1.5 text-xs"
        >
          <span className="font-semibold text-muted-foreground">
            {r.from} → {r.to}
          </span>
          <span className="font-bold text-foreground">{r.rate}</span>
          <span
            className={`flex items-center gap-0.5 font-medium ${
              r.up ? "text-success" : "text-destructive"
            }`}
          >
            {r.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(r.change)}%
          </span>
        </div>
      ))}
    </div>
  );
}
