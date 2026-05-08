/**
 * StaffProfileOwnerView — /staff/:staffId
 *
 * Halaman profil staff yang bisa diakses owner.
 * Menampilkan kartu digital Staff Card + info dasar member.
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Calendar, Mail, Shield, Loader2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore, type MemberInfo } from "@/store/authStore";
import { StaffCard } from "@/components/StaffCard";
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
        <div className="h-14 w-14 rounded-2xl bg-blue-100 border-2 border-blue-200 flex items-center justify-center text-2xl font-extrabold text-blue-700 shrink-0">
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

      {/* Staff Card Digital */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className="rounded-2xl border border-slate-100 bg-white overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-slate-100">
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
        <div className="p-5 flex justify-center">
          <StaffCard
            displayName={staff.displayName || staff.email}
            staffId={staff.userId}
            since={staff.createdAt}
          />
        </div>
      </motion.div>
    </div>
  );
}
