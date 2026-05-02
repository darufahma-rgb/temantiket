import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Share2, Loader2, Copy, Check, Plane, MapPin, Calendar, Users, BedDouble } from "lucide-react";
import { toast } from "sonner";
import * as htmlToImage from "html-to-image";
import type { FlightMeta } from "@/features/orders/FlightOrderEditor";
import type { Client } from "@/features/clients/clientsRepo";
import type { Package } from "@/features/packages/packagesRepo";
import { useAuthStore } from "@/store/authStore";
import { useRegional } from "@/lib/regional";

/**
 * ClientViewDialog — preview "share-ready" untuk dikirim ke klien via WhatsApp.
 *
 * Mendukung 2 jenis produk:
 *   - kind="flight"  : itinerary tiket pesawat dari order flight
 *   - kind="umrah"   : itinerary paket umrah/haji dari Package
 *
 * Fitur:
 *   1. Preview estetik dgn logo Temantiket + watermark transparan diagonal
 *      yg bikin susah di-copy-paste tanpa kelihatan sumbernya.
 *   2. Export → PNG (html-to-image) untuk kirim WhatsApp.
 *   3. Tombol "Copy Text Format" → ringkasan teks dgn emoji, siap forward.
 */

export type ClientViewData =
  | {
      kind: "flight";
      meta: FlightMeta;
      client?: Client | null;
      title?: string | null;
      totalPrice?: number;
    }
  | {
      kind: "umrah";
      pkg: Package;
      jamaahCount?: number;
      pricePerPax?: number;
    };

interface Props {
  open: boolean;
  onClose: () => void;
  data: ClientViewData;
}

const fmtIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

