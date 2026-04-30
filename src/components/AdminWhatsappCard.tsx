import { useEffect, useState } from "react";
import { MessageCircle, Copy, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  loadIghAdminSettings,
  formatWhatsappDisplay,
  whatsappUrl,
  whatsappDigits,
  type IghAdminSettings,
} from "@/lib/ighSettings";
import { cn } from "@/lib/utils";

/**
 * Kartu kontak WhatsApp admin (Syamil IGH) untuk operasional internal.
 * - Tampilkan nomor dengan format display Indonesia (+62 822-4519-3615).
 * - Tombol Copy → ke clipboard (digit-only) supaya admin bisa langsung paste.
 * - Tombol Buka → wa.me/{digits} di tab baru.
 *
 * Dipakai di Dashboard. Auto-refresh saat user ngedit di Settings (via
 * custom event dari saveIghAdminSettings).
 */
export function AdminWhatsappCard({ className }: { className?: string }) {
  const [admin, setAdmin] = useState<IghAdminSettings>(() => loadIghAdminSettings());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<IghAdminSettings>).detail;
      if (detail) setAdmin(detail);
      else setAdmin(loadIghAdminSettings());
    };
    window.addEventListener("igh:admin-settings-changed", onChange);
    return () => window.removeEventListener("igh:admin-settings-changed", onChange);
  }, []);

  const display = formatWhatsappDisplay(admin.adminWhatsapp);
  const digits = whatsappDigits(admin.adminWhatsapp);
  const url = whatsappUrl(admin.adminWhatsapp);
  if (digits.length < 8) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(digits);
      setCopied(true);
      toast.success("Nomor WhatsApp tersalin");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Gagal menyalin");
    }
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-3 flex items-center gap-3",
        className,
      )}
    >
      <div className="h-9 w-9 rounded-xl bg-[#25D366] flex items-center justify-center shrink-0 shadow-sm">
        <MessageCircle className="h-4 w-4 text-white" strokeWidth={2.5} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] font-semibold text-emerald-700 uppercase tracking-wider">
          WhatsApp Admin
        </p>
        <p className="text-[13.5px] font-bold text-[hsl(var(--foreground))] truncate">
          {display}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            "h-8 w-8 rounded-lg flex items-center justify-center transition-colors",
            copied
              ? "bg-emerald-500 text-white"
              : "bg-white text-emerald-700 hover:bg-emerald-100 border border-emerald-200",
          )}
          title="Salin nomor"
          aria-label="Salin nomor WhatsApp"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="h-8 w-8 rounded-lg flex items-center justify-center bg-[#25D366] text-white hover:bg-[#1ebe57] transition-colors"
          title="Buka WhatsApp"
          aria-label="Buka WhatsApp"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}
