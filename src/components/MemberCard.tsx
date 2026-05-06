import { useMemo, useRef, useState } from "react";
import * as htmlToImage from "html-to-image";
import { Download, RotateCw, Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  buildWhatsAppShareText,
  buildWhatsAppShareUrl,
} from "@/lib/memberSlug";
import frontBg from "@assets/Polosan_Member_Card_Temantiket_1777540855821.png";
import backBg from "@assets/Polosan_Member_Card_Temantiket_Back_1777540855822.png";

/**
 * MemberCard — Two-sided "Temantiket Member Card" untuk klien:
 *   • Sisi depan : identitas (nama, member ID, tanggal join).
 *   • Sisi belakang : "Member Point" — grid 4x4 yg di-stamp otomatis dari
 *     setiap order sukses milik klien.
 *
 * Stamp legend (urut sesuai polosan belakang):
 *   ✈  Tiket Pesawat       (order type "flight")
 *   △  Visa on Arrival     (order type "visa_voa")
 *   🏙 Visa Transit Dubai  (metadata.transitType === "dubai")
 *   🕋 Visa Transit Saudi  (order type "umrah", default)
 *   📘 Visa Entry Student  (order type "visa_student")
 *
 * Order dianggap "sukses" kalau status ∈ {Confirmed, Paid, Completed}.
 */

/** Lite shape — kompatibel dgn tipe `Client` dari repo, juga dipake utk halaman publik. */
export interface MemberCardClient {
  name: string;
  createdAt: string;
  /** Optional: nomor HP (utk prefill recipient WhatsApp share). */
  phone?: string | null;
}

/** Lite shape — kompatibel dgn tipe `Order`, juga dipake utk halaman publik. */
export interface MemberCardOrder {
  type: string;
  status: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
  /** Override langsung dari payload publik (RPC `get_member_card`). */
  transitType?: string | null;
}

interface Props {
  client: MemberCardClient;
  /** Urutan kronologis client di agency (1-based). Dipakai sbg Member ID. */
  memberIndex: number;
  /** Semua order milik client. Sisi belakang akan otomatis di-stamp. */
  orders: MemberCardOrder[];
  /** Kalau ada → tombol "Share to WhatsApp" muncul. */
  publicUrl?: string;
  /** Sembunyiin tombol Download/Share/Flip-button (mode read-only utk publik kalau perlu). */
  readOnly?: boolean;
}

const SUCCESS_STATUSES = new Set(["Confirmed", "Paid", "Completed"]);

type StampKind = "flight" | "voa" | "transit_dubai" | "transit_saudi" | "student";

function stampKindFor(o: MemberCardOrder): StampKind {
  // Cek transitType override (dari RPC publik atau metadata.transitType).
  const transit =
    o.transitType ??
    (o.metadata as { transitType?: string } | null | undefined)?.transitType;
  if (transit === "dubai") return "transit_dubai";
  if (transit === "saudi") return "transit_saudi";
  switch (o.type) {
    case "flight": return "flight";
    case "visa_voa": return "voa";
    case "visa_student": return "student";
    case "umrah":
    default: return "transit_saudi";
  }
}

// ── Inline SVG icons (semua white stroke, match estetika polosan) ───────────
function PlaneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 13.5c0 .8-.7 1.5-1.5 1.5l-5.5-.5-3 6h-2l1.5-6.5L5 13l-2 1.5H1.5L3 11 1.5 7.5H3l2 1.5 5.5-1L9 1.5h2l3 6 5.5-.5c.8 0 1.5.7 1.5 1.5z"/>
    </svg>
  );
}
function TriangleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4 3 20h18Z"/>
    </svg>
  );
}
function BurjIcon({ className }: { className?: string }) {
  // Stylized Burj Al Arab silhouette — sail-shape skyscraper.
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2c-1 6-3 12-5 18h10c-2-6-4-12-5-18Z"/>
      <path d="M9 8c1 1 5 1 6 0"/>
      <path d="M8 13c1.5 1 6.5 1 8 0"/>
      <path d="M7 18h10"/>
      <path d="M12 2v18"/>
    </svg>
  );
}
function KaabahIcon({ className }: { className?: string }) {
  // Stylized Ka'bah — cube w/ door.
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="6" width="16" height="14" rx="0.5"/>
      <path d="M4 10h16"/>
      <rect x="13.5" y="13" width="3" height="7"/>
    </svg>
  );
}
function PassportIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2.5" width="14" height="19" rx="1.5"/>
      <circle cx="12" cy="10.5" r="3.2"/>
      <path d="M12 7.3v6.4M8.8 10.5h6.4"/>
      <path d="M9 17.5h6"/>
    </svg>
  );
}

