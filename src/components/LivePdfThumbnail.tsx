import { useEffect, useRef, useState } from "react";
import { Loader2, Maximize2 } from "lucide-react";
import { renderIghPdfPreview, type IghPdfData } from "@/lib/generateIghPdf";

interface Props {
  data: IghPdfData;
  /** Klik thumbnail → buka preview full (mis. dialog). Optional. */
  onClick?: () => void;
  /** Debounce ms sebelum re-render (default 500). */
  debounceMs?: number;
}

/**
 * Thumbnail PDF live yang auto re-render tiap kali `data` berubah.
 * Re-render di-debounce supaya nggak bikin lag pas user ngetik cepet.
 * Thumbnail lama tetep ditampilkan (fade) sampe yang baru siap → no flicker.
 */
export function LivePdfThumbnail({ data, onClick, debounceMs = 500 }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dataKey = JSON.stringify(data);
  const isFirst = useRef(true);

  useEffect(() => {
    let cancelled = false;
    const initial = isFirst.current;
    isFirst.current = false;

    setLoading(true);
    setError(null);

    const delay = initial ? 0 : debounceMs;
    const timer = window.setTimeout(() => {
      renderIghPdfPreview(data, 0.9)
        .then((url) => { if (!cancelled) setPreviewUrl(url); })
        .catch((err) => {
          console.error("Live thumbnail render failed", err);
          if (!cancelled) setError("Preview gagal dimuat");
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, delay);

    return () => { cancelled = true; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, debounceMs]);

  const Wrapper: React.ElementType = onClick ? "button" : "div";

  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`group relative block w-full rounded-xl border-2 border-orange-200 bg-slate-50 overflow-hidden ${
        onClick ? "cursor-pointer hover:border-orange-400 transition-colors" : ""
      }`}
      title={onClick ? "Klik buat preview ukuran penuh" : undefined}
      style={{ aspectRatio: "740 / 1024" }}
    >
      {previewUrl ? (
        <img
          src={previewUrl}
          alt="Live preview PDF"
          className="absolute inset-0 w-full h-full object-contain transition-opacity duration-200"
          style={{ opacity: loading ? 0.55 : 1 }}
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-[10px] font-medium">
          {error ?? "Menyiapkan preview…"}
        </div>
      )}

      {loading && (
        <div className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 h-5 px-1.5 rounded-md bg-white/95 border border-slate-200 text-[9px] font-bold text-slate-600 shadow-sm">
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
          Render
        </div>
      )}

      {onClick && previewUrl && !loading && (
        <div className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 h-5 px-1.5 rounded-md bg-white/95 border border-slate-200 text-[9px] font-bold text-slate-700 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
          <Maximize2 className="h-2.5 w-2.5" />
          Perbesar
        </div>
      )}
    </Wrapper>
  );
}
