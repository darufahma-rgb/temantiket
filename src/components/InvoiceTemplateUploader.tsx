/**
 * InvoiceTemplateUploader — Settings panel section.
 * Allows uploading a custom invoice background image (PNG/JPG).
 * Persists via invoiceStore → localStorage.
 */
import { useRef, useState, useEffect } from "react";
import { Upload, Trash2, ImageIcon, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useInvoiceStore } from "@/store/invoiceStore";

export function InvoiceTemplateUploader() {
  const { templateDataUrl, setTemplate, clearTemplate, loadTemplate } = useInvoiceStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    loadTemplate();
  }, [loadTemplate]);

  useEffect(() => {
    setPreview(templateDataUrl);
  }, [templateDataUrl]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Hanya file gambar yang didukung (PNG, JPG).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Ukuran file maksimal 5 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setTemplate(dataUrl);
      setPreview(dataUrl);
      toast.success("Template berhasil diupload!", {
        description: "Invoice berikutnya akan menggunakan template ini.",
      });
    };
    reader.readAsDataURL(file);

    // reset input so same file can be re-selected
    e.target.value = "";
  };

  const handleClear = () => {
    clearTemplate();
    setPreview(null);
    toast.info("Template dihapus. Invoice akan menggunakan template bawaan Temantiket.");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ImageIcon className="h-4 w-4 text-sky-500" />
        <span className="text-sm font-semibold">Template Invoice Kustom</span>
        {templateDataUrl && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
            <CheckCircle2 className="h-3 w-3" /> Aktif
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Upload gambar template invoice kustom (PNG/JPG, maks 5 MB). Data order akan di-overlay di atas template.
        Kosongkan untuk menggunakan template bawaan Temantiket.
      </p>

      {preview ? (
        <div className="relative rounded-xl overflow-hidden border border-border">
          <img
            src={preview}
            alt="Template preview"
            className="w-full max-h-48 object-contain bg-muted/30"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent flex items-end p-3">
            <span className="text-white text-xs font-medium">Template aktif</span>
          </div>
          <button
            onClick={handleClear}
            className="absolute top-2 right-2 rounded-full bg-white/90 p-1.5 text-red-500 hover:bg-white shadow-sm"
            title="Hapus template"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full rounded-xl border-2 border-dashed border-border hover:border-sky-300 transition-colors p-6 flex flex-col items-center gap-2 text-muted-foreground hover:text-sky-500"
        >
          <Upload className="h-7 w-7" />
          <span className="text-sm font-medium">Klik untuk upload template</span>
          <span className="text-xs">PNG atau JPG, A4 landscape atau portrait</span>
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg"
        className="hidden"
        onChange={handleFile}
      />

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="gap-1.5">
          <Upload className="h-3.5 w-3.5" />
          {preview ? "Ganti Template" : "Upload Template"}
        </Button>
        {preview && (
          <Button variant="outline" size="sm" onClick={handleClear} className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50">
            <Trash2 className="h-3.5 w-3.5" />
            Hapus
          </Button>
        )}
      </div>
    </div>
  );
}
