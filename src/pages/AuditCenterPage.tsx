/**
 * AuditCenterPage — C. Debug & Audit Center (Production-Grade)
 *
 * Unified audit center with:
 *  - Compact / Technical display mode
 *  - Severity: success / info / warning / error
 *  - Widgets: missing fees, duplicate tx, orphan assignments, mismatch nominal,
 *             realtime status, sync health, stale orders
 *  - Export: CSV, JSON, copy debug report
 *  - Intelligent error translator (powered by translateWalletError)
 *  - Realtime indicator (powered by RealtimeIndicator)
 */

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck, AlertTriangle, XCircle, CheckCircle2, Info,
  RefreshCw, Download, Copy, Check, Wifi, WifiOff, Loader2,
  Eye, Code2, Clock, Wallet, Activity, Database,
  ChevronDown, ChevronUp, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useOrdersStore } from "@/store/ordersStore";
import { useAuthStore } from "@/store/authStore";
import { listRecentAuditLogs, type AuditLog } from "@/features/audit/auditRepo";
import { pullWalletTxs, reconcileWalletTxs, type ReconciliationIssue, translateWalletError } from "@/lib/agentWallet";
import { RealtimeIndicator } from "@/components/RealtimeIndicator";
import { getRealtimeStatus } from "@/lib/realtimeManager";
import { useFeatureSyncStore } from "@/store/featureSyncStore";
import { checkHealth, type HealthCheckResult } from "@/lib/healthCheck";
import { repairMetadata, getStepsForType } from "@/lib/orderProgress";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type DisplayMode = "compact" | "technical";

type AuditSeverity = "success" | "info" | "warning" | "error";

