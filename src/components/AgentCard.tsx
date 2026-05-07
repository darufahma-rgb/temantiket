/**
 * AgentCard — Digital ID card for each agent.
 * Matches the Temantiket Agent Card reference design:
 * blue gradient + diamond pattern + logo + agent name/ID/since.
 * Includes a download-as-image button via html-to-image.
 */
import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Helpers ────────────────────────────────────────────────────────────── */

/** Derive a stable 4-digit agent code from the UUID. */
function deriveAgentCode(uid: string): string {
  const hex = uid.replace(/-/g, "").slice(-8);
  const num = parseInt(hex, 16) % 10000;
  return num.toString().padStart(4, "0");
}

/** Format a date string to "DD/MM/YY" */
function fmtSince(iso: string): string {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(2);
    return `${dd}/${mm}/${yy}`;
  } catch {
    return "—";
  }
}

/* ── SVG Logo (Temantiket airplane icon, white) ─────────────────────────── */
function TemantiketLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="none"
      stroke="white"
      strokeWidth="5.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="50" cy="50" rx="8.5" ry="37" />
      <path d="M41.5 38 L5 62 L9 70 L41.5 52" />
      <path d="M58.5 38 L95 62 L91 70 L58.5 52" />
      <path d="M44 77 L26 90 L31 90 L44 81" />
      <path d="M56 77 L74 90 L69 90 L56 81" />
    </svg>
  );
}

/* ── Diamond SVG Pattern ────────────────────────────────────────────────── */
function DiamondPattern() {
  return (
    <svg
      className="absolute inset-0 w-full h-full opacity-100"
      xmlns="http://www.w3.org/2000/svg"
      style={{ pointerEvents: "none" }}
    >
      <defs>
        <pattern
          id="diamonds"
          x="0"
          y="0"
          width="52"
          height="52"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45 0 0)"
        >
          <rect
            x="1"
            y="1"
            width="50"
            height="50"
            fill="none"
            stroke="rgba(255,255,255,0.10)"
            strokeWidth="1.5"
            rx="3"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#diamonds)" />
    </svg>
  );
}

/* ── Pixel Decoration (matches the reference dot-grid element) ───────────── */
function PixelDots() {
  const grid = [
    [1, 0],
    [1, 0],
    [1, 1],
  ];
  return (
    <div className="grid gap-[5px]" style={{ gridTemplateColumns: "repeat(2, 10px)" }}>
      {grid.map(([a, b], ri) => (
        <div key={ri} className="contents">
          <div className={cn("w-[10px] h-[10px] rounded-[2px]", a ? "bg-white/70" : "bg-transparent")} />
          <div className={cn("w-[10px] h-[10px] rounded-[2px]", b ? "bg-white/70" : "bg-transparent")} />
        </div>
      ))}
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────────────────────── */
export interface AgentCardProps {
  displayName: string;
  agentId: string;
  since?: string | null;
  agencyName?: string;
  /** If provided, shown as a download filename */
  className?: string;
}

export function AgentCard({ displayName, agentId, since, className }: AgentCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const agentCode = deriveAgentCode(agentId);
  const sinceStr = since ? fmtSince(since) : null;

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 3,
        backgroundColor: "#0022cc",
      });
      const link = document.createElement("a");
      link.download = `Temantiket-AgentCard-${agentCode}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error("Download failed:", e);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      {/* ── Card ─────────────────────────────────────────────────────── */}
      <div
        ref={cardRef}
        style={{
          width: "320px",
          height: "420px",
          background: "linear-gradient(160deg, #1a3ef0 0%, #0a12c8 40%, #0008aa 100%)",
          borderRadius: "18px",
          position: "relative",
          overflow: "hidden",
          padding: "28px 26px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          fontFamily: "Inter, system-ui, sans-serif",
          boxShadow: "0 20px 60px rgba(0,20,160,0.45)",
          flexShrink: 0,
        }}
      >
        {/* Diamond pattern */}
        <DiamondPattern />

        {/* ── Top section ─────────────────────────────────────────── */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          {/* Title block */}
          <div>
            <div style={{ fontSize: "24px", fontWeight: 800, color: "white", lineHeight: 1.15, letterSpacing: "-0.02em" }}>
              Temantiket<br />Agent Card
            </div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.65)", marginTop: "8px", letterSpacing: "0.01em" }}>
              #TMNTKT{agentCode}
            </div>
          </div>

          {/* Logo */}
          <div style={{ width: "56px", height: "56px", flexShrink: 0 }}>
            <TemantiketLogo className="w-full h-full" />
          </div>
        </div>

        {/* ── Middle decoration (pixel dots, right-aligned) ──────── */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
          <PixelDots />
        </div>

        {/* ── Bottom section ───────────────────────────────────────── */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          {/* Agent name */}
          <div
            style={{
              fontSize: "32px",
              fontWeight: 900,
              color: "white",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              maxWidth: "55%",
              wordBreak: "break-word",
            }}
          >
            {displayName}
          </div>

          {/* Agent ID + Since */}
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "white", lineHeight: 1.2 }}>Agent ID.</div>
            <div style={{ fontSize: "22px", fontWeight: 900, color: "white", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
              {agentCode}
            </div>
            {sinceStr && (
              <div style={{ fontSize: "11px", fontWeight: 500, color: "rgba(255,255,255,0.6)", marginTop: "4px" }}>
                Since {sinceStr}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Download button ──────────────────────────────────────────── */}
      <button
        onClick={handleDownload}
        disabled={downloading}
        className="flex items-center gap-2 px-5 py-2 rounded-xl bg-slate-900 text-white text-[12.5px] font-semibold hover:bg-slate-700 transition-all disabled:opacity-60 active:scale-95"
      >
        {downloading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        {downloading ? "Menyimpan…" : "Download Kartu"}
      </button>
    </div>
  );
}
