import { useMemo, useRef, useState } from "react";
import * as htmlToImage from "html-to-image";
import { Download, RotateCw, Loader2, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  buildWhatsAppShareText,
  buildWhatsAppShareUrl,
} from "@/lib/memberSlug";
import frontBg from "@assets/Polosan_Member_Card_Temantiket_1777540855821.png";
import backBg from "@assets/Polosan_Member_Card_Temantiket_Back_1777540855822.png";

const toTitleCase = (str: string) =>
  str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

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
  id?: string;
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
  /** Bonus stamp dari referral — ditambahkan ke grid setelah order stamps. */
  referralStamps?: number;
  /** Kalau ada → tombol "Share to WhatsApp" muncul. */
  publicUrl?: string;
  /** Sembunyiin tombol Download/Share/Flip-button (mode read-only utk publik kalau perlu). */
  readOnly?: boolean;
  /** Kalau true → tampilkan tombol hapus stamp di setiap sel terisi (owner/admin only). */
  isOwner?: boolean;
  /** Callback saat owner menghapus stamp dari order. orderId = ID order yg di-stamp. */
  onDeleteOrderStamp?: (orderId: string) => Promise<void>;
  /** Callback saat owner menghapus satu referral stamp. */
  onDeleteReferralStamp?: () => Promise<void>;
}

const SUCCESS_STATUSES = new Set(["Confirmed", "Paid", "Completed"]);

type StampKind = "flight" | "voa" | "transit_dubai" | "transit_saudi" | "student" | "referral";

/** Internal stamp with source metadata for deletion. */
interface StampCell {
  kind: StampKind;
  date: string;
  /** Set if this stamp originated from an order. */
  orderId?: string;
  /** Set if this stamp is a referral bonus. */
  isReferral?: boolean;
}

function stampKindFor(o: MemberCardOrder): StampKind {
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

function HandshakeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4"/>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
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
    case "referral":       return <HandshakeIcon className={className} />;
  }
}

