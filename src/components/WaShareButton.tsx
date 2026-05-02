/**
 * WaShareButton — Fase 29
 * Universal "Kirim via WhatsApp" button.
 *
 * mode="file"  → tries Web Share API (PDF attachment) first,
 *                falls back to wa.me text link.
 * mode="text"  → wa.me pre-filled text link (default).
 *
 * Use the `phone` prop to route directly to a recipient's WhatsApp number.
 * Without it, opens WhatsApp's generic share / contact picker.
 */
import { useState } from "react";
import { MessageCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { normalizePhoneForWa } from "@/lib/memberSlug";

export interface WaShareButtonProps {
  /** Pre-filled message text (always sent, even in file mode as caption). */
  text: string;
  /** Recipient phone (international or Indonesian local format). */
  phone?: string | null;
  /** PDF bytes for file-share mode (requires modern browser). */
  pdfBytes?: Uint8Array | null;
  /** File name when sharing PDF. */
  fileName?: string;
  mode?: "text" | "file";
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  label?: string;
  disabled?: boolean;
}

export function WaShareButton({
  text,
  phone,
  pdfBytes,
  fileName = "dokumen.pdf",
  mode = "text",
  variant = "outline",
  size = "sm",
  className,
  label = "Kirim via WA",
  disabled = false,
}: WaShareButtonProps) {
  const [sharing, setSharing] = useState(false);

  const openWaText = () => {
    const recipient = normalizePhoneForWa(phone);
    const encoded   = encodeURIComponent(text);
    const url = recipient
      ? `https://wa.me/${recipient}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleShare = async () => {
    if (sharing || disabled) return;
    setSharing(true);
    try {
      if (mode === "file" && pdfBytes && typeof navigator.share === "function") {
        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        const file = new File([blob], fileName, { type: "application/pdf" });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], text });
          toast.success("Dokumen siap dibagikan");
          return;
        }
      }
      // Fallback / text mode
      openWaText();
      toast.success("WhatsApp dibuka dengan pesan otomatis");
    } catch (err) {
      // User cancelled share (AbortError) — not an error
      if ((err as Error)?.name !== "AbortError") {
        openWaText();
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleShare}
      disabled={disabled || sharing}
      className={cn(
        "border-[#25D366]/40 text-[#128C7E] hover:bg-[#f0fdf4] hover:border-[#25D366]",
        className,
      )}
      title="Kirim via WhatsApp"
    >
      {sharing
        ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
        : <MessageCircle className="h-3.5 w-3.5 mr-1.5" />}
      {sharing ? "Membuka…" : label}
    </Button>
  );
}
