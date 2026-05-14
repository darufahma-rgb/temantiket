import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Crown, CheckCircle2, Circle, Plus, Sparkles,
  TrendingUp, TrendingDown, FileBarChart, Users, Trash2,
  ChevronDown, ChevronUp, RefreshCw, Zap,
  ShoppingBag, Package, MessageSquare, ArrowRight,
} from "lucide-react";
import { useOrdersStore } from "@/store/ordersStore";
import { useRatesStore } from "@/store/ratesStore";
import { useClientsStore } from "@/store/clientsStore";
import { useTripsStore } from "@/store/tripsStore";
import { netProfitIDR, revenueIDR, fmtIDR } from "@/lib/profit";
import { MissionConfetti } from "@/components/MissionConfetti";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────
type MissionCategory = "financial" | "strategic" | "operations" | "custom";

interface CeoMission {
  id: string;
  text: string;
  done: boolean;
  category: MissionCategory;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const STORAGE_PREFIX = "igh.ceo.quest.v2.";

function todayKey() {
  return STORAGE_PREFIX + new Date().toISOString().slice(0, 10);
}

const TEMPLATE_MISSIONS: CeoMission[] = [
  { id: "tpl-1", text: "Review Laporan Keuangan hari ini", done: false, category: "financial" },
  { id: "tpl-2", text: "Kontrol Performa Agen & Mitra", done: false, category: "strategic" },
  { id: "tpl-3", text: "Follow-up 1 prospek umrah terbaru", done: false, category: "operations" },
  { id: "tpl-4", text: "Cek tagihan jamaah yang belum lunas (H-30)", done: false, category: "financial" },
  { id: "tpl-5", text: "Update & review strategi marketing Temantiket", done: false, category: "strategic" },
];

const CATEGORY_META: Record<MissionCategory, { label: string; color: string; bg: string }> = {
  financial:   { label: "Finansial",  color: "text-emerald-700", bg: "bg-emerald-50" },
  strategic:   { label: "Strategis",  color: "text-blue-700",    bg: "bg-blue-50"    },
  operations:  { label: "Operasional",color: "text-amber-700",   bg: "bg-amber-50"   },
  custom:      { label: "Custom",     color: "text-purple-700",  bg: "bg-purple-50"  },
};

const MOTIVATIONAL: { threshold: number; quote: string }[] = [
  { threshold: 0,    quote: "Bismillah — hari baru, peluang baru. Let's build Temantiket! 🚀" },
  { threshold: 0.01, quote: "Bagus! Langkah pertama sudah diambil. Terus maju, CEO! 💪" },
  { threshold: 0.5,  quote: "Halfway there! Konsistensi adalah kunci sukses CEO sejati 🔑" },
  { threshold: 0.8,  quote: "Hampir selesai! Tinggal sedikit lagi — Temantiket menunggu! ⚡" },
  { threshold: 1,    quote: "Masya Allah! Semua misi selesai — Temantiket semakin kuat! 🎉" },
];

function getQuote(pct: number) {
  const match = [...MOTIVATIONAL].reverse().find((m) => pct >= m.threshold);
  return match?.quote ?? MOTIVATIONAL[0].quote;
}

// ── Persistence ────────────────────────────────────────────────────────────────
function loadMissions(): CeoMission[] {
  try {
    const raw = localStorage.getItem(todayKey());
    if (!raw) return TEMPLATE_MISSIONS.map((m) => ({ ...m }));
    return JSON.parse(raw) as CeoMission[];
  } catch {
    return TEMPLATE_MISSIONS.map((m) => ({ ...m }));
  }
}

function saveMissions(missions: CeoMission[]) {
  localStorage.setItem(todayKey(), JSON.stringify(missions));
}

// ── Format helpers ─────────────────────────────────────────────────────────────
function fmtShort(v: number): string {
  if (Math.abs(v) >= 1_000_000_000) return `Rp ${(v / 1_000_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000_000) return `Rp ${(v / 1_000_000).toFixed(1)}jt`;
  if (Math.abs(v) >= 1_000) return `Rp ${(v / 1_000).toFixed(0)}rb`;
  return fmtIDR(v);
}

// ── Component ──────────────────────────────────────────────────────────────────
export function CeoDailyQuest() {
  const navigate = useNavigate();
  const { orders, fetchOrders } = useOrdersStore();
  const egpRate = useRatesStore((s) => s.rates.EGP);
  const { clients } = useClientsStore();
  const { trips } = useTripsStore();

  const [missions, setMissions] = useState<CeoMission[]>(() => loadMissions());
  const [collapsed, setCollapsed] = useState(false);
  const [newText, setNewText] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevAllDone = useRef(false);

  // Fetch orders on mount if not yet loaded
  useEffect(() => {
    if (orders.length === 0) fetchOrders();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Today's financial + activity snapshot
  const todayStats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayOrders = orders.filter(
      (o) => o.createdAt && o.createdAt.startsWith(todayStr)
    );
    const profit = todayOrders.reduce((sum, o) => sum + netProfitIDR(o, egpRate), 0);
    const revenue = todayOrders.reduce((sum, o) => sum + revenueIDR(o, egpRate), 0);
    const count = todayOrders.length;
    const newClients = clients.filter((c) => c.createdAt?.startsWith(todayStr)).length;
    const activeTrips = trips.filter((t) => {
      const start = new Date(t.startDate).getTime();
      const end = new Date(t.endDate).getTime();
      const now = Date.now();
      return start <= now && end >= now;
    }).length;
    return { profit, revenue, count, newClients, activeTrips };
  }, [orders, egpRate, clients, trips]);

  // Progress
  const total = missions.length;
  const done = missions.filter((m) => m.done).length;
  const pct = total > 0 ? done / total : 0;
  const allDone = total > 0 && done === total;

  // Confetti when all missions completed
  useEffect(() => {
    if (allDone && !prevAllDone.current) {
      setShowConfetti(true);
    }
    prevAllDone.current = allDone;
  }, [allDone]);

  // Persist whenever missions change
  useEffect(() => {
    saveMissions(missions);
  }, [missions]);

  // Focus input when add panel opens
  useEffect(() => {
    if (showAdd) setTimeout(() => inputRef.current?.focus(), 80);
  }, [showAdd]);

  function toggleMission(id: string) {
    setMissions((prev) => prev.map((m) => m.id === id ? { ...m, done: !m.done } : m));
  }

  function deleteMission(id: string) {
    setMissions((prev) => prev.filter((m) => m.id !== id));
  }

  function addCustomMission() {
    const text = newText.trim();
    if (!text) return;
    const m: CeoMission = {
      id: `custom-${Date.now()}`,
      text,
      done: false,
      category: "custom",
    };
    setMissions((prev) => [...prev, m]);
    setNewText("");
    setShowAdd(false);
  }

  function resetToTemplate() {
    setMissions(TEMPLATE_MISSIONS.map((m) => ({ ...m, done: false })));
  }

  const quote = getQuote(pct);

  return (
    <>
      <MissionConfetti show={showConfetti} onDone={() => setShowConfetti(false)} />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="mb-1.5 md:mb-5"
      >
        <div className="rounded-xl md:rounded-2xl border border-blue-200/70 overflow-hidden shadow-sm">

          {/* ── Header ───────────────────────────────────────────────────── */}
          <div
            className="relative overflow-hidden px-3 py-2.5 cursor-pointer select-none"
            style={{ background: "linear-gradient(135deg, #0c1e3e 0%, #0f3460 45%, #0c2d6e 100%)" }}
            onClick={() => setCollapsed((c) => !c)}
          >
            {/* Decorative orbs */}
            <div className="absolute -top-6 -right-6 h-24 w-24 rounded-full bg-sky-400/10 pointer-events-none" />
            <div className="absolute -bottom-4 -left-4 h-16 w-16 rounded-full bg-blue-300/10 pointer-events-none" />

            <div className="relative flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {/* Logo mark — always white on the dark gradient card */}
                <div
                  className="h-8 w-8 shrink-0 icon-mark icon-mark-white"
                  role="img"
                  aria-label="Temantiket"
                />

                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-[13.5px] font-extrabold text-white tracking-tight">
                      CEO Daily Quest
                    </h2>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-yellow-400/20 border border-yellow-400/30 text-yellow-300 text-[9.5px] font-bold uppercase tracking-wide">
                      <Crown className="h-2.5 w-2.5" />
                      Owner Only
                    </span>
                  </div>
                  <p className="text-[10.5px] text-blue-200/80 mt-0.5 leading-tight max-w-xs truncate">
                    {quote}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                {/* Progress pill */}
                <div className="flex flex-col items-end gap-0.5">
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-bold text-white tabular-nums">{done}</span>
                    <span className="text-[11px] text-blue-300/80 font-medium">/ {total}</span>
                  </div>
                  <div className="w-16 h-1.5 rounded-full bg-white/15 overflow-hidden">
                    <motion.div
                      className={cn(
                        "h-full rounded-full transition-all",
                        allDone ? "bg-emerald-400" : "bg-sky-400"
                      )}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct * 100}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  </div>
                </div>

                {collapsed
                  ? <ChevronDown className="h-4 w-4 text-blue-300" />
                  : <ChevronUp className="h-4 w-4 text-blue-300" />
                }
              </div>
            </div>
          </div>

          {/* ── Body ─────────────────────────────────────────────────────── */}
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                key="body"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden bg-white"
              >
                {/* ── 3-col summary panels ─────────────────────────────── */}
                <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">

                  {/* Financial Snapshot */}
                  <div className="px-3 pt-2.5 pb-3">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                      Financial Snapshot – Hari Ini
                    </p>
                    <div
                      className="rounded-xl p-2.5 cursor-pointer hover:opacity-90 transition-opacity mb-2"
                      style={{
                        background: todayStats.profit >= 0
                          ? "linear-gradient(135deg,#ecfdf5,#d1fae5)"
                          : "linear-gradient(135deg,#fef2f2,#fee2e2)",
                      }}
                      onClick={() => navigate("/reports")}
                    >
                      <div className="flex items-center gap-1 mb-0.5">
                        {todayStats.profit >= 0
                          ? <TrendingUp className="h-3 w-3 text-emerald-600 shrink-0" />
                          : <TrendingDown className="h-3 w-3 text-red-500 shrink-0" />
                        }
                        <span className="text-[9px] font-semibold text-slate-500">Net Profit</span>
                      </div>
                      <p className={cn(
                        "text-[17px] font-extrabold leading-none tabular-nums",
                        todayStats.profit >= 0 ? "text-emerald-700" : "text-red-600"
                      )}>
                        {todayStats.profit >= 0 ? "+" : ""}{fmtShort(todayStats.profit)}
                      </p>
                      {todayStats.revenue > 0 ? (
                        <p className="text-[8.5px] text-slate-400 mt-0.5">
                          Revenue: {fmtShort(todayStats.revenue)}
                        </p>
                      ) : (
                        <p className="text-[8.5px] text-slate-400 mt-0.5 italic">Belum ada order</p>
                      )}
                    </div>
                    <button
                      onClick={() => navigate("/reports")}
                      className="w-full rounded-lg bg-blue-50 px-2 py-1 flex items-center justify-center gap-1 hover:bg-blue-100 transition-colors"
                    >
                      <FileBarChart className="h-3 w-3 text-blue-600 shrink-0" />
                      <span className="text-[9px] font-semibold text-blue-700">Lihat Laporan</span>
                      <ArrowRight className="h-2.5 w-2.5 text-blue-500 ml-auto" />
                    </button>
                  </div>

                  {/* Aktivitas Hari Ini */}
                  <div className="px-3 pt-2.5 pb-3">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">
                      Aktivitas Hari Ini
                    </p>
                    <div className="space-y-2">
                      {[
                        { icon: ShoppingBag, label: "Order Hari Ini", value: todayStats.count,       color: "#6366f1" },
                        { icon: Package,     label: "Trip Berjalan",  value: todayStats.activeTrips,  color: "#10b981" },
                        { icon: Users,       label: "Klien Baru",     value: todayStats.newClients,   color: "#f59e0b" },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center gap-2">
                          <div
                            className="h-6 w-6 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: `${item.color}15` }}
                          >
                            <item.icon className="h-3 w-3 shrink-0" style={{ color: item.color }} strokeWidth={2} />
                          </div>
                          <span className="flex-1 text-[10.5px] text-slate-600 leading-tight">{item.label}</span>
                          <span className="text-[14px] font-black text-slate-800 tabular-nums">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Quick Action */}
                  <div className="px-3 pt-2.5 pb-3">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">
                      Quick Action
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { icon: ShoppingBag,  label: "Buat Order",    path: "/orders",        color: "#6366f1", bg: "rgba(99,102,241,0.08)"   },
                        { icon: Users,        label: "Tambah Klien",  path: "/clients",       color: "#10b981", bg: "rgba(16,185,129,0.08)"   },
                        { icon: Package,      label: "Buat Trip",     path: "/packages",      color: "#f59e0b", bg: "rgba(245,158,11,0.08)"   },
                        { icon: MessageSquare,label: "Broadcast",     path: "/bc-templates",  color: "#0ea5e9", bg: "rgba(14,165,233,0.08)"   },
                      ].map((action) => (
                        <button
                          key={action.path}
                          onClick={() => navigate(action.path)}
                          className="flex flex-col items-start gap-1 rounded-xl p-2 text-left hover:opacity-80 active:scale-95 transition-all"
                          style={{ background: action.bg }}
                        >
                          <action.icon className="h-3.5 w-3.5 shrink-0" style={{ color: action.color }} strokeWidth={1.8} />
                          <span className="text-[9px] font-semibold leading-tight" style={{ color: action.color }}>{action.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── Mission Checklist ───────────────────────────────────── */}
                <div className="px-3 pt-2 pb-1.5">
                  <div className="flex items-center justify-between mb-2.5">
                    <p className="text-[9.5px] font-bold text-slate-400 uppercase tracking-widest">
                      Strategic Checklist
                    </p>
                    <button
                      onClick={resetToTemplate}
                      className="inline-flex items-center gap-1 text-[9.5px] text-slate-400 hover:text-sky-600 transition-colors"
                      title="Reset ke template harian"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Reset
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <AnimatePresence mode="popLayout">
                      {missions.map((m) => (
                        <motion.div
                          key={m.id}
                          layout
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 8, height: 0 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className={cn(
                            "group flex items-center gap-2 rounded-xl px-2.5 py-1.5 border transition-all cursor-pointer",
                            m.done
                              ? "bg-slate-50 border-slate-100 opacity-60"
                              : "bg-white border-slate-150 hover:border-blue-200 hover:bg-blue-50/30"
                          )}
                          onClick={() => toggleMission(m.id)}
                        >
                          <div className={cn(
                            "h-4.5 w-4.5 shrink-0 transition-colors",
                            m.done ? "text-emerald-500" : "text-slate-300 group-hover:text-blue-400"
                          )}>
                            {m.done
                              ? <CheckCircle2 className="h-[18px] w-[18px]" />
                              : <Circle className="h-[18px] w-[18px]" />
                            }
                          </div>

                          <span className={cn(
                            "flex-1 text-[12px] font-medium leading-snug",
                            m.done ? "line-through text-slate-400" : "text-slate-700"
                          )}>
                            {m.text}
                          </span>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={cn(
                              "text-[9px] font-semibold px-1.5 py-0.5 rounded-full",
                              CATEGORY_META[m.category].color,
                              CATEGORY_META[m.category].bg
                            )}>
                              {CATEGORY_META[m.category].label}
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteMission(m.id); }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:text-red-500 text-slate-300"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    {missions.length === 0 && (
                      <div className="text-center py-5 text-[11px] text-slate-400">
                        Belum ada misi. Tambahkan atau reset ke template.
                      </div>
                    )}
                  </div>

                  {/* ── All-done celebration ──────────────────────────────── */}
                  <AnimatePresence>
                    {allDone && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 6 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="mt-3 rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-sky-50 px-3.5 py-3 flex items-center gap-2.5"
                      >
                        <div className="h-8 w-8 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                          <Sparkles className="h-4 w-4 text-white" />
                        </div>
                        <div>
                          <p className="text-[12px] font-bold text-emerald-800">
                            Semua misi hari ini selesai!
                          </p>
                          <p className="text-[10.5px] text-emerald-600/80 mt-0.5">
                            Temantiket bergerak maju karena konsistensi Anda 🚀
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* ── Add mission panel ───────────────────────────────────── */}
                <div className="px-3 pb-2.5 pt-1 border-t border-slate-100">
                  <AnimatePresence>
                    {showAdd && (
                      <motion.div
                        key="add-form"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden mb-2"
                      >
                        <form
                          onSubmit={(e) => { e.preventDefault(); addCustomMission(); }}
                          className="flex gap-2 pt-2"
                        >
                          <input
                            ref={inputRef}
                            type="text"
                            value={newText}
                            onChange={(e) => setNewText(e.target.value)}
                            placeholder="Tulis misi baru…"
                            maxLength={80}
                            className="flex-1 h-8 rounded-lg border border-slate-200 px-2.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300"
                          />
                          <button
                            type="submit"
                            disabled={!newText.trim()}
                            className="h-8 px-3 rounded-lg bg-sky-500 text-white text-[11px] font-bold disabled:opacity-40 hover:bg-sky-600 transition-colors"
                          >
                            Tambah
                          </button>
                          <button
                            type="button"
                            onClick={() => { setShowAdd(false); setNewText(""); }}
                            className="h-8 px-2 rounded-lg bg-slate-100 text-slate-500 text-[11px] hover:bg-slate-200 transition-colors"
                          >
                            Batal
                          </button>
                        </form>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="flex items-center gap-2 mt-0.5">
                    <button
                      onClick={() => setShowAdd((v) => !v)}
                      className="inline-flex items-center gap-1 text-[9px] text-sky-600 font-semibold hover:text-sky-700 transition-colors"
                    >
                      <Plus className="h-2.5 w-2.5" />
                      Tambah Misi Custom
                    </button>
                    <span className="text-slate-200">·</span>
                    <button
                      onClick={() => navigate("/reports")}
                      className="inline-flex items-center gap-1 text-[9px] text-slate-400 font-medium hover:text-blue-600 transition-colors"
                    >
                      <Zap className="h-3 w-3" />
                      Lihat Laporan Lengkap
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
}
