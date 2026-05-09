/**
 * StaffCard — Digital ID card for staff members.
 * Background: /staff-card-bg.png (blank Temantiket card template)
 * Font: Sk-Modernist (loaded globally via index.css)
 * Supports custom back-image with 3D flip animation.
 */
import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Download, Loader2, ImagePlus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

const FONT = "'Sk-Modernist', 'Inter', system-ui, sans-serif";

function deriveStaffCode(uid: string): string {
  const hex = uid.replace(/-/g, "").slice(-8);
  const num = (parseInt(hex, 16) % 9999) + 1;
  return num.toString().padStart(4, "0");
}

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

function firstThreeWords(name: string): string {
  return name.trim().split(/\s+/).slice(0, 3).join(" ");
}

export interface StaffCardProps {
  displayName: string;
  staffId: string;
  since?: string | null;
  backImageUrl?: string | null;
  className?: string;
}

export function StaffCard({ displayName, staffId, since, backImageUrl, className }: StaffCardProps) {
  const frontRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [flipped, setFlipped] = useState(false);

  const code = deriveStaffCode(staffId);
  const staffLabel = `#TMNSTF${code}`;
  const sinceStr = since ? fmtSince(since) : null;
  const shortName = firstThreeWords(displayName || "Staff");

  const handleDownload = async () => {
    const target = frontRef.current;
    if (!target) return;
    if (flipped) setFlipped(false);
    await new Promise((r) => setTimeout(r, 120));
    setDownloading(true);
    try {
      const dataUrl = await toPng(target, {
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

  const CARD_W = 320;
  const CARD_H = 400;
  const CARD_RADIUS = 18;

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      {/* ── 3D Flip Container ─────────────────────────────────────── */}
      <div
        style={{
          width: `${CARD_W}px`,
          height: `${CARD_H}px`,
          perspective: "1200px",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            position: "relative",
            transformStyle: "preserve-3d",
            transition: "transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          {/* ── FRONT FACE ────────────────────────────────────────── */}
          <div
            ref={frontRef}
            style={{
              width: `${CARD_W}px`,
              height: `${CARD_H}px`,
              backgroundImage: "url('/staff-card-bg.png')",
              backgroundSize: "cover",
              backgroundPosition: "center",
              borderRadius: `${CARD_RADIUS}px`,
              position: "absolute",
              inset: 0,
              overflow: "hidden",
              fontFamily: FONT,
              boxShadow: "0 20px 60px rgba(0,20,160,0.45)",
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
            }}
          >
            {/* Top-left: staff code */}
            <div style={{ position: "absolute", top: "85px", left: "26px", zIndex: 1, fontFamily: FONT }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "rgba(255,255,255,0.80)", letterSpacing: "0.03em", fontFamily: FONT }}>
                {staffLabel}
              </div>
            </div>

            {/* Bottom section */}
            <div style={{ position: "absolute", bottom: "26px", left: "26px", right: "26px", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <div style={{ fontSize: "32px", fontWeight: 800, color: "white", lineHeight: 1.08, letterSpacing: "-0.01em", maxWidth: "55%", wordBreak: "break-word", fontFamily: FONT }}>
                {shortName}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "rgba(255,255,255,0.70)", lineHeight: 1.2, fontFamily: FONT }}>Staff ID.</div>
                <div style={{ fontSize: "26px", fontWeight: 800, color: "white", lineHeight: 1.1, letterSpacing: "0.02em", fontFamily: FONT }}>{code}</div>
                {sinceStr && (
                  <div style={{ fontSize: "10.5px", fontWeight: 500, color: "rgba(255,255,255,0.60)", marginTop: "4px", fontFamily: FONT }}>Since {sinceStr}</div>
                )}
              </div>
            </div>
          </div>

          {/* ── BACK FACE ─────────────────────────────────────────── */}
          <div
            style={{
              width: `${CARD_W}px`,
              height: `${CARD_H}px`,
              borderRadius: `${CARD_RADIUS}px`,
              position: "absolute",
              inset: 0,
              overflow: "hidden",
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              boxShadow: "0 20px 60px rgba(0,20,160,0.45)",
              background: backImageUrl ? "transparent" : "linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {backImageUrl ? (
              <img
                src={backImageUrl}
                alt="Belakang kartu"
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: `${CARD_RADIUS}px` }}
              />
            ) : (
              <div style={{ textAlign: "center", color: "rgba(255,255,255,0.45)", fontFamily: FONT, padding: "24px" }}>
                <ImagePlus style={{ width: 40, height: 40, margin: "0 auto 10px", opacity: 0.5 }} />
                <div style={{ fontSize: "13px", fontWeight: 600 }}>Belum ada gambar</div>
                <div style={{ fontSize: "11px", marginTop: "4px", opacity: 0.7 }}>Upload gambar belakang kartu di bawah</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Flip button (only shown when backImageUrl exists or for preview) */}
      <button
        onClick={() => setFlipped((f) => !f)}
        className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-[11.5px] font-semibold hover:bg-slate-200 transition-all active:scale-95"
        style={{ fontFamily: FONT }}
      >
        <RotateCcw className="h-3 w-3" />
        {flipped ? "Lihat Depan" : "Lihat Belakang"}
      </button>

      {/* ── Download button */}
      <button
        onClick={handleDownload}
        disabled={downloading}
        className="flex items-center gap-2 px-5 py-2 rounded-xl bg-slate-900 text-white text-[12.5px] font-semibold hover:bg-slate-700 transition-all disabled:opacity-60 active:scale-95"
        style={{ fontFamily: FONT }}
      >
        {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        {downloading ? "Menyimpan…" : "Download Kartu Staff"}
      </button>
    </div>
  );
}
