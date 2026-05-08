/**
 * StaffCard — Digital ID card for staff members.
 * Background: /staff-card-bg.png (blank Temantiket card template)
 * Font: Sk-Modernist (loaded globally via index.css)
 */
import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const FONT = "'Sk-Modernist', 'Inter', system-ui, sans-serif";

/** Derive a stable 4-digit staff code from the UUID (0001–9999). */
function deriveStaffCode(uid: string): string {
  const hex = uid.replace(/-/g, "").slice(-8);
  const num = (parseInt(hex, 16) % 9999) + 1;
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

/** Take at most the first 3 words of a name. */
function firstThreeWords(name: string): string {
  return name.trim().split(/\s+/).slice(0, 3).join(" ");
}

export interface StaffCardProps {
  displayName: string;
  staffId: string;
  since?: string | null;
  className?: string;
}

export function StaffCard({ displayName, staffId, since, className }: StaffCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const code = deriveStaffCode(staffId);
  const staffLabel = `#TMNSTF${code}`;
  const sinceStr = since ? fmtSince(since) : null;
  const shortName = firstThreeWords(displayName || "Staff");

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 3,
        backgroundColor: "#001133",
      });
      const link = document.createElement("a");
      link.download = `Temantiket-StaffCard-${code}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error("Download kartu staff gagal:", e);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      {/* ── Card ─────────────────────────────────────────────────── */}
      <div
        ref={cardRef}
        style={{
          width: "320px",
          height: "400px",
          backgroundImage: "url('/staff-card-bg.png')",
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
        {/* ── Top-left: title + staff code ───────────────────────── */}
        <div style={{
          position: "absolute",
          top: "142px",
          left: "26px",
          zIndex: 1,
          fontFamily: FONT,
        }}>
          <div style={{
            fontSize: "12px",
            fontWeight: 700,
            color: "rgba(255,255,255,0.80)",
            letterSpacing: "0.03em",
            fontFamily: FONT,
          }}>
            {staffLabel}
          </div>
        </div>

        {/* ── Bottom section ──────────────────────────────────────── */}
        <div style={{
          position: "absolute",
          bottom: "26px",
          left: "26px",
          right: "26px",
          zIndex: 1,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
        }}>
          {/* Staff name (max 3 words, large bold) */}
          <div style={{
            fontSize: "32px",
            fontWeight: 800,
            color: "white",
            lineHeight: 1.08,
            letterSpacing: "-0.01em",
            maxWidth: "55%",
            wordBreak: "break-word",
            fontFamily: FONT,
          }}>
            {shortName}
          </div>

          {/* Staff ID + Since */}
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{
              fontSize: "12px",
              fontWeight: 700,
              color: "rgba(255,255,255,0.70)",
              lineHeight: 1.2,
              fontFamily: FONT,
            }}>
              Staff ID.
            </div>
            <div style={{
              fontSize: "26px",
              fontWeight: 800,
              color: "white",
              lineHeight: 1.1,
              letterSpacing: "0.02em",
              fontFamily: FONT,
            }}>
              {code}
            </div>
            {sinceStr && (
              <div style={{
                fontSize: "10.5px",
                fontWeight: 500,
                color: "rgba(255,255,255,0.60)",
                marginTop: "4px",
                fontFamily: FONT,
              }}>
                Since {sinceStr}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Download button ──────────────────────────────────────── */}
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
        {downloading ? "Menyimpan…" : "Download Kartu Staff"}
      </button>
    </div>
  );
}
