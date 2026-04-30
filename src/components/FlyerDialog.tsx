import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Share2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as htmlToImage from "html-to-image";
import type { Trip } from "@/features/trips/tripsRepo";
import { useRegional } from "@/lib/regional";

function fmtIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

interface FlyerDialogProps {
  open: boolean;
  onClose: () => void;
  trip: Trip;
  jamaahCount?: number;
}

const TEMPLATES = [
  { id: "sunset", name: "Sunset Gold", from: "#f97316", to: "#dc2626" },
  { id: "emerald", name: "Emerald Holy", from: "#059669", to: "#0f766e" },
  { id: "midnight", name: "Midnight Blue", from: "#1e3a8a", to: "#312e81" },
];

export default function FlyerDialog({ open, onClose, trip, jamaahCount = 0 }: FlyerDialogProps) {
  const flyerRef = useRef<HTMLDivElement>(null);
  const [tplId, setTplId] = useState(TEMPLATES[0].id);
  const [busy, setBusy] = useState(false);
  const { formatDate } = useRegional();

  const tpl = TEMPLATES.find((t) => t.id === tplId) ?? TEMPLATES[0];
  const hasPrice = !!trip.pricePerPax && trip.pricePerPax > 0;
  const slotLeft = trip.quotaPax != null ? Math.max(0, trip.quotaPax - jamaahCount) : null;

  const renderToBlob = async (): Promise<Blob | null> => {
    if (!flyerRef.current) return null;
    const dataUrl = await htmlToImage.toPng(flyerRef.current, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: "#ffffff",
    });
    const res = await fetch(dataUrl);
    return await res.blob();
  };

  const handleDownload = async () => {
    setBusy(true);
    try {
      const blob = await renderToBlob();
      if (!blob) throw new Error("Render gagal");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeName = trip.name.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 40);
      a.href = url; a.download = `flyer_${safeName}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("Flyer berhasil di-download.");
    } catch (err) {
      console.error(err);
      toast.error("Gagal generate flyer.");
    } finally { setBusy(false); }
  };

  const handleShare = async () => {
    setBusy(true);
    try {
      const blob = await renderToBlob();
      if (!blob) throw new Error("Render gagal");
      const file = new File([blob], `flyer_${trip.name}.png`, { type: "image/png" });
      const navAny = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (navAny.canShare && navAny.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: trip.name,
          text: `Promo paket ${trip.name} dari IGH Tour`,
        });
      } else {
        toast.info("Browser tidak support share langsung. Silakan download dulu.");
        await handleDownload();
      }
    } catch (err) {
      const e = err as Error;
      if (e.name !== "AbortError") {
        console.error(err);
        toast.error("Gagal share flyer.");
      }
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        style={{ background: "#fff", color: "hsl(var(--foreground))" }}
        className="max-w-3xl w-[95vw] max-h-[92vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>Auto-Flyer Generator</DialogTitle>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
            Pilih template, lalu download / share langsung ke WhatsApp.
          </p>
        </DialogHeader>

        {/* Template picker */}
        <div className="flex gap-2 flex-wrap">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTplId(t.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 transition-all text-xs font-medium
                ${tplId === t.id ? "border-orange-500 bg-orange-50" : "border-[hsl(var(--border))] hover:border-orange-300"}`}
            >
              <span className="h-4 w-4 rounded-md" style={{ background: `linear-gradient(135deg, ${t.from}, ${t.to})` }} />
              {t.name}
            </button>
          ))}
        </div>

        {/* Flyer preview (rendered) */}
        <div className="rounded-xl overflow-hidden border border-[hsl(var(--border))] bg-gray-50 p-4 flex justify-center">
          <div
            ref={flyerRef}
            style={{
              width: 540,
              minHeight: 720,
              background: `linear-gradient(135deg, ${tpl.from}, ${tpl.to})`,
              color: "#fff",
              fontFamily: "Inter, system-ui, sans-serif",
              padding: 40,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Decorative blobs */}
            <div style={{
              position: "absolute", top: -80, right: -80, width: 280, height: 280,
              background: "rgba(255,255,255,0.08)", borderRadius: "50%",
            }} />
            <div style={{
              position: "absolute", bottom: -120, left: -120, width: 360, height: 360,
              background: "rgba(255,255,255,0.06)", borderRadius: "50%",
            }} />

            {/* Header */}
            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <img
                  src="/logo-igh-tour-white.png"
                  alt="IGH Tour"
                  crossOrigin="anonymous"
                  style={{ height: 56, width: "auto", objectFit: "contain" }}
                />
              </div>
              <div style={{ marginTop: 24, fontSize: 14, fontWeight: 600, opacity: 0.9, letterSpacing: 2, textTransform: "uppercase" }}>
                Open Trip {trip.destination || "Tanah Suci"}
              </div>
              <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.1, marginTop: 8 }}>
                {trip.emoji} {trip.name}
              </div>
            </div>

            {/* Body details */}
            <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 14, marginTop: 24 }}>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1, background: "rgba(255,255,255,0.15)", borderRadius: 16, padding: "14px 18px", backdropFilter: "blur(4px)" }}>
                  <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Berangkat</div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
                    {trip.startDate ? formatDate(trip.startDate, "full") : "—"}
                  </div>
                </div>
                <div style={{ flex: 1, background: "rgba(255,255,255,0.15)", borderRadius: 16, padding: "14px 18px", backdropFilter: "blur(4px)" }}>
                  <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Pulang</div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
                    {trip.endDate ? formatDate(trip.endDate, "full") : "—"}
                  </div>
                </div>
              </div>

              {hasPrice && (
                <div style={{ background: "rgba(255,255,255,0.95)", color: "#1f2937", borderRadius: 20, padding: "20px 24px" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1.5 }}>
                    Harga Mulai
                  </div>
                  <div style={{ fontSize: 36, fontWeight: 900, color: tpl.from, marginTop: 4, lineHeight: 1 }}>
                    {fmtIDR(trip.pricePerPax!)}
                  </div>
                  <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>per pax (sudah termasuk paket)</div>
                </div>
              )}

              {slotLeft !== null && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 }}>
                  <div style={{
                    background: slotLeft <= 5 ? "#fbbf24" : "rgba(255,255,255,0.2)",
                    color: slotLeft <= 5 ? "#7c2d12" : "#fff",
                    padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700,
                  }}>
                    {slotLeft === 0 ? "🔴 KUOTA HABIS" : `🔥 Sisa ${slotLeft} seat`}
                  </div>
                </div>
              )}
            </div>

            {/* Footer CTA */}
            <div style={{ position: "relative", zIndex: 1, marginTop: 20 }}>
              <div style={{ height: 1, background: "rgba(255,255,255,0.2)", marginBottom: 16 }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600 }}>Info & pendaftaran</div>
                  <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>📱 Hubungi Admin IGH Tour</div>
                </div>
                <div style={{
                  background: "#fff", color: tpl.from, padding: "10px 18px",
                  borderRadius: 12, fontWeight: 800, fontSize: 13,
                }}>
                  IGH TOUR
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={onClose} disabled={busy} className="h-9 rounded-xl">Tutup</Button>
          <Button onClick={handleShare} disabled={busy} variant="outline" className="h-9 rounded-xl">
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5 mr-1.5" />}
            Share
          </Button>
          <Button onClick={handleDownload} disabled={busy}
            className="h-9 rounded-xl gradient-primary text-white hover:opacity-90">
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
            Download PNG
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
