import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  User,
  Phone,
  CalendarDays,
  FileKey,
  Upload,
  Trash2,
  Loader2,
  Camera,
  ImageIcon,
  FileText,
  CheckCircle2,
  CircleDollarSign,
  AlertCircle,
} from "lucide-react";
import {
  useJamaahStore,
  useDocsStore,
  type Jamaah,
  type JamaahDoc,
} from "@/store/tripsStore";
import type { PaymentStatus } from "@/features/trips/tripsRepo";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Konversi File ke base64 data URL. Dipake supaya semua upload (pas foto,
 * paspor, dokumen tambahan) lewat pipeline yang sama: simpan di DB sbg dataURL,
 * tripsRepo + storage helpers otomatis upload ke bucket Supabase kalau
 * Supabase ke-config.
 */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

// Limit dasar — gambar 8 MB udah lebih dari cukup utk paspor/pas foto, lagian
// `compressIfImage` di sisi storage helper bakal compress lagi sebelum upload.
const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** Detect tipe file kasar buat preview & simpan kategori `fileType` di DB. */
function detectFileType(file: File): "image" | "pdf" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  return "image";
}

// Style untuk badge status pembayaran. Dipakai juga di JamaahMiniCard
// (re-exported) supaya konsisten antara list & drawer.
export const PAYMENT_STATUS_STYLES: Record<
  PaymentStatus,
  { label: string; classes: string; dotClass: string; icon: typeof CheckCircle2 }
> = {
  Lunas: {
    label: "Lunas",
    classes: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dotClass: "bg-emerald-500",
    icon: CheckCircle2,
  },
  DP: {
    label: "DP",
    classes: "bg-amber-50 text-amber-700 border-amber-200",
    dotClass: "bg-amber-500",
    icon: CircleDollarSign,
  },
  "Belum Lunas": {
    label: "Belum Lunas",
    classes: "bg-slate-100 text-slate-600 border-slate-200",
    dotClass: "bg-slate-400",
    icon: AlertCircle,
  },
};

const PAYMENT_STATUS_OPTIONS: PaymentStatus[] = ["Belum Lunas", "DP", "Lunas"];

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  jamaah: Jamaah | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FormState {
  name: string;
  phone: string;
  birthDate: string;
  passportNumber: string;
  passportExpiry: string;
  gender: "L" | "P" | "";
  paymentStatus: PaymentStatus;
}

function blankForm(): FormState {
  return {
    name: "",
    phone: "",
    birthDate: "",
    passportNumber: "",
    passportExpiry: "",
    gender: "",
    paymentStatus: "Belum Lunas",
  };
}

function fromJamaah(j: Jamaah): FormState {
  return {
    name: j.name,
    phone: j.phone ?? "",
    birthDate: j.birthDate ?? "",
    passportNumber: j.passportNumber ?? "",
    passportExpiry: j.passportExpiry ?? "",
    gender: j.gender ?? "",
    paymentStatus: j.paymentStatus ?? "Belum Lunas",
  };
}

function isFormDirty(form: FormState, source: Jamaah | null): boolean {
  if (!source) return false;
  const src = fromJamaah(source);
  return (
    form.name !== src.name ||
    form.phone !== src.phone ||
    form.birthDate !== src.birthDate ||
    form.passportNumber !== src.passportNumber ||
    form.passportExpiry !== src.passportExpiry ||
    form.gender !== src.gender ||
    form.paymentStatus !== src.paymentStatus
  );
}

