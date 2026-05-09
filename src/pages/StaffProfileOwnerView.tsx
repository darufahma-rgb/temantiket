/**
 * StaffProfileOwnerView — /staff/:staffId
 *
 * Halaman profil staff yang bisa diakses owner.
 * Menampilkan kartu digital Staff Card + info dasar member.
 * Owner bisa upload gambar belakang kartu untuk staff.
 */

import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Calendar, Mail, Shield, Loader2, UserCheck, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore, type MemberInfo } from "@/store/authStore";
import { StaffCard } from "@/components/StaffCard";
import { uploadCardBack, saveCardBackUrl, loadCardBackUrl } from "@/lib/cardBackStorage";
import { toast } from "sonner";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

function fmtDate(iso: string) {
  try {
    return format(new Date(iso), "d MMMM yyyy", { locale: idLocale });
  } catch {
    return iso;
  }
}

export default function StaffProfileOwnerView() {
  const { staffId } = useParams<{ staffId: string }>();
  const navigate = useNavigate();
  const listMembers = useAuthStore((s) => s.listMembers);
  const currentUser = useAuthStore((s) => s.user);

  const [staff, setStaff] = useState<MemberInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [cardBackUrl, setCardBackUrl] = useState<string | null>(null);
  const [cardBackUploading, setCardBackUploading] = useState(false);
  const cardBackInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!staffId) return;
    setLoading(true);
    void listMembers().then((members) => {
      const found = members.find((m) => m.userId === staffId && m.role === "staff");
      if (found) {
        setStaff(found);
      } else {
        setNotFound(true);
      }
      setLoading(false);
    });
  }, [staffId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load card back image once we know the staff member + agency
  useEffect(() => {
    if (!staffId || !currentUser?.agencyId) return;
    void loadCardBackUrl(staffId, currentUser.agencyId).then((url) => {
      if (url) setCardBackUrl(url);
    });
  }, [staffId, currentUser?.agencyId]);

  const handleCardBackFile = async (file: File) => {
    if (!staffId || !currentUser?.agencyId || !file.type.startsWith("image/")) return;
    setCardBackUploading(true);
    try {
      const url = await uploadCardBack(staffId, file);
      await saveCardBackUrl(staffId, currentUser.agencyId, url);
      setCardBackUrl(url);
      toast.success(`Gambar belakang kartu ${staff?.displayName ?? "staff"} diperbarui!`);
    } catch (e: unknown) {
      toast.error(`Gagal upload: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCardBackUploading(false);
    }
  };

  const isOwner = currentUser?.role === "owner";

  if (!isOwner) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Akses terbatas — hanya owner yang bisa melihat halaman ini.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Memuat profil staff…</span>
      </div>
    );
  }

  if (notFound || !staff) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-muted-foreground">Staff tidak ditemukan atau bukan role staff.</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/settings?tab=agents")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Kembali
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Kembali
      </button>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-2xl border bg-white p-5 flex items-center gap-4"
      >
        <div className="h-14 w-14 rounded-2xl bg-blue-100 border-2 border-blue-200 flex items-center justify-center text-xl font-extrabold text-blue-700 shrink-0">
          {(staff.displayName || "S").charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-extrabold leading-tight">
              {staff.displayName || staff.email}
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 uppercase tracking-wide">
              Staff
            </span>
          </div>
          <p className="text-[12px] text-muted-foreground mt-0.5">{staff.email}</p>
        </div>
      </motion.div>

      {/* Info tiles */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-3"
      >
        <div className="rounded-2xl border bg-white p-4 flex items-start gap-3">
          <div className="h-8 w-8 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
            <Mail className="h-4 w-4 text-sky-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Email</p>
            <p className="text-[12px] font-semibold truncate mt-0.5">{staff.email}</p>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 flex items-start gap-3">
          <div className="h-8 w-8 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
            <Shield className="h-4 w-4 text-indigo-600" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Role</p>
            <p className="text-[12px] font-semibold mt-0.5 capitalize">{staff.role}</p>
          </div>
        </div>

        {staff.createdAt && (
          <div className="rounded-2xl border bg-white p-4 flex items-start gap-3">
            <div className="h-8 w-8 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
              <Calendar className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Bergabung</p>
              <p className="text-[12px] font-semibold mt-0.5">{fmtDate(staff.createdAt)}</p>
            </div>
          </div>
        )}
      </motion.div>

      {/* Staff Card Digital + upload belakang */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className="rounded-2xl border border-slate-100 bg-white overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-blue-600" />
            <div>
              <p className="text-sm font-semibold">Kartu Staff Digital</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                ID card resmi {staff.displayName} sebagai Staff Temantiket
              </p>
            </div>
          </div>
        </div>
        <div className="p-5 flex flex-col items-center gap-4">
          <StaffCard
            displayName={staff.displayName || staff.email}
            staffId={staff.userId}
            since={staff.createdAt}
            backImageUrl={cardBackUrl}
          />

          {/* Upload gambar belakang (owner only) */}
          <div className="w-full max-w-[320px]">
            <input
              ref={cardBackInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleCardBackFile(f);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => cardBackInputRef.current?.click()}
              disabled={cardBackUploading}
              className="w-full flex items-center justify-center gap-2 h-9 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-600 text-[12px] font-semibold transition-all disabled:opacity-60 active:scale-[0.98]"
            >
              {cardBackUploading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Mengupload…
                </>
              ) : (
                <>
                  <Camera className="h-3.5 w-3.5" />
                  {cardBackUrl ? "Ganti Gambar Belakang Kartu" : "Upload Gambar Belakang Kartu"}
                </>
              )}
            </button>
            {cardBackUrl && (
              <p className="text-center text-[10px] text-slate-400 mt-1.5">
                Klik "Lihat Belakang" pada kartu untuk pratinjau
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
