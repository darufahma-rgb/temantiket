/**
 * AgentCard — Digital ID card for each agent.
 * Background: /agent-card-bg.png
 * Font: Sk-Modernist (loaded globally via index.css)
 * Layout: agent code top-left, pixel dots mid-right, name + ID/since bottom
 */
import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Helpers ────────────────────────────────────────────────────────────── */

/** Derive a stable 3-digit agent code from the UUID (001–999). */
function deriveAgentCode(uid: string): string {
  const hex = uid.replace(/-/g, "").slice(-8);
  const num = (parseInt(hex, 16) % 999) + 1; // 1–999
  return num.toString().padStart(3, "0");
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

/* ── Pixel Decoration ───────────────────────────────────────────────────── */
function PixelDots() {
  const cells = [
    [1, 0],
    [1, 0],
    [1, 1],
  ];
  return (
    <div style={{ display: "grid", gap: "5px", gridTemplateColumns: "repeat(2, 10px)" }}>
      {cells.map(([a, b], ri) => (
        <div key={ri} style={{ display: "contents" }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: a ? "rgba(255,255,255,0.70)" : "transparent" }} />
          <div style={{ width: 10, height: 10, borderRadius: 2, background: b ? "rgba(255,255,255,0.70)" : "transparent" }} />
        </div>
      ))}
    </div>
  );
}

/* ── Font shorthand ─────────────────────────────────────────────────────── */
const FONT = "'Sk-Modernist', 'Inter', system-ui, sans-serif";

/* ── Main Component ─────────────────────────────────────────────────────── */
export interface AgentCardProps {
  displayName: string;
  agentId: string;
  since?: string | null;
  agencyName?: string;
  className?: string;
}

export function AgentCard({ displayName, agentId, since, className }: AgentCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const code = deriveAgentCode(agentId);
  const sinceStr = since ? fmtSince(since) : null;
  const agentLabel = `#AGNTMNTKT${code}`;

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 3,
        backgroundColor: "#0033cc",
      });
      const link = document.createElement("a");
      link.download = `Temantiket-AgentCard-${code}.png`;
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
          backgroundImage: "url('/agent-card-bg.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          borderRadius: "18px",
          position: "relative",
          overflow: "hidden",
          padding: "28px 26px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          fontFamily: FONT,
          boxShadow: "0 20px 60px rgba(0,20,160,0.45)",
          flexShrink: 0,
        }}
      >
        {/* ── Top: agent number only ───────────────────────────────── */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{
            fontSize: "15px",
            fontWeight: 700,
            color: "rgba(255,255,255,0.85)",
            letterSpacing: "0.02em",
            fontFamily: FONT,
          }}>
            {agentLabel}
          </div>
        </div>

        {/* ── Middle: pixel dots right-aligned ─────────────────────── */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "flex-end" }}>
          <PixelDots />
        </div>

        {/* ── Bottom: name left + ID/Since right ───────────────────── */}
        <div style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
        }}>
          {/* Agent name */}
          <div style={{
            fontSize: "34px",
            fontWeight: 800,
            color: "white",
            lineHeight: 1.08,
            letterSpacing: "-0.01em",
            maxWidth: "54%",
            wordBreak: "break-word",
            fontFamily: FONT,
          }}>
            {displayName}
          </div>

          {/* Agent ID + Since */}
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{
              fontSize: "12px",
              fontWeight: 700,
              color: "white",
              lineHeight: 1.2,
              fontFamily: FONT,
            }}>
              Agent ID.
            </div>
            <div style={{
              fontSize: "26px",
              fontWeight: 800,
              color: "white",
              lineHeight: 1.05,
              letterSpacing: "-0.01em",
              fontFamily: FONT,
            }}>
              {code}
            </div>
            {sinceStr && (
              <div style={{
                fontSize: "11px",
                fontWeight: 500,
                color: "rgba(255,255,255,0.65)",
                marginTop: "5px",
                fontFamily: FONT,
              }}>
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
        style={{ fontFamily: FONT }}
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
