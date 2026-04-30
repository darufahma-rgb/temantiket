import { useRef, useState } from "react";
import { ScanLine, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { scanPassport, type PassportData } from "@/lib/ocrPassport";
import { toast } from "sonner";

/**
 * Tombol scan paspor — wraps OCR pipeline jadi 1 klik.
 *
 * Ngebuka file picker (`accept="image/*"` + `capture` di mobile), lalu jalanin
 * scanPassport (Tesseract → fallback OpenAI). Hasil PassportData di-pass ke
 * parent via `onScanned`.
 *
 * Foto di-pass sebagai dataUrl supaya parent bisa simpen ke client.photoDataUrl
 * tanpa re-baca file.
 */
export function PassportScanButton({
  onScanned,
  label = "Scan Paspor",
  variant = "outline",
  size = "sm",
  aiOnly = false,
  className,
}: {
  onScanned: (data: PassportData, photoDataUrl: string) => void | Promise<void>;
  label?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  aiOnly?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFile = async (file: File) => {
    setScanning(true);
    setProgress(0);
    try {
      const dataUrl = await fileToDataUrl(file);
      const result = await scanPassport(file, setProgress, { aiOnly });
      await onScanned(result, dataUrl);
    } catch (e) {
      toast.error("Scan paspor gagal", {
        description: e instanceof Error ? e.message : "Coba foto ulang dgn lebih jelas.",
      });
    } finally {
      setScanning(false);
      setProgress(0);
      // Reset value supaya bisa pilih file yg sama lagi
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={scanning}
        onClick={() => inputRef.current?.click()}
      >
        {scanning ? (
          <>
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            Scanning… {progress > 0 ? `${progress}%` : ""}
          </>
        ) : (
          <>
            <ScanLine className="h-3.5 w-3.5 mr-1.5" />
            {label}
          </>
        )}
      </Button>
    </>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("File read error"));
    reader.readAsDataURL(file);
  });
}