function StampIcon({ kind, className }: { kind: StampKind; className?: string }) {
  switch (kind) {
    case "flight":         return <PlaneIcon className={className} />;
    case "voa":            return <TriangleIcon className={className} />;
    case "transit_dubai":  return <BurjIcon className={className} />;
    case "transit_saudi":  return <KaabahIcon className={className} />;
    case "student":        return <PassportIcon className={className} />;
  }
}

// ── Date formatters ────────────────────────────────────────────────────────
function fmtSinceShort(iso: string): string {
  // DD/MM/YY
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}
function fmtStampDate(iso: string): string {
  // D/MM/YYYY (match reference: "3/03/2026")
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// ── Card faces ─────────────────────────────────────────────────────────────
const CardFront = ({
  name, memberId, since, innerRef,
}: { name: string; memberId: string; since: string; innerRef?: React.Ref<HTMLDivElement> }) => (
  <div
    ref={innerRef}
    className="relative w-full overflow-hidden rounded-2xl bg-cover bg-center text-white shadow-xl"
    style={{ backgroundImage: `url(${frontBg})`, aspectRatio: "4 / 5" }}
  >
    {/* #TMNTKT code — top-left, di bawah judul polosan */}
    <div
      className="absolute font-semibold tracking-tight text-[#0e3a8a]"
      style={{ left: "8.5%", top: "23%", fontSize: "5.2cqw", lineHeight: 1 }}
    >
      #TMNTKT{memberId}
    </div>

    {/* Nama klien — bottom-left */}
    <div
      className="absolute leading-[1.05] text-white"
      style={{
        left: "8.5%",
        bottom: "8%",
        right: "45%",
        fontSize: "6.5cqw",
        fontFamily: "'Sk-Modernist', sans-serif",
        fontWeight: 700,
        textTransform: "none",
        textShadow: "0 1px 2px rgba(0,0,0,0.18)",
      }}
    >
      {name.split(" ").map((part, i) => (
        <div key={i}>{part}</div>
      ))}
    </div>

    {/* Member ID + Since — bottom-right */}
    <div
      className="absolute text-right text-white"
      style={{ right: "8.5%", bottom: "8.5%", fontFamily: "'Sk-Modernist', sans-serif" }}
    >
      <div className="leading-tight" style={{ fontSize: "7.2cqw", fontWeight: 400 }}>
        Member
      </div>
      <div className="leading-tight" style={{ fontSize: "7.2cqw", fontWeight: 700 }}>
        ID. {memberId}
      </div>
      <div className="opacity-95 mt-1" style={{ fontSize: "3.6cqw", fontWeight: 400 }}>
        Since {since}
      </div>
    </div>
  </div>
);

const CardBack = ({
  stamps, memberId, since, innerRef,
}: {
  stamps: Array<{ kind: StampKind; date: string }>;
  memberId: string;
  since: string;
  innerRef?: React.Ref<HTMLDivElement>;
}) => {
  // Build 16 cells; fill first N from stamps array
  const cells = Array.from({ length: 16 }, (_, i) => stamps[i] ?? null);
  return (
    <div
      ref={innerRef}
      className="relative w-full overflow-hidden rounded-2xl bg-cover bg-center text-white shadow-xl"
      style={{ backgroundImage: `url(${backBg})`, aspectRatio: "4 / 5" }}
    >
      {/* 4x4 stamp grid overlay — sits on top of the empty boxes drawn in the polosan */}
      <div
        className="absolute grid grid-cols-4"
        style={{
          left: "13.5%",
          right: "13.5%",
          top: "18.7%",
          gap: "2.6%",
        }}
      >
        {cells.map((stamp, i) => (
          <div
            key={i}
            className="flex flex-col items-center justify-center"
            style={{ aspectRatio: "1 / 1" }}
          >
            {stamp && (
              <>
                <StampIcon kind={stamp.kind} className="w-[55%] h-[55%] text-white" />
                <div
                  className="font-medium text-white mt-[2%]"
                  style={{ fontSize: "2.6cqw", lineHeight: 1 }}
                >
                  {stamp.date}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Member ID di kanan-bawah (sesuai TMNTKT-010 B) */}
      <div
        className="absolute text-right text-white"
        style={{ right: "8.5%", bottom: "5.5%", fontFamily: "'Sk-Modernist', sans-serif" }}
      >
        <div className="leading-tight" style={{ fontSize: "7.2cqw", fontWeight: 400 }}>
          Member
        </div>
        <div className="leading-tight" style={{ fontSize: "7.2cqw", fontWeight: 700 }}>
          ID. {memberId}
        </div>
        <div className="opacity-95 mt-1" style={{ fontSize: "3.4cqw", fontWeight: 400 }}>
          Since {since}
        </div>
      </div>
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────
export default function MemberCard({
  client, memberIndex, orders, publicUrl, readOnly = false,
}: Props) {
  const [flipped, setFlipped] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);

  const memberId = useMemo(() => String(memberIndex).padStart(4, "0"), [memberIndex]);
  const since = useMemo(() => fmtSinceShort(client.createdAt), [client.createdAt]);
  const safeName = useMemo(
    () => (client.name ?? "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/_+$/g, "").slice(0, 40) || "member",
    [client.name],
  );

  const stamps = useMemo(() => {
    return orders
      .filter((o) => SUCCESS_STATUSES.has(o.status))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(0, 16)
      .map((o) => ({ kind: stampKindFor(o), date: fmtStampDate(o.createdAt) }));
  }, [orders]);

  /** Render kedua sisi → array { suffix, dataUrl, blob, file }. */
  async function renderBothFaces() {
    const targets: Array<{ ref: React.RefObject<HTMLDivElement>; suffix: string }> = [
      { ref: frontRef, suffix: "depan" },
      { ref: backRef, suffix: "belakang" },
    ];
    const out: Array<{ suffix: string; dataUrl: string; blob: Blob; file: File }> = [];
    for (const t of targets) {
      if (!t.ref.current) continue;
      const dataUrl = await htmlToImage.toPng(t.ref.current, { pixelRatio: 2, cacheBust: true });
      const blob = await (await fetch(dataUrl)).blob();
      const filename = `member-card_${safeName}_TMNTKT${memberId}_${t.suffix}.png`;
      out.push({
        suffix: t.suffix,
        dataUrl,
        blob,
        file: new File([blob], filename, { type: "image/png" }),
      });
    }
    return out;
  }

  /** Trigger browser download untuk satu file. */
  function triggerDownload(dataUrl: string, suffix: string) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `member-card_${safeName}_TMNTKT${memberId}_${suffix}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const faces = await renderBothFaces();
      for (const f of faces) triggerDownload(f.dataUrl, f.suffix);
      toast.success("Member Card di-download", {
        description: "2 file PNG (depan + belakang) tersimpan di folder Download.",
      });
    } catch (e) {
      console.error("[MemberCard] download failed:", e);
      toast.error("Gagal download", {
        description: e instanceof Error ? e.message : "Coba lagi.",
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleShareWhatsApp = async () => {
    if (!publicUrl) return;
    setSharing(true);
    try {
      const faces = await renderBothFaces();
      const text = buildWhatsAppShareText({ clientName: client.name, publicUrl });

      // 1) Mobile (iOS/Android): coba native share sheet — bisa attach gambar +
      //    text sekaligus, user tinggal pilih WhatsApp.
      const files = faces.map((f) => f.file);
      const navAny = navigator as Navigator & {
        canShare?: (data: { files?: File[] }) => boolean;
        share?: (data: ShareData & { files?: File[] }) => Promise<void>;
      };
      if (navAny.share && navAny.canShare?.({ files })) {
        try {
          await navAny.share({ files, text, title: "Temantiket Member Card" });
          toast.success("Share dialog terbuka");
          return;
        } catch (err) {
          // User cancel → diam aja
          if (err instanceof Error && err.name === "AbortError") return;
          // fall-through ke fallback
        }
      }

      // 2) Fallback (desktop / browser tanpa Web Share Files): download dulu →
      //    buka wa.me link supaya user tinggal attach manual.
      for (const f of faces) triggerDownload(f.dataUrl, f.suffix);
      const waUrl = buildWhatsAppShareUrl({ phone: client.phone, text });
      window.open(waUrl, "_blank", "noopener");
      toast.success("WhatsApp terbuka", {
        description: "2 file PNG sudah di-download — tinggal attach ke chat.",
      });
    } catch (e) {
      console.error("[MemberCard] share failed:", e);
      toast.error("Gagal share", {
        description: e instanceof Error ? e.message : "Coba lagi.",
      });
    } finally {
      setSharing(false);
    }
  };

  const successCount = stamps.length;

  return (
    <div className="space-y-3">
      {/* Header: judul + tombol */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-base font-semibold">Member Card</h3>
          <p className="text-[11.5px] text-muted-foreground">
            Member ID. <span className="font-mono font-semibold">TMNTKT{memberId}</span> ·
            {" "}{successCount} dari 16 stamp terisi
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setFlipped((f) => !f)}>
            <RotateCw className="h-3.5 w-3.5 mr-1.5" />
            {flipped ? "Lihat Depan" : "Lihat Belakang"}
          </Button>
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={handleDownload} disabled={downloading || sharing}>
              {downloading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
              Download
            </Button>
          )}
          {!readOnly && publicUrl && (
            <Button
              size="sm"
              onClick={handleShareWhatsApp}
              disabled={sharing || downloading}
              className="bg-[#25D366] hover:bg-[#1eb858] text-white"
            >
              {sharing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5 mr-1.5" />}
              Share ke WhatsApp
            </Button>
          )}
        </div>
      </div>

      {/* Visible (flipping) card — yg ini tampil di UI */}
      <div
        className="relative mx-auto w-full max-w-[360px]"
        style={{ aspectRatio: "4 / 5", perspective: "1500px", containerType: "inline-size" } as React.CSSProperties}
      >
        <div
          className="absolute inset-0 transition-transform duration-700"
          style={{
            transformStyle: "preserve-3d",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
          onClick={() => setFlipped((f) => !f)}
          role="button"
          aria-label="Klik untuk balik kartu"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setFlipped((f) => !f); }}
        >
          <div className="absolute inset-0 cursor-pointer" style={{ backfaceVisibility: "hidden" }}>
            <CardFront name={client.name || "—"} memberId={memberId} since={since} />
          </div>
          <div
            className="absolute inset-0 cursor-pointer"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <CardBack stamps={stamps} memberId={memberId} since={since} />
          </div>
        </div>
      </div>

      {/* Hidden render targets buat html-to-image — full-size, posisi off-screen,
          tapi tetap di-layout supaya cqw container queries bisa dihitung. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "-99999px",
          top: 0,
          width: "720px",
          containerType: "inline-size",
          pointerEvents: "none",
        } as React.CSSProperties}
      >
        <CardFront innerRef={frontRef} name={client.name || "—"} memberId={memberId} since={since} />
        <div style={{ height: 24 }} />
        <CardBack innerRef={backRef} stamps={stamps} memberId={memberId} since={since} />
      </div>
    </div>
  );
}