interface AuditItem {
  id:          string;
  severity:    AuditSeverity;
  category:    string;
  title:       string;
  description: string;
  meta?:       Record<string, unknown>;
  ts?:         string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function fmtDt(iso: string) {
  try { return new Date(iso).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" }); }
  catch { return iso; }
}

function severityOrder(s: AuditSeverity): number {
  return { error: 0, warning: 1, info: 2, success: 3 }[s] ?? 4;
}

const SEV_CFG: Record<AuditSeverity, { Icon: React.ElementType; cls: string; badgeCls: string; label: string }> = {
  error:   { Icon: XCircle,      cls: "border-red-200 bg-red-50",       badgeCls: "bg-red-100 text-red-700 border-red-200",     label: "Error" },
  warning: { Icon: AlertTriangle, cls: "border-amber-200 bg-amber-50",   badgeCls: "bg-amber-100 text-amber-700 border-amber-200", label: "Perhatian" },
  info:    { Icon: Info,          cls: "border-blue-100 bg-blue-50",      badgeCls: "bg-blue-100 text-blue-700 border-blue-100",   label: "Info" },
  success: { Icon: CheckCircle2,  cls: "border-emerald-100 bg-emerald-50",badgeCls: "bg-emerald-100 text-emerald-700 border-emerald-200", label: "OK" },
};

// ── Sub-component: Audit Item Card ────────────────────────────────────────────

function AuditItemCard({ item, mode }: { item: AuditItem; mode: DisplayMode }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = SEV_CFG[item.severity];
  const Icon = cfg.Icon;
  const hasMeta = item.meta && Object.keys(item.meta).length > 0;

  return (
    <div className={cn("rounded-xl border px-3 py-2.5 space-y-1", cfg.cls)}>
      <div className="flex items-start gap-2">
        <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-current opacity-70" strokeWidth={2} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[12px] font-semibold text-gray-800 leading-tight">{item.title}</span>
              {mode === "technical" && item.ts && (
                <span className="ml-2 text-[10px] text-gray-400 font-mono">{fmtDt(item.ts)}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge variant="outline" className={cn("text-[10px] px-2 h-5", cfg.badgeCls)}>{cfg.label}</Badge>
              <Badge variant="outline" className="text-[10px] px-2 h-5 text-gray-400">{item.category}</Badge>
            </div>
          </div>
          <p className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">{item.description}</p>
          {mode === "technical" && hasMeta && (
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              className="text-[11px] text-blue-500 mt-1 flex items-center gap-0.5"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? "Sembunyikan" : "Detail teknis"}
            </button>
          )}
          {expanded && item.meta && (
            <pre className="mt-1.5 text-[10px] font-mono bg-white/60 border border-white/80 rounded p-2 overflow-x-auto text-gray-600 leading-relaxed">
              {JSON.stringify(item.meta, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-component: Stat Card ───────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-3 py-2.5 text-center">
      <div className="text-xl font-black leading-none" style={{ color }}>{value}</div>
      <div className="text-[11px] font-semibold text-gray-700 mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AuditCenterPage() {
  const user      = useAuthStore((s) => s.user);
  const orders    = useOrdersStore((s) => s.orders);

  const [mode,       setMode]       = useState<DisplayMode>("compact");
  const [loading,    setLoading]    = useState(false);
  const [items,      setItems]      = useState<AuditItem[]>([]);
  const [auditLogs,  setAuditLogs]  = useState<AuditLog[]>([]);
  const [health,     setHealth]     = useState<HealthCheckResult | null>(null);
  const [search,     setSearch]     = useState("");
  const [sevFilter,  setSevFilter]  = useState<AuditSeverity | "all">("all");
  const [copied,     setCopied]     = useState(false);

  const syncStatuses = useFeatureSyncStore((s) => s.statuses);
  const syncErrors   = useFeatureSyncStore((s) => s.errors);

  const runAudit = async () => {
    setLoading(true);
    const found: AuditItem[] = [];
    let seq = 0;
    const id = () => `audit-${++seq}`;

    try {
      // ── 1. Health check ────────────────────────────────────────────────────
      const h = await checkHealth(8000);
      setHealth(h);

      if (!h.ok) {
        found.push({ id: id(), severity: "error", category: "Infrastruktur", title: "Supabase tidak sehat", description: h.errors.join(" · "), ts: new Date().toISOString() });
      } else {
        found.push({ id: id(), severity: "success", category: "Infrastruktur", title: "Supabase OK", description: "Database & storage terkoneksi dengan baik.", ts: new Date().toISOString() });
      }

      // ── 2. Realtime status ─────────────────────────────────────────────────
      const rtStatus = getRealtimeStatus();
      found.push({
        id: id(), severity: rtStatus === "live" ? "success" : rtStatus === "reconnecting" ? "warning" : "error",
        category: "Realtime", title: `Realtime: ${rtStatus === "live" ? "Terhubung" : rtStatus === "reconnecting" ? "Menyambung ulang" : "Terputus"}`,
        description: rtStatus === "live"
          ? "Koneksi realtime aktif — data diperbarui otomatis."
          : rtStatus === "reconnecting"
          ? "Sedang menyambung ulang… Coba tunggu beberapa detik."
          : "Realtime terputus — sistem menggunakan polling setiap 30 detik sebagai fallback.",
        ts: new Date().toISOString(),
      });

      // ── 3. Sync status per feature ─────────────────────────────────────────
      const errorFeatures = Object.entries(syncStatuses).filter(([, s]) => s === "error");
      if (errorFeatures.length > 0) {
        for (const [key] of errorFeatures) {
          const errMsg = syncErrors[key] ?? "Unknown error";
          found.push({
            id: id(), severity: "warning", category: "Sync",
            title: `Sync gagal: ${key}`,
            description: translateWalletError(errMsg),
            meta: { feature: key, rawError: errMsg },
            ts: new Date().toISOString(),
          });
        }
      } else {
        found.push({ id: id(), severity: "success", category: "Sync", title: "Semua sync berjalan baik", description: "Tidak ada fitur yang gagal sync ke cloud.", ts: new Date().toISOString() });
      }

      // ── 4. Order progress metadata check ──────────────────────────────────
      let repairedCount = 0;
      const staleOrders: string[] = [];
      const now = Date.now();

      for (const order of orders) {
        const meta = (order.metadata ?? {}) as Record<string, unknown>;
        const repaired = repairMetadata(order.type, meta);
        if (repaired._stepRepaired) repairedCount++;

        // Stale: order last updated > 30 days ago with non-final step
        const steps = getStepsForType(order.type);
        const stepIdx = Number(meta.processStep ?? 0);
        const isFinished = stepIdx >= steps.length - 1;
        if (!isFinished && order.updatedAt) {
          const ageMs = now - new Date(order.updatedAt).getTime();
          if (ageMs > 30 * 24 * 60 * 60 * 1000) {
            staleOrders.push(order.id);
          }
        }
      }

      if (repairedCount > 0) {
        found.push({
          id: id(), severity: "warning", category: "Order Progress",
          title: `${repairedCount} order dengan step metadata rusak`,
          description: `Ditemukan ${repairedCount} order dengan nilai processStep tidak valid — akan di-repair otomatis ke step 0 saat ditampilkan.`,
          meta: { repairedCount },
        });
      } else {
        found.push({ id: id(), severity: "success", category: "Order Progress", title: "Semua order progress valid", description: `${orders.length} order diperiksa — tidak ada metadata rusak.` });
      }

      if (staleOrders.length > 0) {
        found.push({
          id: id(), severity: "warning", category: "Order Progress",
          title: `${staleOrders.length} order tidak bergerak > 30 hari`,
          description: "Order-order ini belum mencapai tahap selesai tapi sudah lama tidak diperbarui. Cek status mereka.",
          meta: { staleOrderIds: staleOrders.slice(0, 10) },
        });
      }

      // ── 5. Audit logs ──────────────────────────────────────────────────────
      try {
        const logs = await listRecentAuditLogs(50);
        setAuditLogs(logs);
        found.push({ id: id(), severity: "info", category: "Audit Log", title: `${logs.length} log terakhir dimuat`, description: "Audit trail tersedia — lihat tab Audit Log untuk detail perubahan.", ts: new Date().toISOString() });
      } catch (e) {
        found.push({ id: id(), severity: "warning", category: "Audit Log", title: "Gagal memuat audit log", description: translateWalletError((e as Error).message ?? String(e)), ts: new Date().toISOString() });
      }

      // ── 6. Wallet reconciliation (current user only) ──────────────────────
      if (user?.id && (user.role === "agent" || user.role === "staff")) {
        try {
          const txs = await pullWalletTxs(user.id);
          const reconcileIssues: ReconciliationIssue[] = reconcileWalletTxs(user.id, txs, []);
          const errors   = reconcileIssues.filter(i => i.severity === "error");
          const warnings = reconcileIssues.filter(i => i.severity === "warning");

          if (errors.length > 0) {
            for (const issue of errors.slice(0, 5)) {
              found.push({
                id: id(), severity: "error", category: "Wallet",
                title: issue.type.replace(/_/g, " "),
                description: issue.description,
                meta: { expected: issue.expected, actual: issue.actual, txId: issue.txId },
              });
            }
          }
          if (warnings.length > 0) {
            for (const issue of warnings.slice(0, 5)) {
              found.push({
                id: id(), severity: "warning", category: "Wallet",
                title: issue.type.replace(/_/g, " "),
                description: issue.description,
                meta: { expected: issue.expected, actual: issue.actual },
              });
            }
          }
          if (errors.length === 0 && warnings.length === 0) {
            found.push({ id: id(), severity: "success", category: "Wallet", title: "Wallet bersih", description: `${txs.length} transaksi diperiksa — tidak ada masalah ditemukan.` });
          }
        } catch (e) {
          found.push({ id: id(), severity: "info", category: "Wallet", title: "Wallet check dilewati", description: translateWalletError((e as Error).message ?? String(e)) });
        }
      } else if (user?.role === "owner") {
        found.push({ id: id(), severity: "info", category: "Wallet", title: "Wallet reconciliation", description: "Untuk reconcile wallet per-agen, buka profil agen yang bersangkutan." });
      }

    } catch (e) {
      found.push({ id: id(), severity: "error", category: "System", title: "Audit gagal dijalankan", description: String(e) });
    } finally {
      setItems(found.sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity)));
      setLoading(false);
    }
  };

  useEffect(() => { void runAudit(); }, []);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const counts = useMemo(() => ({
    error:   items.filter(i => i.severity === "error").length,
    warning: items.filter(i => i.severity === "warning").length,
    info:    items.filter(i => i.severity === "info").length,
    success: items.filter(i => i.severity === "success").length,
  }), [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (sevFilter !== "all") list = list.filter(i => i.severity === sevFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.title.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, sevFilter, search]);

  // ── Export helpers ─────────────────────────────────────────────────────────
  const buildDebugReport = () => {
    const lines = [
      `=== TEMANTIKET AUDIT REPORT ===`,
      `Dijalankan: ${new Date().toLocaleString("id-ID")}`,
      `User: ${user?.name ?? user?.id ?? "—"} (${user?.role ?? "—"})`,
      `Total order: ${orders.length}`,
      ``,
      `--- RINGKASAN ---`,
      `Error:   ${counts.error}`,
      `Warning: ${counts.warning}`,
      `Info:    ${counts.info}`,
      `OK:      ${counts.success}`,
      ``,
      `--- DETAIL ---`,
      ...items.map(i => `[${i.severity.toUpperCase()}][${i.category}] ${i.title}: ${i.description}`),
      ``,
      `--- HEALTH CHECK ---`,
      health ? JSON.stringify(health, null, 2) : "Tidak tersedia",
    ];
    return lines.join("\n");
  };

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(buildDebugReport());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* silent */ }
  };

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify({ items, health, auditLogs, generatedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `audit-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const header = "Severity,Category,Title,Description,Timestamp";
    const rows   = items.map(i =>
      [i.severity, i.category, `"${i.title}"`, `"${i.description}"`, i.ts ?? ""].join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `audit-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    const date = new Date().toLocaleString("id-ID");
    const sevBg: Record<AuditSeverity, string> = {
      error:   "#fee2e2",
      warning: "#fef3c7",
      info:    "#dbeafe",
      success: "#d1fae5",
    };
    const sevColor: Record<AuditSeverity, string> = {
      error:   "#b91c1c",
      warning: "#b45309",
      info:    "#1d4ed8",
      success: "#065f46",
    };
    const rows = items.map(i => `
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:6px 8px;">
          <span style="display:inline-block;padding:2px 7px;border-radius:9999px;font-size:10px;font-weight:700;background:${sevBg[i.severity]};color:${sevColor[i.severity]}">
            ${i.severity.toUpperCase()}
          </span>
        </td>
        <td style="padding:6px 8px;font-size:11px;color:#64748b;">${i.category}</td>
        <td style="padding:6px 8px;font-size:11px;font-weight:600;color:#1e293b;">${i.title}</td>
        <td style="padding:6px 8px;font-size:10.5px;color:#475569;">${i.description}</td>
        <td style="padding:6px 8px;font-size:10px;color:#94a3b8;white-space:nowrap;">${i.ts ? new Date(i.ts).toLocaleString("id-ID") : "—"}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8"/>
<title>Audit Report — Temantiket</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; padding: 32px; color: #1e293b; }
  h1   { font-size: 18px; font-weight: 800; margin: 0 0 4px; }
  p.sub { font-size: 11px; color: #64748b; margin: 0 0 20px; }
  .stats { display: flex; gap: 12px; margin-bottom: 20px; }
  .stat  { padding: 10px 16px; border-radius: 10px; border: 1px solid #e2e8f0; text-align: center; }
  .stat .val { font-size: 20px; font-weight: 900; }
  .stat .lbl { font-size: 10px; color: #64748b; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { text-align: left; padding: 8px; background: #f8fafc; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #64748b; border-bottom: 2px solid #e2e8f0; }
  @media print { body { padding: 16px; } }
</style>
</head>
<body>
<h1>🛡 Audit Report — Temantiket</h1>
<p class="sub">Dijalankan: ${date} &nbsp;·&nbsp; User: ${user?.name ?? user?.id ?? "—"} (${user?.role ?? "—"}) &nbsp;·&nbsp; Total order: ${orders.length}</p>
<div class="stats">
  <div class="stat"><div class="val" style="color:#ef4444">${counts.error}</div><div class="lbl">Error</div></div>
  <div class="stat"><div class="val" style="color:#f59e0b">${counts.warning}</div><div class="lbl">Perhatian</div></div>
  <div class="stat"><div class="val" style="color:#3b82f6">${counts.info}</div><div class="lbl">Info</div></div>
  <div class="stat"><div class="val" style="color:#10b981">${counts.success}</div><div class="lbl">OK</div></div>
</div>
<table>
  <thead><tr><th>Sev</th><th>Kategori</th><th>Judul</th><th>Deskripsi</th><th>Waktu</th></tr></thead>
  <tbody>${rows || "<tr><td colspan='5' style='padding:16px;text-align:center;color:#94a3b8'>Tidak ada item audit.</td></tr>"}</tbody>
</table>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const overallOk = counts.error === 0 && counts.warning === 0;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-base md:text-xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-600 shrink-0" strokeWidth={1.5} />
            Audit & Debug Center
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Pantau kesehatan sistem, sinkronisasi, dan konsistensi data secara real-time.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <RealtimeIndicator showLabel />
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-[11px] gap-1.5"
            onClick={() => setMode(m => m === "compact" ? "technical" : "compact")}
          >
            {mode === "compact" ? <Code2 className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {mode === "compact" ? "Teknis" : "Ringkas"}
          </Button>
          <Button
            size="sm"
            className="h-8 text-[11px] gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
            disabled={loading}
            onClick={runAudit}
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Jalankan Audit
          </Button>
        </div>
      </motion.div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard label="Error"   value={counts.error}   color="#ef4444" />
        <StatCard label="Perhatian" value={counts.warning} color="#f59e0b" />
        <StatCard label="Info"    value={counts.info}    color="#3b82f6" />
        <StatCard label="OK"      value={counts.success} color="#10b981" />
      </div>

      {/* Overall status banner */}
      {!loading && (
        <div className={cn("rounded-xl px-4 py-3 flex items-center gap-3 border",
          overallOk ? "bg-emerald-50 border-emerald-200" : counts.error > 0 ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"
        )}>
          {overallOk
            ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            : counts.error > 0
            ? <XCircle className="h-4 w-4 text-red-600 shrink-0" />
            : <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />}
          <p className={cn("text-sm font-semibold",
            overallOk ? "text-emerald-700" : counts.error > 0 ? "text-red-700" : "text-amber-700"
          )}>
            {overallOk
              ? "✅ Sistem berjalan normal — tidak ada masalah ditemukan."
              : counts.error > 0
              ? `⚠️ Ditemukan ${counts.error} error dan ${counts.warning} peringatan yang perlu ditangani.`
              : `ℹ️ Ditemukan ${counts.warning} peringatan. Tidak ada error kritis.`}
          </p>
        </div>
      )}

      {/* Actions bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
          <Input
            placeholder="Cari audit item…"
            className="pl-7 h-8 text-[11px] rounded-lg"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {(["all", "error", "warning", "info", "success"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={sevFilter === f ? "default" : "outline"}
            className={cn("h-8 text-[11px] px-2.5 capitalize", sevFilter === f && "bg-blue-600 text-white hover:bg-blue-700")}
            onClick={() => setSevFilter(f)}
          >
            {f === "all" ? "Semua" : SEV_CFG[f as AuditSeverity].label}
            {f !== "all" && <span className="ml-1 opacity-70">({counts[f as AuditSeverity]})</span>}
          </Button>
        ))}
        <div className="flex items-center gap-1.5 ml-auto">
          <Button size="sm" variant="outline" className="h-8 text-[11px] gap-1" onClick={handleCopyReport}>
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            {copied ? "Tersalin" : "Salin Laporan"}
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-[11px] gap-1" onClick={handleExportCSV}>
            <Download className="h-3 w-3" /> CSV
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-[10px] gap-1" onClick={handleExportJSON}>
            <Download className="h-3 w-3" /> JSON
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-[10px] gap-1" onClick={handleExportPDF}>
            <Download className="h-3 w-3" /> PDF
          </Button>
        </div>
      </div>

      {/* Audit items list */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-gray-400 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Menjalankan audit sistem…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white py-10 text-center text-sm text-gray-400">
          Tidak ada item audit yang cocok dengan filter ini.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <AuditItemCard key={item.id} item={item} mode={mode} />
          ))}
        </div>
      )}

      {/* Audit Log timeline (technical mode) */}
      {mode === "technical" && auditLogs.length > 0 && (
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <Database className="h-4 w-4 text-blue-500" />
            Audit Log Database ({auditLogs.length} entri terbaru)
          </h2>
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {auditLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-2 text-[10px] font-mono border-b border-gray-50 pb-1">
                <span className={cn("shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold",
                  log.action === "INSERT" ? "bg-emerald-100 text-emerald-700"
                  : log.action === "DELETE" ? "bg-red-100 text-red-700"
                  : "bg-amber-100 text-amber-700"
                )}>{log.action}</span>
                <span className="text-gray-500">{log.tableName}</span>
                <span className="text-gray-400">#{log.recordId?.slice(0, 8) ?? "—"}</span>
                <span className="text-gray-300 ml-auto shrink-0">{fmtDt(log.createdAt)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Health check detail (technical mode) */}
      {mode === "technical" && health && (
        <Card className="p-4 space-y-2">
          <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-500" />
            Health Check Detail
          </h2>
          <pre className="text-[10px] font-mono bg-gray-50 rounded-lg p-3 overflow-x-auto text-gray-600">
            {JSON.stringify(health, null, 2)}
          </pre>
        </Card>
      )}

      {/* Sync status detail (technical mode) */}
      {mode === "technical" && (
        <Card className="p-4 space-y-2">
          <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <Wallet className="h-4 w-4 text-blue-500" />
            Feature Sync Status
          </h2>
          {Object.keys(syncStatuses).length === 0 ? (
            <p className="text-[11px] text-gray-400">Tidak ada fitur yang sedang di-sync.</p>
          ) : (
            <div className="space-y-1">
              {Object.entries(syncStatuses).map(([key, status]) => (
                <div key={key} className="flex items-center justify-between text-[10px] font-mono border-b border-gray-50 pb-1">
                  <span className="text-gray-600">{key}</span>
                  <span className={cn("px-1.5 py-0.5 rounded font-bold text-[9px]",
                    status === "ok" ? "bg-emerald-100 text-emerald-700"
                    : status === "error" ? "bg-red-100 text-red-700"
                    : status === "syncing" ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-500"
                  )}>{status}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