export function JamaahDetailDrawer({ jamaah, open, onOpenChange }: Props) {
  const patchJamaah = useJamaahStore((s) => s.patchJamaah);
  const docs = useDocsStore((s) => s.docs);
  const fetchDocs = useDocsStore((s) => s.fetchDocs);
  const addDocument = useDocsStore((s) => s.addDocument);
  const removeDoc = useDocsStore((s) => s.removeDoc);

  const [form, setForm] = useState<FormState>(blankForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Per-slot upload spinners. Pisah supaya 3 slot bisa upload bareng tanpa
  // ngeblok satu sama lain (mis. user upload pas foto + paspor barengan).
  const [photoUploading, setPhotoUploading] = useState(false);
  const [passportUploading, setPassportUploading] = useState(false);
  const [otherUploading, setOtherUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Sync form ke jamaah yang dipilih tiap kali drawer kebuka utk jamaah baru.
  useEffect(() => {
    if (jamaah) setForm(fromJamaah(jamaah));
    else setForm(blankForm());
    setSaveError(null);
    setUploadError(null);
  }, [jamaah?.id]);

  // Fetch dokumen waktu drawer kebuka (refresh tiap kali ganti jamaah).
  useEffect(() => {
    if (open && jamaah) void fetchDocs(jamaah.id);
  }, [open, jamaah?.id, fetchDocs]);

  // Filter dokumen utk jamaah aktif aja (store nyimpen semua jamaah).
  const myDocs = useMemo<JamaahDoc[]>(
    () => (jamaah ? docs.filter((d) => d.jamaahId === jamaah.id) : []),
    [docs, jamaah?.id],
  );
  const passportDoc = useMemo(
    () => myDocs.find((d) => d.category === "passport") ?? null,
    [myDocs],
  );
  const otherDocs = useMemo(
    () => myDocs.filter((d) => d.category === "other"),
    [myDocs],
  );

  const dirty = isFormDirty(form, jamaah);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const photoInputRef = useRef<HTMLInputElement>(null);
  const passportInputRef = useRef<HTMLInputElement>(null);
  const otherInputRef = useRef<HTMLInputElement>(null);

  async function onPhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !jamaah) return;
    if (file.size > MAX_FILE_BYTES) {
      setUploadError("Ukuran file terlalu besar (max 8 MB).");
      return;
    }
    setUploadError(null);
    setPhotoUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      // patchJamaah → updateJamaah otomatis upload ke bucket kalau dataURL.
      await patchJamaah(jamaah.id, { photoDataUrl: dataUrl });
    } catch (err) {
      console.error("[drawer] upload pas foto gagal:", err);
      setUploadError("Upload pas foto gagal. Coba lagi atau cek koneksi.");
    } finally {
      setPhotoUploading(false);
    }
  }

  async function onPassportPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !jamaah) return;
    if (file.size > MAX_FILE_BYTES) {
      setUploadError("Ukuran file terlalu besar (max 8 MB).");
      return;
    }
    setUploadError(null);
    setPassportUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      // Kategori "passport" by design hanya 1 slot — replace yang lama
      // sebelum tambahin yang baru biar UI gak duplikat & storage gak bloat.
      if (passportDoc) {
        try {
          await removeDoc(passportDoc.id);
        } catch (err) {
          // Gak fatal — just log; tambahin yang baru tetep jalan.
          console.warn("[drawer] hapus paspor lama gagal:", err);
        }
      }
      await addDocument({
        jamaahId: jamaah.id,
        category: "passport",
        label: "Foto Paspor",
        fileName: file.name,
        fileType: detectFileType(file),
        dataUrl,
      });
    } catch (err) {
      console.error("[drawer] upload foto paspor gagal:", err);
      setUploadError("Upload foto paspor gagal. Coba lagi atau cek koneksi.");
    } finally {
      setPassportUploading(false);
    }
  }

  async function onOtherPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0 || !jamaah) return;
    setUploadError(null);
    setOtherUploading(true);
    try {
      // Upload sekuensial — gampang track error per file, dan storage helper
      // udah handle compression. Banyak file di-handle satu-satu OK.
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) {
          setUploadError(`"${file.name}" lebih dari 8 MB — di-skip.`);
          continue;
        }
        const dataUrl = await fileToDataUrl(file);
        await addDocument({
          jamaahId: jamaah.id,
          category: "other",
          label: file.name.replace(/\.[^.]+$/, ""),
          fileName: file.name,
          fileType: detectFileType(file),
          dataUrl,
        });
      }
    } catch (err) {
      console.error("[drawer] upload dokumen tambahan gagal:", err);
      setUploadError("Upload dokumen tambahan gagal. Coba lagi.");
    } finally {
      setOtherUploading(false);
    }
  }

  async function onDeleteDoc(doc: JamaahDoc) {
    if (!confirm(`Hapus dokumen "${doc.label}"? Tindakan ini gak bisa dibatalin.`))
      return;
    try {
      await removeDoc(doc.id);
    } catch (err) {
      console.error("[drawer] hapus dokumen gagal:", err);
      alert(err instanceof Error ? err.message : "Hapus dokumen gagal.");
    }
  }

  async function onRemovePhoto() {
    if (!jamaah || !jamaah.photoDataUrl) return;
    if (!confirm("Hapus pas foto? Tindakan ini gak bisa dibatalin.")) return;
    setPhotoUploading(true);
    try {
      // Set ke undefined → mapper jadi null → kolom photo_data_url di-clear.
      await patchJamaah(jamaah.id, { photoDataUrl: undefined });
    } catch (err) {
      console.error("[drawer] hapus pas foto gagal:", err);
      setUploadError("Hapus pas foto gagal.");
    } finally {
      setPhotoUploading(false);
    }
  }

  async function onSave() {
    if (!jamaah) return;
    if (!form.name.trim()) {
      setSaveError("Nama wajib diisi.");
      return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      await patchJamaah(jamaah.id, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        birthDate: form.birthDate,
        passportNumber: form.passportNumber.trim(),
        passportExpiry: form.passportExpiry || undefined,
        gender: form.gender,
        paymentStatus: form.paymentStatus,
      });
    } catch (err) {
      console.error("[drawer] simpan jamaah gagal:", err);
      setSaveError(err instanceof Error ? err.message : "Simpan data gagal.");
    } finally {
      setSaving(false);
    }
  }

  if (!jamaah) return null;

  const initials = jamaah.name.charAt(0).toUpperCase() || "?";
  const avatarBg =
    jamaah.gender === "P"
      ? "bg-gradient-to-br from-pink-400 to-rose-500"
      : "bg-gradient-to-br from-blue-400 to-indigo-500";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg p-0 flex flex-col gap-0 overflow-hidden"
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <SheetHeader className="px-5 py-4 border-b border-[hsl(var(--border))] bg-white space-y-2 text-left">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "h-12 w-12 rounded-2xl overflow-hidden flex items-center justify-center text-white font-bold text-base shrink-0",
                avatarBg,
              )}
            >
              {jamaah.photoDataUrl ? (
                <img
                  src={jamaah.photoDataUrl}
                  alt={jamaah.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-[15px] font-bold truncate leading-tight">
                {jamaah.name || "Jamaah"}
              </SheetTitle>
              <SheetDescription className="text-[11px] text-muted-foreground mt-0.5">
                {jamaah.bookingCode ? (
                  <span className="font-mono">{jamaah.bookingCode}</span>
                ) : (
                  "Detail & dokumen jamaah"
                )}
              </SheetDescription>
            </div>
            <PaymentStatusPill status={form.paymentStatus} />
          </div>
        </SheetHeader>

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 bg-[hsl(var(--secondary))/0.3]">
          {/* Data Pribadi ----------------------------------------------------- */}
          <section className="space-y-3">
            <SectionTitle icon={User}>Data Pribadi</SectionTitle>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Nama Lengkap" full>
                <input
                  className={inputCls}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Nama sesuai paspor"
                />
              </Field>
              <Field label="No. HP" icon={Phone}>
                <input
                  className={inputCls}
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="08xxxxxxxxxx"
                  inputMode="tel"
                />
              </Field>
              <Field label="Jenis Kelamin">
                <select
                  className={inputCls}
                  value={form.gender}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, gender: e.target.value as FormState["gender"] }))
                  }
                >
                  <option value="">—</option>
                  <option value="L">Laki-laki</option>
                  <option value="P">Perempuan</option>
                </select>
              </Field>
              <Field label="Tanggal Lahir" icon={CalendarDays}>
                <input
                  type="date"
                  className={inputCls}
                  value={form.birthDate}
                  onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
                />
              </Field>
              <Field label="Status Pembayaran">
                <select
                  className={inputCls}
                  value={form.paymentStatus}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      paymentStatus: e.target.value as PaymentStatus,
                    }))
                  }
                >
                  {PAYMENT_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="No. Paspor" icon={FileKey} full>
                <input
                  className={cn(inputCls, "font-mono uppercase")}
                  value={form.passportNumber}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, passportNumber: e.target.value.toUpperCase() }))
                  }
                  placeholder="A1234567"
                />
              </Field>
              <Field label="Berlaku s/d" icon={CalendarDays} full>
                <input
                  type="date"
                  className={inputCls}
                  value={form.passportExpiry}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, passportExpiry: e.target.value }))
                  }
                />
              </Field>
            </div>
            {saveError && (
              <p className="text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5">
                {saveError}
              </p>
            )}
          </section>

          {/* Pas Foto --------------------------------------------------------- */}
          <section className="space-y-2">
            <SectionTitle icon={Camera}>Pas Foto</SectionTitle>
            <div className="rounded-xl border border-[hsl(var(--border))] bg-white p-3 flex items-start gap-3">
              <div
                className={cn(
                  "h-20 w-16 rounded-lg overflow-hidden flex items-center justify-center text-white text-xs font-semibold shrink-0 border border-[hsl(var(--border))]",
                  avatarBg,
                )}
              >
                {jamaah.photoDataUrl ? (
                  <img
                    src={jamaah.photoDataUrl}
                    alt="Pas foto"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImageIcon className="h-5 w-5 opacity-70" />
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <p className="text-[11px] text-muted-foreground leading-tight">
                  Foto wajah jamaah utk identifikasi cepat & ID badge.
                  {" "}<span className="text-[10px] opacity-70">(JPG/PNG, max 8 MB)</span>
                </p>
                <div className="flex gap-2">
                  <UploadButton
                    onClick={() => photoInputRef.current?.click()}
                    loading={photoUploading}
                    label={jamaah.photoDataUrl ? "Ganti" : "Upload"}
                  />
                  {jamaah.photoDataUrl && !photoUploading && (
                    <button
                      type="button"
                      onClick={onRemovePhoto}
                      className="h-8 px-3 rounded-lg text-[11px] font-semibold text-red-600 hover:bg-red-50 border border-red-100 transition-colors inline-flex items-center gap-1"
                    >
                      <Trash2 className="h-3 w-3" />
                      Hapus
                    </button>
                  )}
                </div>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onPhotoPick}
                />
              </div>
            </div>
          </section>

          {/* Foto Paspor ------------------------------------------------------ */}
          <section className="space-y-2">
            <SectionTitle icon={FileKey}>Foto Paspor</SectionTitle>
            <div className="rounded-xl border border-[hsl(var(--border))] bg-white p-3">
              {passportDoc ? (
                <div className="flex items-start gap-3">
                  <DocPreview doc={passportDoc} className="h-20 w-28" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <p className="text-[11.5px] font-semibold truncate">
                      {passportDoc.fileName}
                    </p>
                    <p className="text-[10px] text-muted-foreground uppercase">
                      {passportDoc.fileType}
                    </p>
                    <div className="flex gap-2">
                      <UploadButton
                        onClick={() => passportInputRef.current?.click()}
                        loading={passportUploading}
                        label="Ganti"
                      />
                      <button
                        type="button"
                        onClick={() => onDeleteDoc(passportDoc)}
                        disabled={passportUploading}
                        className="h-8 px-3 rounded-lg text-[11px] font-semibold text-red-600 hover:bg-red-50 border border-red-100 transition-colors inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        Hapus
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <p className="text-[12px] font-semibold">Belum ada</p>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      Upload scan/foto halaman data paspor utk verifikasi.
                    </p>
                  </div>
                  <UploadButton
                    onClick={() => passportInputRef.current?.click()}
                    loading={passportUploading}
                    label="Upload"
                  />
                </div>
              )}
              <input
                ref={passportInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={onPassportPick}
              />
            </div>
          </section>

          {/* Dokumen Tambahan ------------------------------------------------- */}
          <section className="space-y-2">
            <SectionTitle icon={FileText}>
              Dokumen Tambahan
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                ({otherDocs.length})
              </span>
            </SectionTitle>
            <div className="rounded-xl border border-[hsl(var(--border))] bg-white p-3 space-y-2">
              {otherDocs.length === 0 ? (
                <p className="text-[11.5px] text-muted-foreground italic">
                  Belum ada dokumen tambahan. Tambah visa, tiket, surat sehat, dll.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {otherDocs.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center gap-2.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))/0.3] p-2"
                    >
                      <DocPreview doc={d} className="h-10 w-10 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11.5px] font-semibold truncate">
                          {d.label || d.fileName}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {d.fileName}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteDoc(d)}
                        className="h-7 w-7 rounded-lg hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-muted-foreground transition-colors shrink-0"
                        title="Hapus dokumen"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <UploadButton
                onClick={() => otherInputRef.current?.click()}
                loading={otherUploading}
                label="Tambah Dokumen"
                fullWidth
              />
              <input
                ref={otherInputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={onOtherPick}
              />
            </div>
          </section>

          {uploadError && (
            <p className="text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5">
              {uploadError}
            </p>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="border-t border-[hsl(var(--border))] bg-white px-5 py-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex-1 h-9 rounded-xl text-[12.5px] font-semibold bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--border))] text-[hsl(var(--foreground))] transition-colors"
          >
            Tutup
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || saving}
            className="flex-1 h-9 rounded-xl text-[12.5px] font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
            style={{ background: "linear-gradient(135deg,#f97316,#ea580c)" }}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving ? "Menyimpan…" : dirty ? "Simpan Perubahan" : "Tersimpan"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

const inputCls =
  "w-full h-8 rounded-lg border border-[hsl(var(--border))] bg-white px-2.5 text-[12px] outline-none focus:border-[hsl(var(--primary))] focus:ring-1 focus:ring-[hsl(var(--primary))/0.2] transition-colors";

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: typeof User;
  children: React.ReactNode;
}) {
  return (
    <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5">
      <Icon className="h-3 w-3" />
      {children}
    </h3>
  );
}

function Field({
  label,
  icon: Icon,
  full,
  children,
}: {
  label: string;
  icon?: typeof User;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("space-y-1", full && "col-span-2")}>
      <span className="text-[10.5px] font-semibold text-muted-foreground inline-flex items-center gap-1">
        {Icon && <Icon className="h-2.5 w-2.5" />}
        {label}
      </span>
      {children}
    </label>
  );
}

