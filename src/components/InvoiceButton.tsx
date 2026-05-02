/**
 * InvoiceButton — "Cetak Invoice" button for OrderDetail page.
 * Generates PDF and auto-downloads it. Also stores blob URL in invoiceStore
 * so the AI Command Center can reference it.
 */
import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { nextInvoiceNumber, todayString } from "@/lib/invoiceGenerator";
import { generateInvoicePdfRemote } from "@/lib/exportPdfApi";
import { useInvoiceStore } from "@/store/invoiceStore";
import { loadIghAdminSettings } from "@/lib/ighSettings";
import { WaShareButton } from "@/components/WaShareButton";
import type { Order } from "@/features/orders/ordersRepo";
import type { Client } from "@/store/clientsStore";

const fmtIDRCompact = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);

interface Props {
  order: Order;
  client: Client | null;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
  className?: string;
  /** Phone number for WA dispatch (e.g. client.phone). */
  phone?: string | null;
}

export function InvoiceButton({ order, client, variant = "outline", size = "sm", className, phone }: Props) {
  const [generating, setGenerating] = useState(false);
  const [lastPdfBytes, setLastPdfBytes] = useState<Uint8Array | null>(null);
  const [lastWaText, setLastWaText]     = useState<string>("");
  const [lastFileName, setLastFileName] = useState<string>("invoice.pdf");
  const { templateDataUrl, setLastInvoice } = useInvoiceStore();

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const settings = loadIghAdminSettings();
      const invoiceNumber = nextInvoiceNumber();
      const invoiceDate   = todayString();

      const pdfBytes = await generateInvoicePdfRemote({
        invoiceNumber,
        invoiceDate,
        order,
        client,
        agencyName: "Temantiket",
        agencyPhone: settings.adminWhatsapp,
        agencyInstagram: settings.adminInstagram,
        templateDataUrl,
      });

      // Build blob URL & auto-download
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url  = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href     = url;
      a.download = `${invoiceNumber}_${(client?.name ?? order.title ?? "invoice").replace(/\s+/g, "_")}.pdf`;
      a.click();

      // Convert to data URL for AI store (revoke object URL first)
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        setLastInvoice(dataUrl, `${invoiceNumber} · ${client?.name ?? order.title ?? order.id.slice(0, 8)}`);
        URL.revokeObjectURL(url);
      };
      reader.readAsDataURL(blob);

      // Store for WA dispatch
      const fileName = `${invoiceNumber}_${(client?.name ?? order.title ?? "invoice").replace(/\s+/g, "_")}.pdf`;
      const waMsg = [
        `Halo${client?.name ? ` *${client.name}*` : ""}!`,
        ``,
        `Invoice Anda sudah siap 📄`,
        `No. Invoice: *${invoiceNumber}*`,
        `Tanggal: ${invoiceDate}`,
        `Total: *${fmtIDRCompact(Number(order.totalPrice))}*`,
        ``,
        `Terima kasih telah mempercayakan perjalanan Anda kepada *Temantiket* 🕋`,
      ].join("\n");
      setLastPdfBytes(pdfBytes);
      setLastWaText(waMsg);
      setLastFileName(fileName);

      toast.success(`Invoice ${invoiceNumber} berhasil dibuat`, {
        description: `Untuk ${client?.name ?? "—"}`,
        duration: 4000,
      });
    } catch (err) {
      console.error("Invoice generation error:", err);
      toast.error("Gagal membuat invoice", {
        description: err instanceof Error ? err.message : "Coba lagi.",
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant={variant}
        size={size}
        onClick={handleGenerate}
        disabled={generating}
        className={`border-emerald-200 text-emerald-700 hover:bg-emerald-50 ${className ?? ""}`}
        title="Cetak Invoice PDF"
      >
        {generating
          ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          : <FileDown className="h-3.5 w-3.5 mr-1.5" />
        }
        {generating ? "Membuat…" : "Cetak Invoice"}
      </Button>
      {lastPdfBytes && (
        <WaShareButton
          mode="file"
          text={lastWaText}
          phone={phone}
          pdfBytes={lastPdfBytes}
          fileName={lastFileName}
          size={size}
          label="Kirim WA"
        />
      )}
    </div>
  );
}
