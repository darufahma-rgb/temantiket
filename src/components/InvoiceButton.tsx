/**
 * InvoiceButton — "Cetak Invoice" button for OrderDetail page.
 * Generates PDF and auto-downloads it. Also stores blob URL in invoiceStore
 * so the AI Command Center can reference it.
 */
import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { generateInvoicePdf, nextInvoiceNumber, todayString } from "@/lib/invoiceGenerator";
import { useInvoiceStore } from "@/store/invoiceStore";
import { loadIghAdminSettings } from "@/lib/ighSettings";
import type { Order } from "@/features/orders/ordersRepo";
import type { Client } from "@/store/clientsStore";

interface Props {
  order: Order;
  client: Client | null;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
  className?: string;
}

export function InvoiceButton({ order, client, variant = "outline", size = "sm", className }: Props) {
  const [generating, setGenerating] = useState(false);
  const { templateDataUrl, setLastInvoice } = useInvoiceStore();

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const settings = loadIghAdminSettings();
      const invoiceNumber = nextInvoiceNumber();
      const invoiceDate   = todayString();

      const pdfBytes = await generateInvoicePdf({
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
  );
}