function UploadButton({
  onClick,
  loading,
  label,
  fullWidth,
}: {
  onClick: () => void;
  loading: boolean;
  label: string;
  fullWidth?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={cn(
        "h-8 px-3 rounded-lg text-[11px] font-bold text-white transition-all inline-flex items-center justify-center gap-1.5 disabled:opacity-60",
        fullWidth && "w-full",
      )}
      style={{ background: "linear-gradient(135deg,#f97316,#ea580c)" }}
    >
      {loading ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          Mengupload…
        </>
      ) : (
        <>
          <Upload className="h-3 w-3" />
          {label}
        </>
      )}
    </button>
  );
}

function DocPreview({ doc, className }: { doc: JamaahDoc; className?: string }) {
  const isPdf = doc.fileType === "pdf";
  return (
    <a
      href={doc.dataUrl}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "rounded-lg overflow-hidden border border-[hsl(var(--border))] bg-[hsl(var(--secondary))/0.5] flex items-center justify-center shrink-0 hover:opacity-90 transition-opacity",
        className,
      )}
      title="Klik utk buka file penuh"
    >
      {isPdf ? (
        <div className="flex flex-col items-center gap-0.5 text-muted-foreground">
          <FileText className="h-5 w-5" />
          <span className="text-[8px] font-bold uppercase">PDF</span>
        </div>
      ) : (
        <img src={doc.dataUrl} alt={doc.label} className="h-full w-full object-cover" />
      )}
    </a>
  );
}

/** Pill kecil utk status pembayaran. Re-used di JamaahMiniCard juga. */
export function PaymentStatusPill({
  status,
  size = "sm",
}: {
  status: PaymentStatus;
  size?: "xs" | "sm";
}) {
  const cfg = PAYMENT_STATUS_STYLES[status];
  const Icon = cfg.icon;
  if (size === "xs") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9.5px] font-semibold leading-none",
          cfg.classes,
        )}
        title={`Pembayaran: ${cfg.label}`}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dotClass)} />
        {cfg.label}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold leading-none",
        cfg.classes,
      )}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}