// ── Date formatters ────────────────────────────────────────────────────────
function fmtSinceShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}
function fmtStampDate(iso: string): string {
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
    <div
      className="absolute font-semibold tracking-tight text-[#0e3a8a]"
      style={{ left: "8.5%", top: "23%", fontSize: "5.2cqw", lineHeight: 1 }}
    >
      #TMNTKT{memberId}
    </div>

    <div
      className="absolute leading-[1.05] text-white"
      style={{
        left: "8.5%",
        bottom: "8%",
        right: "45%",
        fontSize: "7.5cqw",
        fontFamily: "'Sk-Modernist', sans-serif",
        fontWeight: 700,
        textTransform: "none",
        textShadow: "0 1px 2px rgba(0,0,0,0.18)",
      }}
    >
      {toTitleCase(name).split(" ").slice(0, 3).map((part, i) => (
        <div key={i}>{part}</div>
      ))}
    </div>

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
  stamps, memberId, since, innerRef, isOwner, onDeleteStamp,
}: {
  stamps: StampCell[];
  memberId: string;
  since: string;
  innerRef?: React.Ref<HTMLDivElement>;
  isOwner?: boolean;
  onDeleteStamp?: (stamp: StampCell, index: number) => void;
}) => {
  const cells = Array.from({ length: 16 }, (_, i) => stamps[i] ?? null);
  return (
    <div
      ref={innerRef}
      className="relative w-full overflow-hidden rounded-2xl bg-cover bg-center text-white shadow-xl"
      style={{ backgroundImage: `url(${backBg})`, aspectRatio: "4 / 5" }}
    >
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
            className="relative flex flex-col items-center justify-center"
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
                {isOwner && onDeleteStamp && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteStamp(stamp, i); }}
                    className="absolute -top-[6%] -right-[6%] w-[28%] h-[28%] rounded-full bg-red-500 hover:bg-red-600 active:bg-red-700 text-white flex items-center justify-center shadow-lg transition-colors z-10"
                    style={{ minWidth: "14px", minHeight: "14px" }}
                    title="Hapus stamp ini"
                  >
                    <X style={{ width: "60%", height: "60%" }} />
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>

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
  client, memberIndex, orders, referralStamps = 0, publicUrl, readOnly = false,
  isOwner = false, onDeleteOrderStamp, onDeleteReferralStamp,
}: Props) {
  const [flipped, setFlipped] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [deletingStamp, setDeletingStamp] = useState<StampCell | null>(null);
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);

  const memberId = useMemo(() => String(memberIndex).padStart(4, "0"), [memberIndex]);
  const since = useMemo(() => fmtSinceShort(client.createdAt), [client.createdAt]);
  const safeName = useMemo(
    () => (client.name ?? "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/_+$/g, "").slice(0, 40) || "member",
    [client.name],
  );

  const stamps = useMemo((): StampCell[] => {
    const orderStamps: StampCell[] = orders
      .filter((o) => SUCCESS_STATUSES.has(o.status))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((o) => ({
        kind: stampKindFor(o),
        date: fmtStampDate(o.createdAt),
        orderId: o.id,
      }));
    const referralSlots: StampCell[] = Array.from({ length: referralStamps }, () => ({
      kind: "referral" as StampKind,
      date: "Referral",
      isReferral: true,
    }));
    return [...orderStamps, ...referralSlots].slice(0, 16);
  }, [orders, referralStamps]);

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
          if (err instanceof Error && err.name === "AbortError") return;
        }
      }

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

  const handleStampDeleteRequest = (stamp: StampCell, index: number) => {
    setDeletingStamp(stamp);
    setDeletingIndex(index);
  };

  const handleStampDeleteConfirm = async () => {
    if (!deletingStamp) return;
    setDeleting(true);
    try {
      if (deletingStamp.isReferral && onDeleteReferralStamp) {
        await onDeleteReferralStamp();
        toast.success("Stamp referral dihapus");
      } else if (deletingStamp.orderId && onDeleteOrderStamp) {
        await onDeleteOrderStamp(deletingStamp.orderId);
        toast.success("Stamp order dihapus");
      }
    } catch (e) {
      toast.error("Gagal hapus stamp", {
        description: e instanceof Error ? e.message : "Coba lagi.",
      });
    } finally {
      setDeleting(false);
      setDeletingStamp(null);
      setDeletingIndex(null);
    }
  };

  const successCount = stamps.length;

  const showDeleteButtons = isOwner && !readOnly && (!!onDeleteOrderStamp || !!onDeleteReferralStamp);

  return (
    <div className="space-y-3">
      {/* Header */}
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

      {showDeleteButtons && (
        <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11.5px] text-amber-800">
          <span className="text-base">🛡️</span>
          <span>Mode Owner — balik kartu lalu klik tombol <strong>×</strong> merah di stamp untuk menghapus</span>
        </div>
      )}

      {/* Visible (flipping) card */}
      <div
        className={`relative mx-auto w-full max-w-[360px] ${showDeleteButtons ? "group" : ""}`}
        style={{ aspectRatio: "4 / 5", perspective: "1500px", containerType: "inline-size" } as React.CSSProperties}
      >
        <div
          className="absolute inset-0 transition-transform duration-700"
          style={{
            transformStyle: "preserve-3d",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
          onClick={() => { if (!showDeleteButtons) setFlipped((f) => !f); }}
          role={showDeleteButtons ? undefined : "button"}
          aria-label={showDeleteButtons ? undefined : "Klik untuk balik kartu"}
          tabIndex={showDeleteButtons ? undefined : 0}
          onKeyDown={(e) => {
            if (!showDeleteButtons && (e.key === "Enter" || e.key === " ")) setFlipped((f) => !f);
          }}
        >
          <div className="absolute inset-0 cursor-pointer" style={{ backfaceVisibility: "hidden" }}>
            <CardFront name={client.name || "—"} memberId={memberId} since={since} />
          </div>
          <div
            className="absolute inset-0"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <CardBack
              stamps={stamps}
              memberId={memberId}
              since={since}
              isOwner={showDeleteButtons}
              onDeleteStamp={showDeleteButtons ? handleStampDeleteRequest : undefined}
            />
          </div>
        </div>
      </div>

      {/* Hidden render targets — off-screen, full-size for html-to-image */}
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

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!deletingStamp}
        onOpenChange={(open) => { if (!open && !deleting) { setDeletingStamp(null); setDeletingIndex(null); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Stamp?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingStamp?.isReferral
                ? "Stamp referral ini akan dihapus dari kartu member klien. Jumlah total stamp akan berkurang 1."
                : `Stamp ke-${(deletingIndex ?? 0) + 1} (${deletingStamp?.date}) akan dihapus dari kartu member klien. Aksi ini tidak dapat dibatalkan.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleStampDeleteConfirm}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Menghapus…</> : "Ya, Hapus Stamp"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
