import { useState } from "react";
import {
  FileEdit, Copy, CheckCheck, Loader2, RefreshCw, Trash2, ClipboardPaste,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/* ─── System Prompt ─────────────────────────────────────── */
const SYSTEM_PROMPT = `Kamu adalah Senior Technical Writer & Project Assistant di TemanTiket.

Tugas kamu: Menerima catatan revisi yang masih mentah/kasar, lalu menulis ulang menjadi versi yang jauh lebih rapi, profesional, dan enak dibaca, dengan diksi yang tepat dan sesuai konteks project management.

Aturan penting yang HARUS diikuti:
1. Pertahankan 100% maksud asli user. Jangan menambah atau mengurangi isi.
2. Perbaiki struktur, tata bahasa, ejaan, dan alur kalimat agar lebih profesional.
3. Gunakan diksi yang lebih baik, jelas, dan ringkas (hindari bahasa terlalu santai atau bertele-tele).
4. Ubah setiap poin menjadi action item yang lebih jelas dan actionable kalau memungkinkan.
5. Gunakan format bullet list yang konsisten dan rapi.
6. Jika ada poin yang mirip atau bisa digabung, gabungkan agar lebih efisien (tanpa mengubah arti).
7. Hasil akhir harus terasa seperti catatan revisi yang ditulis oleh orang yang terbiasa dokumentasi project.
8. Output HANYA berisi bullet list yang sudah dirapikan. Jangan tambahkan kata pengantar atau penutup.

Contoh perubahan diksi yang diinginkan:
- "masih belum bisa, lama gak selesai-selesai" → "Masih belum selesai diimplementasikan"
- "harus diperbaiki" → "Perlu diperbaiki / Diperlukan perbaikan pada..."
- "gue ngasih komisi dengan nominal paten" → "Komisi agen diberikan secara nominal tetap"

Output format:
- Gunakan bullet point (- )
- Setiap poin dimulai dengan huruf kapital
- Buat kalimat lengkap dan jelas`;

/* ─── API ───────────────────────────────────────────────── */
async function polishNotes(rawNotes: string): Promise<string> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: `Rapikan catatan revisi berikut:\n\n${rawNotes.trim()}` },
      ],
      temperature: 0.4,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) throw new Error(`AI error ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

/* ─── Component ─────────────────────────────────────────── */
export function RevisionNotesPolisher() {
  const [rawNotes, setRawNotes]   = useState("");
  const [result, setResult]       = useState("");
  const [loading, setLoading]     = useState(false);
  const [copied, setCopied]       = useState(false);

  const handlePolish = async () => {
    if (!rawNotes.trim()) { toast.error("Tulis catatan revisinya dulu ya"); return; }
    setLoading(true);
    setResult("");
    try {
      const polished = await polishNotes(rawNotes);
      setResult(polished);
    } catch (err) {
      toast.error(`Gagal proses: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    toast.success("Catatan disalin!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = () => {
    setRawNotes("");
    setResult("");
  };

  const charCount = rawNotes.length;

  return (
    <div className="space-y-4 pb-10">

      {/* ── Input ── */}
      <div className="rounded-xl border border-border/70 bg-white p-4 md:p-5 shadow-none">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ClipboardPaste className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            <h3 className="text-[13.5px] font-semibold text-foreground">Catatan Revisi (Versi Kasar)</h3>
          </div>
          {rawNotes && (
            <button
              onClick={handleClear}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="h-3 w-3" strokeWidth={1.5} />
              Hapus
            </button>
          )}
        </div>
        <textarea
          value={rawNotes}
          onChange={(e) => setRawNotes(e.target.value)}
          placeholder={
            "Tulis atau paste catatan revisi di sini, meskipun masih kasar / bullet berantakan.\n\n" +
            "Contoh:\n" +
            "- halaman order masih error pas klik detail\n" +
            "- filter tanggal belum bisa dipake\n" +
            "- loading lama banget di tabel jamaah\n" +
            "- tombol export pdf kadang gak keluar"
          }
          rows={10}
          className="w-full rounded-xl border border-border/70 bg-gray-50/60 px-3.5 py-3 text-[13px] text-foreground placeholder-muted-foreground/50 resize-none focus:outline-none focus:ring-2 focus:ring-[#1a44d4]/40 focus:border-[#1a44d4]/50 transition-all leading-relaxed"
        />
        <div className="flex items-center justify-between mt-1.5">
          <p className="text-[10.5px] text-muted-foreground">
            Tidak perlu rapi — tulis seadanya, AI yang akan beresin.
          </p>
          <span className={cn(
            "text-[10.5px] tabular-nums",
            charCount > 3000 ? "text-amber-500" : "text-muted-foreground/60",
          )}>
            {charCount.toLocaleString()} karakter
          </span>
        </div>
      </div>

      {/* ── Generate Button ── */}
      <Button
        onClick={() => void handlePolish()}
        disabled={loading || !rawNotes.trim()}
        className="w-full h-11 text-[13.5px] font-semibold bg-[#1a44d4] text-white hover:bg-[#1535b0] transition-all rounded-xl disabled:opacity-50"
      >
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.span key="loading" className="flex items-center gap-2"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Loader2 className="h-4 w-4 animate-spin" />
              AI sedang merapikan catatan…
            </motion.span>
          ) : result ? (
            <motion.span key="regen" className="flex items-center gap-2"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
              Proses Ulang
            </motion.span>
          ) : (
            <motion.span key="idle" className="flex items-center gap-2"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <FileEdit className="h-4 w-4" strokeWidth={1.5} />
              Rapikan Catatan
            </motion.span>
          )}
        </AnimatePresence>
      </Button>

      {/* ── Skeleton ── */}
      <AnimatePresence>
        {loading && (
          <motion.div key="skeleton"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-xl border border-border/70 bg-white p-4 md:p-5 animate-pulse space-y-3"
          >
            {[0.9, 1, 0.75, 0.85, 0.6].map((w, i) => (
              <div key={i} className="h-2.5 bg-muted rounded" style={{ width: `${w * 100}%` }} />
            ))}
          </motion.div>
        )}

        {/* ── Result ── */}
        {!loading && result && (
          <motion.div key="result"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-border/70 bg-white p-4 md:p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileEdit className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                <h3 className="text-[13.5px] font-semibold text-foreground">Hasil — Versi Rapi</h3>
              </div>
              <button
                onClick={() => void handleCopy()}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition-all border",
                  copied
                    ? "border-[#1a44d4]/30 bg-[#1a44d4] text-white"
                    : "border-border/70 text-muted-foreground hover:border-[#1a44d4]/40 hover:text-[#1a44d4]",
                )}
              >
                {copied
                  ? <><CheckCheck className="h-3.5 w-3.5" strokeWidth={1.5} /> Disalin</>
                  : <><Copy className="h-3.5 w-3.5" strokeWidth={1.5} /> Salin Semua</>
                }
              </button>
            </div>

            <div className="rounded-xl bg-gray-50/70 border border-border/50 px-4 py-4">
              <pre className="text-[13px] leading-relaxed text-foreground whitespace-pre-wrap font-sans">
                {result}
              </pre>
            </div>

            <div className="flex items-center justify-between mt-3">
              <p className="text-[10.5px] text-muted-foreground">
                Siap di-paste ke Notion, WhatsApp, atau dokumen project.
              </p>
              <span className="text-[10.5px] text-muted-foreground/60 tabular-nums">
                {result.length.toLocaleString()} karakter
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
