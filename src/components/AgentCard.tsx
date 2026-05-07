/**
 * AgentCard — Digital ID card for each agent.
 * Background: /agent-card-bg.png (has "Temantiket Agent Card" baked in)
 * Font: Sk-Modernist (loaded globally via index.css)
 */
import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Helpers ────────────────────────────────────────────────────────────── */

/** Derive a stable 3-digit agent code from the UUID (001–999). */
function deriveAgentCode(uid: string): string {
  const hex = uid.replace(/-/g, "").slice(-8);
  const num = (parseInt(hex, 16) % 999) + 1;
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

/** Take at most the first 3 words of a name. */
function firstThreeWords(name: string): string {
  return name.trim().split(/\s+/).slice(0, 3).join(" ");
}

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
  const agentLabel = `#AGNTMNTKT${code}`;
  const sinceStr = since ? fmtSince(since) : null;
  const shortName = firstThreeWords(displayName);

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
          fontFamily: FONT,
          boxShadow: "0 20px 60px rgba(0,20,160,0.45)",
          flexShrink: 0,
        }}
      >
        {/* ── Agent number — positioned just below the bg title text ── */}
        <div style={{
          position: "absolute",
          top: "168px",
          left: "26px",
          zIndex: 1,
          fontSize: "14px",
          fontWeight: 700,
          color: "rgba(255,255,255,0.85)",
          letterSpacing: "0.03em",
          fontFamily: FONT,
        }}>
          {agentLabel}
        </div>

        {/* ── Bottom section ───────────────────────────────────────────── */}
        <div style={{
          position: "absolute",
          bottom: "28px",
          left: "26px",
          right: "26px",
          zIndex: 1,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
        }}>
          {/* Agent name (max 3 words) */}
          <div style={{
            fontSize: "34px",
            fontWeight: 800,
            color: "white",
            lineHeight: 1.08,
            letterSpacing: "-0.01em",
            maxWidth: "52%",
            wordBreak: "break-word",
            fontFamily: FONT,
          }}>
            {shortName}
          </div>

          {/* Agent ID + Since */}
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "rgba(255,255,255,0.75)",
              lineHeight: 1.2,
              fontFamily: FONT,
            }}>
              Agent ID.
            </div>
            <div style={{
              fontSize: "14px",
              fontWeight: 800,
              color: "white",
              lineHeight: 1.15,
              letterSpacing: "0.01em",
              fontFamily: FONT,
            }}>
              {agentLabel}
            </div>
            {sinceStr && (
              <div style={{
                fontSize: "11px",
                fontWeight: 500,
                color: "rgba(255,255,255,0.6)",
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