export default function ClientViewDialog({ open, onClose, data }: Props) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const { formatDate } = useRegional();
  const agencyName = useAuthStore((s) => s.user?.agencyName ?? "Temantiket");

  // ── Render → Blob (shared by download & share) ─────────────────────────────
  const renderToBlob = async (): Promise<Blob | null> => {
    if (!previewRef.current) return null;
    const dataUrl = await htmlToImage.toPng(previewRef.current, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: "#ffffff",
    });
    const res = await fetch(dataUrl);
    return await res.blob();
  };

  const safeFileBase = useMemo(() => {
    const raw =
      data.kind === "flight"
        ? `tiket_${data.meta.fromCode || "X"}_${data.meta.toCode || "Y"}_${data.meta.departDate || ""}`
        : `umrah_${data.pkg.name}_${data.pkg.departureDate || ""}`;
    return raw.replace(/[^a-zA-Z0-9]+/g, "_").replace(/_+$/g, "").slice(0, 60) || "itinerary";
  }, [data]);

  const handleDownload = async () => {
    setBusy(true);
    try {
      const blob = await renderToBlob();
      if (!blob) throw new Error("Render gagal");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeFileBase}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Itinerary berhasil di-download.");
    } catch (err) {
      console.error(err);
      toast.error("Gagal generate gambar.");
    } finally {
      setBusy(false);
    }
  };

  const handleShare = async () => {
    setBusy(true);
    try {
      const blob = await renderToBlob();
      if (!blob) throw new Error("Render gagal");
      const file = new File([blob], `${safeFileBase}.png`, { type: "image/png" });
      const navAny = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (navAny.canShare && navAny.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: data.kind === "flight" ? "Itinerary Tiket" : "Itinerary Umrah",
          text: buildTextSummary(data, agencyName, formatDate),
        });
      } else {
        toast.info("Browser tidak support share langsung. Silakan download dulu.");
        await handleDownload();
      }
    } catch (err) {
      const e = err as Error;
      if (e.name !== "AbortError") {
        console.error(err);
        toast.error("Gagal share.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCopyText = async () => {
    try {
      const text = buildTextSummary(data, agencyName, formatDate);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Teks itinerary disalin ke clipboard.");
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.error(err);
      toast.error("Gagal salin teks. Coba browser lain ya.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        style={{ background: "#fff", color: "hsl(var(--foreground))" }}
        className="max-w-3xl w-[95vw] max-h-[92vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>Client View — Itinerary Preview</DialogTitle>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
            Preview siap kirim ke klien. Watermark transparan terpasang otomatis untuk proteksi.
          </p>
        </DialogHeader>

        {/* ── Preview ──────────────────────────────────────────────────── */}
        <div className="rounded-xl overflow-hidden border border-[hsl(var(--border))] bg-gray-50 p-4 flex justify-center">
          {data.kind === "flight" ? (
            <FlightPreview
              ref={previewRef}
              meta={data.meta}
              client={data.client ?? null}
              title={data.title ?? null}
              totalPrice={data.totalPrice ?? Number(data.meta.sellPrice ?? 0)}
              agencyName={agencyName}
              formatDate={formatDate}
            />
          ) : (
            <UmrahPreview
              ref={previewRef}
              pkg={data.pkg}
              jamaahCount={data.jamaahCount ?? 0}
              pricePerPax={data.pricePerPax ?? null}
              agencyName={agencyName}
              formatDate={formatDate}
            />
          )}
        </div>

        {/* ── Actions ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 justify-end pt-2">
          <Button variant="outline" onClick={onClose} disabled={busy} className="h-9 rounded-xl">
            Tutup
          </Button>
          <Button onClick={handleCopyText} variant="outline" className="h-9 rounded-xl">
            {copied ? (
              <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
            ) : (
              <Copy className="h-3.5 w-3.5 mr-1.5" />
            )}
            Copy Text Format
          </Button>
          <Button onClick={handleShare} disabled={busy} variant="outline" className="h-9 rounded-xl">
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5 mr-1.5" />}
            Share
          </Button>
          <Button
            onClick={handleDownload}
            disabled={busy}
            className="h-9 rounded-xl gradient-primary text-white hover:opacity-90"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
            Download PNG
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Watermark layer — repeating diagonal text. Inline styles supaya
// html-to-image bisa rasterize tanpa external CSS.
// ════════════════════════════════════════════════════════════════════════════

function Watermark({ text }: { text: string }) {
  // Bikin pola watermark dgn grid teks miring, jadi screenshot-pun tetap
  // ke-stamp logo agensi. Dipakai di belakang konten utama (z-index 0).
  const rows = Array.from({ length: 14 });
  const cols = Array.from({ length: 5 });
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        overflow: "hidden",
        transform: "rotate(-22deg)",
        transformOrigin: "center",
      }}
    >
      {rows.map((_, r) => (
        <div
          key={r}
          style={{
            display: "flex",
            gap: 80,
            paddingLeft: r % 2 === 0 ? 0 : 80,
            marginTop: r === 0 ? -100 : 36,
            whiteSpace: "nowrap",
          }}
        >
          {cols.map((_, c) => (
            <span
              key={c}
              style={{
                fontSize: 26,
                fontWeight: 800,
                letterSpacing: 4,
                color: "rgba(15, 23, 42, 0.06)",
                textTransform: "uppercase",
                fontFamily: "Inter, system-ui, sans-serif",
              }}
            >
              {text} · TEMANTIKET
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Flight preview — boarding-pass inspired
// ════════════════════════════════════════════════════════════════════════════

interface FlightPreviewProps {
  meta: FlightMeta;
  client: Client | null;
  title: string | null;
  totalPrice: number;
  agencyName: string;
  formatDate: (s: string, m?: "short" | "full") => string;
}

const FlightPreview = ({
  ref,
  meta,
  client,
  title,
  totalPrice,
  agencyName,
  formatDate,
}: FlightPreviewProps & { ref: React.Ref<HTMLDivElement> }) => {
  const passengerName =
    meta.passengerName?.trim() || client?.name || "Penumpang";
  const route =
    meta.fromCode && meta.toCode
      ? `${meta.fromCode} → ${meta.toCode}`
      : title || "Itinerary Tiket";

  return (
    <div
      ref={ref}
      style={{
        width: 600,
        background: "linear-gradient(160deg, #0f172a 0%, #1e3a8a 55%, #1a44d4 100%)",
        color: "#fff",
        fontFamily: "Inter, system-ui, sans-serif",
        padding: 36,
        position: "relative",
        overflow: "hidden",
        borderRadius: 24,
      }}
    >
      <Watermark text={agencyName} />

      {/* Header */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src="/temantiket-icon.svg"
            alt="Temantiket"
            crossOrigin="anonymous"
            style={{ height: 32, width: 32, objectFit: "contain" }}
          />
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase" }}>
              {agencyName}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>Itinerary Tiket Pesawat</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase" }}>PNR</div>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
            {meta.pnr || "—"}
          </div>
        </div>
      </div>

      {/* Route block — boarding-pass style */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.18)",
          borderRadius: 20,
          padding: "22px 24px",
          backdropFilter: "blur(6px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase" }}>Berangkat</div>
            <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1, marginTop: 4, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
              {meta.fromCode || "—"}
            </div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>{meta.fromCity || ""}</div>
          </div>
          <div style={{ flex: "0 0 auto", padding: "0 14px", color: "rgba(255,255,255,0.6)" }}>
            <Plane size={28} strokeWidth={2.2} />
          </div>
          <div style={{ flex: 1, textAlign: "right" }}>
            <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase" }}>Tiba</div>
            <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1, marginTop: 4, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
              {meta.toCode || "—"}
            </div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>{meta.toCity || ""}</div>
          </div>
        </div>

        {/* Tear strip */}
        <div
          style={{
            margin: "20px -24px",
            borderTop: "2px dashed rgba(255,255,255,0.25)",
            position: "relative",
          }}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <InfoCell label="Tanggal" value={meta.departDate ? formatDate(meta.departDate, "full") : "—"} />
          <InfoCell label="Berangkat" value={meta.departTime || "—"} mono />
          <InfoCell label="Tiba" value={meta.arriveTime || "—"} mono />
        </div>
      </div>

      {/* Flight & passenger */}
      <div style={{ position: "relative", zIndex: 1, marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <CardBox>
          <SmallLabel>Maskapai</SmallLabel>
          <BigValue>{meta.airline || "—"}</BigValue>
          <SmallSub>{meta.flightNumber || ""}</SmallSub>
        </CardBox>
        <CardBox>
          <SmallLabel>Nama Penumpang</SmallLabel>
          <BigValue>{passengerName}</BigValue>
          {client?.passportNumber && <SmallSub>Paspor: {client.passportNumber}</SmallSub>}
        </CardBox>
      </div>

      {/* Price */}
      {totalPrice > 0 && (
        <div
          style={{
            position: "relative",
            zIndex: 1,
            marginTop: 16,
            background: "rgba(255,255,255,0.95)",
            color: "#0f172a",
            borderRadius: 16,
            padding: "14px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 1.5 }}>
              Harga Tiket
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#0f172a", marginTop: 2, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
              {fmtIDR(totalPrice)}
            </div>
          </div>
          <div
            style={{
              background: "linear-gradient(135deg, #1a44d4, #0a2472)",
              color: "#fff",
              padding: "8px 16px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 1.5,
            }}
          >
            CONFIRMED
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ position: "relative", zIndex: 1, marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, opacity: 0.85 }}>
        <span>📱 Hubungi admin untuk perubahan jadwal</span>
        <span style={{ fontWeight: 700, letterSpacing: 1 }}>{agencyName.toUpperCase()}</span>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// Umrah preview — paket itinerary
// ════════════════════════════════════════════════════════════════════════════

interface UmrahPreviewProps {
  pkg: Package;
  jamaahCount: number;
  pricePerPax: number | null;
  agencyName: string;
  formatDate: (s: string, m?: "short" | "full") => string;
}

const UmrahPreview = ({
  ref,
  pkg,
  jamaahCount,
  pricePerPax,
  agencyName,
  formatDate,
}: UmrahPreviewProps & { ref: React.Ref<HTMLDivElement> }) => {
  const showPrice = pricePerPax != null && pricePerPax > 0;
  const slotLeft = Math.max(0, pkg.people - jamaahCount);
  const dur = computeDuration(pkg.departureDate, pkg.returnDate, pkg.days);

  return (
    <div
      ref={ref}
      style={{
        width: 600,
        background: "linear-gradient(160deg, #064e3b 0%, #047857 50%, #0d9488 100%)",
        color: "#fff",
        fontFamily: "Inter, system-ui, sans-serif",
        padding: 36,
        position: "relative",
        overflow: "hidden",
        borderRadius: 24,
      }}
    >
      <Watermark text={agencyName} />

      {/* Header */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src="/temantiket-icon.svg"
            alt="Temantiket"
            crossOrigin="anonymous"
            style={{ height: 32, width: 32, objectFit: "contain" }}
          />
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase" }}>
              {agencyName}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>Itinerary Paket Umrah</div>
          </div>
        </div>
        <div
          style={{
            background: "rgba(255,255,255,0.15)",
            padding: "6px 12px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          {pkg.status.toUpperCase()}
        </div>
      </div>

      {/* Title block */}
      <div style={{ position: "relative", zIndex: 1, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.85, letterSpacing: 2, textTransform: "uppercase" }}>
          Paket {pkg.destination || "Tanah Suci"}
        </div>
        <div style={{ fontSize: 32, fontWeight: 900, lineHeight: 1.15, marginTop: 6 }}>
          {pkg.emoji} {pkg.name}
        </div>
        {dur && (
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 6 }}>
            {dur} • {pkg.hotelLevel ?? ""}
          </div>
        )}
      </div>

      {/* Date row */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <CardBox>
          <SmallLabel>Berangkat</SmallLabel>
          <BigValue>{pkg.departureDate ? formatDate(pkg.departureDate, "full") : "—"}</BigValue>
        </CardBox>
        <CardBox>
          <SmallLabel>Pulang</SmallLabel>
          <BigValue>{pkg.returnDate ? formatDate(pkg.returnDate, "full") : "—"}</BigValue>
        </CardBox>
      </div>

      {/* Detail row */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <CardBox>
          <SmallLabel>
            <Plane size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
            Maskapai
          </SmallLabel>
          <BigValue compact>{pkg.airline || "—"}</BigValue>
        </CardBox>
        <CardBox>
          <SmallLabel>
            <BedDouble size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
            Hotel
          </SmallLabel>
          <BigValue compact>{pkg.hotelLevel || "—"}</BigValue>
        </CardBox>
        <CardBox>
          <SmallLabel>
            <Users size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
            Kuota
          </SmallLabel>
          <BigValue compact>
            {jamaahCount}/{pkg.people} pax
          </BigValue>
        </CardBox>
      </div>

      {/* Facilities */}
      {pkg.facilities && pkg.facilities.length > 0 && (
        <div style={{ position: "relative", zIndex: 1, marginBottom: 16 }}>
          <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>
            Fasilitas
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {pkg.facilities.slice(0, 8).map((f, i) => (
              <span
                key={i}
                style={{
                  background: "rgba(255,255,255,0.18)",
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                ✓ {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Price */}
      {showPrice && (
        <div
          style={{
            position: "relative",
            zIndex: 1,
            background: "rgba(255,255,255,0.95)",
            color: "#0f172a",
            borderRadius: 16,
            padding: "16px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 1.5 }}>
              Harga per Pax
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "#047857", marginTop: 2 }}>
              {fmtIDR(pricePerPax!)}
            </div>
          </div>
          {slotLeft >= 0 && (
            <div
              style={{
                background: slotLeft <= 5 ? "#fbbf24" : "#0d9488",
                color: slotLeft <= 5 ? "#7c2d12" : "#fff",
                padding: "8px 14px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              {slotLeft === 0 ? "🔴 KUOTA HABIS" : `🔥 Sisa ${slotLeft} seat`}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, opacity: 0.85, marginTop: 8 }}>
        <span>
          <MapPin size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
          {pkg.destination || "—"}
        </span>
        <span style={{ fontWeight: 700, letterSpacing: 1 }}>{agencyName.toUpperCase()}</span>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// Inline helpers (kept simple — used only inside previews above)
// ════════════════════════════════════════════════════════════════════════════

function InfoCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase" }}>{label}</div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 700,
          marginTop: 4,
          fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function CardBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.10)",
        border: "1px solid rgba(255,255,255,0.18)",
        borderRadius: 14,
        padding: "12px 14px",
      }}
    >
      {children}
    </div>
  );
}

function SmallLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, opacity: 0.75, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase" }}>
      {children}
    </div>
  );
}

function BigValue({ children, compact }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <div style={{ fontSize: compact ? 14 : 16, fontWeight: 800, marginTop: 4, lineHeight: 1.25 }}>{children}</div>
  );
}

function SmallSub({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>{children}</div>;
}

// ════════════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════════════

function computeDuration(dep?: string, ret?: string, fallbackDays?: number): string {
  if (dep && ret) {
    const d1 = new Date(dep);
    const d2 = new Date(ret);
    if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
      const days = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1);
      const nights = Math.max(0, days - 1);
      return `${days} hari ${nights} malam`;
    }
  }
  if (fallbackDays && fallbackDays > 0) {
    return `${fallbackDays} hari ${Math.max(0, fallbackDays - 1)} malam`;
  }
  return "";
}

// ── Text format builder (untuk Copy Text Format / Share text) ───────────────
function buildTextSummary(
  data: ClientViewData,
  agencyName: string,
  formatDate: (s: string, m?: "short" | "full") => string,
): string {
  const lines: string[] = [];
  if (data.kind === "flight") {
    const m = data.meta;
    lines.push(`✈️ *ITINERARY TIKET PESAWAT*`);
    lines.push(`_${agencyName}_`);
    lines.push("");
    if (data.title) lines.push(`📌 ${data.title}`);
    if (m.passengerName || data.client?.name) {
      lines.push(`👤 *Penumpang:* ${m.passengerName || data.client?.name}`);
    }
    if (m.pnr) lines.push(`🎫 *PNR:* \`${m.pnr}\``);
    if (m.airline || m.flightNumber) {
      lines.push(`🛫 *Maskapai:* ${[m.airline, m.flightNumber].filter(Boolean).join(" · ")}`);
    }
    if (m.fromCode || m.toCode) {
      const from = `${m.fromCode || "—"}${m.fromCity ? ` (${m.fromCity})` : ""}`;
      const to = `${m.toCode || "—"}${m.toCity ? ` (${m.toCity})` : ""}`;
      lines.push(`📍 *Rute:* ${from} → ${to}`);
    }
    if (m.departDate) {
      const t = m.departTime ? ` · ${m.departTime}` : "";
      lines.push(`📅 *Berangkat:* ${formatDate(m.departDate, "full")}${t}`);
    }
    if (m.arriveDate || m.arriveTime) {
      const date = m.arriveDate ? formatDate(m.arriveDate, "full") : "—";
      const t = m.arriveTime ? ` · ${m.arriveTime}` : "";
      lines.push(`🛬 *Tiba:* ${date}${t}`);
    }
    const total = data.totalPrice ?? Number(m.sellPrice ?? 0);
    if (total > 0) {
      lines.push("");
      lines.push(`💰 *Harga:* ${fmtIDR(total)}`);
    }
    lines.push("");
    lines.push(`📱 _Hubungi admin ${agencyName} untuk konfirmasi & perubahan jadwal._`);
  } else {
    const p = data.pkg;
    lines.push(`🕋 *PAKET UMRAH/HAJI*`);
    lines.push(`_${agencyName}_`);
    lines.push("");
    lines.push(`${p.emoji || "📦"} *${p.name}*`);
    if (p.destination) lines.push(`📍 *Destinasi:* ${p.destination}`);
    const dur = computeDuration(p.departureDate, p.returnDate, p.days);
    if (dur) lines.push(`🗓 *Durasi:* ${dur}`);
    if (p.departureDate) lines.push(`✈️ *Berangkat:* ${formatDate(p.departureDate, "full")}`);
    if (p.returnDate) lines.push(`🛬 *Pulang:* ${formatDate(p.returnDate, "full")}`);
    if (p.airline) lines.push(`🛫 *Maskapai:* ${p.airline}`);
    if (p.hotelLevel) lines.push(`🏨 *Hotel:* ${p.hotelLevel}`);
    const slotLeft = Math.max(0, p.people - (data.jamaahCount ?? 0));
    lines.push(`👥 *Kuota:* ${data.jamaahCount ?? 0}/${p.people} pax${slotLeft > 0 ? ` · sisa ${slotLeft} seat` : " · PENUH"}`);
    if (p.facilities && p.facilities.length > 0) {
      lines.push("");
      lines.push(`✨ *Fasilitas:*`);
      p.facilities.slice(0, 10).forEach((f) => lines.push(`  ✅ ${f}`));
    }
    if (data.pricePerPax && data.pricePerPax > 0) {
      lines.push("");
      lines.push(`💰 *Harga per Pax:* ${fmtIDR(data.pricePerPax)}`);
    }
    if (p.notes && p.notes.trim()) {
      lines.push("");
      lines.push(`📝 *Catatan:* ${p.notes.trim()}`);
    }
    lines.push("");
    lines.push(`📱 _Info & pendaftaran: hubungi admin ${agencyName}._`);
  }
  return lines.join("\n");
}
