import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, TrendingUp, Plane, GraduationCap, Save, FolderOpen, X, Check, Loader2, WifiOff } from "lucide-react";
import { useRatesStore } from "@/store/ratesStore";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  listVisaSavedCalcs,
  createVisaSavedCalc,
  deleteVisaSavedCalc,
  type SavedVisaCalcRow,
} from "./visaCalcsRepo";

const M: React.CSSProperties = { fontFamily: "inherit" };

type VisaType = "voa" | "student";

interface CostRow {
  id: string;
  label: string;
  amount: number;
  currency: "IDR" | "USD";
  perPax: boolean;
}

interface VisaCalcState {
  pax: number;
  costs: CostRow[];
  sellPricePerPax: number;
  sellCurrency: "IDR" | "USD";
}

function makeVoaDefault(): VisaCalcState {
  return {
    pax: 10,
    costs: [
      { id: "v1", label: "Biaya VoA (Government Fee)",   amount: 35,      currency: "USD", perPax: true  },
      { id: "v2", label: "Biaya Jasa Pengurusan",         amount: 150_000, currency: "IDR", perPax: true  },
      { id: "v3", label: "Biaya Transport Operasional",   amount: 500_000, currency: "IDR", perPax: false },
      { id: "v4", label: "Biaya Administrasi",            amount: 200_000, currency: "IDR", perPax: false },
    ],
    sellPricePerPax: 700_000,
    sellCurrency: "IDR",
  };
}

function makeStudentDefault(): VisaCalcState {
  return {
    pax: 5,
    costs: [
      { id: "s1", label: "Biaya Visa Pelajar (Fee Resmi)", amount: 150_000, currency: "IDR", perPax: true  },
      { id: "s2", label: "Biaya Formulir & Dokumen",        amount: 50_000,  currency: "IDR", perPax: true  },
      { id: "s3", label: "Biaya Jasa Pengurusan",           amount: 300_000, currency: "IDR", perPax: true  },
      { id: "s4", label: "Biaya Fotokopi & Materai",        amount: 75_000,  currency: "IDR", perPax: true  },
      { id: "s5", label: "Biaya Transport & Operasional",   amount: 300_000, currency: "IDR", perPax: false },
    ],
    sellPricePerPax: 750_000,
    sellCurrency: "IDR",
  };
}

function fmtIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(ts: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(ts));
}

function numInput(v: number, onChange: (n: number) => void, cls?: string) {
  return (
    <input
      type="number"
      value={v || ""}
      min={0}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      style={M}
      className={cn(
        "border border-slate-200 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white",
        cls,
      )}
    />
  );
}

function uid() { return Math.random().toString(36).slice(2, 8); }

interface SummaryCardProps { label: string; value: string; sub?: string; color: string; }
function SummaryCard({ label, value, sub, color }: SummaryCardProps) {
  return (
    <div className={cn("rounded-xl border p-3 space-y-0.5", color)}>
      <p className="text-[10px] font-extrabold uppercase tracking-wider opacity-70" style={M}>{label}</p>
      <p className="text-[16px] font-extrabold tabular-nums" style={M}>{value}</p>
      {sub && <p className="text-[10px] opacity-60" style={M}>{sub}</p>}
    </div>
  );
}

// ── Save Dialog ───────────────────────────────────────────────────────────────
interface SaveDialogProps { onSave: (name: string) => void; onClose: () => void; saving: boolean; }
function SaveDialog({ onSave, onClose, saving }: SaveDialogProps) {
  const [name, setName] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 w-80 space-y-4" onClick={(e) => e.stopPropagation()} style={M}>
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-extrabold text-slate-800" style={M}>Simpan Hitungan</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1" style={M}>Nama Hitungan</label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim() && !saving) onSave(name.trim()); }}
            placeholder="cth: VoA Grup Bali Juli"
            style={M}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} style={M} className="px-4 py-1.5 rounded-lg text-[11px] font-bold text-slate-500 border border-slate-200 hover:bg-slate-50">
            Batal
          </button>
          <button
            onClick={() => { if (name.trim()) onSave(name.trim()); }}
            disabled={!name.trim() || saving}
            style={M}
            className="px-4 py-1.5 rounded-lg text-[11px] font-bold bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Load Panel ────────────────────────────────────────────────────────────────
interface LoadPanelProps {
  saved: SavedVisaCalcRow[];
  loading: boolean;
  onLoad: (item: SavedVisaCalcRow) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}
function LoadPanel({ saved, loading, onLoad, onDelete, onClose }: LoadPanelProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    await onDelete(id);
    setDeletingId(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 w-96 space-y-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()} style={M}>
        <div className="flex items-center justify-between shrink-0">
          <p className="text-[13px] font-extrabold text-slate-800" style={M}>Hitungan Tersimpan</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-slate-400 gap-2" style={M}>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-[12px]">Memuat...</span>
          </div>
        ) : saved.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-[12px]" style={M}>
            Belum ada hitungan tersimpan.
          </div>
        ) : (
          <div className="overflow-y-auto space-y-2 flex-1">
            {saved.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 hover:bg-slate-50 group">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { onLoad(item); onClose(); }}>
                  <p className="text-[12px] font-bold text-slate-800 truncate" style={M}>{item.name}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5" style={M}>
                    {item.visaType === "voa" ? "Visa on Arrival" : "Visa Pelajar"} · {(item.state as VisaCalcState)?.pax ?? "?"} pax · {fmtDate(item.createdAt)}
                  </p>
                </div>
                <button
                  onClick={() => { onLoad(item); onClose(); }}
                  style={M}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-sky-500 text-white hover:bg-sky-600 shrink-0"
                >
                  Muat
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  disabled={deletingId === item.id}
                  className="text-slate-300 hover:text-red-400 shrink-0 disabled:opacity-40"
                >
                  {deletingId === item.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />
                  }
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="shrink-0 text-[10px] text-slate-400 text-center" style={M}>
          Hitungan tersimpan di cloud — bisa diakses dari device mana saja
        </div>
      </div>
    </div>
  );
}

// ── Visa Form ─────────────────────────────────────────────────────────────────
interface VisaFormProps {
  state: VisaCalcState;
  setState: React.Dispatch<React.SetStateAction<VisaCalcState>>;
  usdRate: number;
  onSaveClick: () => void;
}
function VisaForm({ state, setState, usdRate, onSaveClick }: VisaFormProps) {
  function setField<K extends keyof VisaCalcState>(k: K, v: VisaCalcState[K]) {
    setState((s) => ({ ...s, [k]: v }));
  }
  function updateCost(id: string, patch: Partial<CostRow>) {
    setState((s) => ({ ...s, costs: s.costs.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  }
  function removeCost(id: string) {
    setState((s) => ({ ...s, costs: s.costs.filter((c) => c.id !== id) }));
  }
  function addCost() {
    setState((s) => ({
      ...s,
      costs: [...s.costs, { id: uid(), label: "Biaya Tambahan", amount: 0, currency: "IDR", perPax: true }],
    }));
  }

  const toIDR = (row: CostRow) => row.currency === "USD" ? row.amount * usdRate : row.amount;
  const hppPerPax = state.costs.filter((c) => c.perPax).reduce((acc, c) => acc + toIDR(c), 0);
  const hppGroup  = state.costs.filter((c) => !c.perPax).reduce((acc, c) => acc + toIDR(c), 0);
  const hppPerPaxTotal = hppPerPax + (state.pax > 0 ? hppGroup / state.pax : 0);
  const hppTotal       = hppPerPax * state.pax + hppGroup;
  const sellIDR        = state.sellCurrency === "USD" ? state.sellPricePerPax * usdRate : state.sellPricePerPax;
  const profitPerPax   = sellIDR - hppPerPaxTotal;
  const profitTotal    = profitPerPax * state.pax;
  const marginPct      = hppPerPaxTotal > 0 ? (profitPerPax / hppPerPaxTotal) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Jumlah peserta + Simpan */}
      <div className="flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
        <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider" style={M}>Jumlah Peserta</span>
        <input
          type="number" min={1} value={state.pax || ""}
          onChange={(e) => setField("pax", Math.max(1, Number(e.target.value) || 1))}
          style={M}
          className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-[14px] font-bold text-center focus:outline-none focus:ring-2 focus:ring-sky-400"
        />
        <span className="text-[11px] text-slate-400" style={M}>orang</span>
        <button
          onClick={onSaveClick}
          style={M}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10.5px] font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors shadow-sm"
        >
          <Save className="h-3.5 w-3.5" />
          Simpan Hitungan
        </button>
      </div>

      {/* Cost rows */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-slate-100 text-slate-500 font-extrabold uppercase tracking-wider">
              <th className="px-3 py-2 text-left" style={M}>Komponen Biaya</th>
              <th className="px-2 py-2 text-center w-20" style={M}>Mata Uang</th>
              <th className="px-2 py-2 text-right w-32" style={M}>Nominal</th>
              <th className="px-2 py-2 text-center w-24" style={M}>Per Pax?</th>
              <th className="px-2 py-2 text-right w-32" style={M}>IDR / Pax</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {state.costs.map((row) => {
              const rowIDR    = toIDR(row);
              const perPaxIDR = row.perPax ? rowIDR : (state.pax > 0 ? rowIDR / state.pax : 0);
              return (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <input
                      type="text" value={row.label}
                      onChange={(e) => updateCost(row.id, { label: e.target.value })}
                      style={M}
                      className="w-full bg-transparent border-b border-dashed border-slate-200 text-[11px] focus:outline-none focus:border-sky-400 text-slate-700 font-medium"
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <select
                      value={row.currency}
                      onChange={(e) => updateCost(row.id, { currency: e.target.value as "IDR" | "USD" })}
                      style={M}
                      className="text-[10.5px] font-bold border border-slate-200 rounded-md px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-sky-400 bg-white"
                    >
                      <option value="IDR">IDR</option>
                      <option value="USD">USD</option>
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    {numInput(row.amount, (v) => updateCost(row.id, { amount: v }), "w-full")}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      onClick={() => updateCost(row.id, { perPax: !row.perPax })}
                      style={M}
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[9.5px] font-bold border transition-colors",
                        row.perPax ? "bg-sky-100 border-sky-300 text-sky-700" : "bg-slate-100 border-slate-300 text-slate-500"
                      )}
                    >
                      {row.perPax ? "Per Pax" : "Total"}
                    </button>
                  </td>
                  <td className="px-2 py-2 text-right text-[11px] font-semibold tabular-nums text-slate-600" style={M}>
                    {fmtIDR(perPaxIDR)}
                  </td>
                  <td className="px-1 py-2">
                    <button onClick={() => removeCost(row.id)} className="p-1 text-slate-300 hover:text-red-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-50">
              <td colSpan={4} className="px-3 py-2 text-[11px] font-extrabold text-slate-600" style={M}>HPP Total (Modal per Pax)</td>
              <td className="px-2 py-2 text-right text-[13px] font-extrabold text-slate-800 tabular-nums" style={M}>{fmtIDR(hppPerPaxTotal)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <button onClick={addCost} style={M} className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-600 hover:text-sky-700 px-2 py-1">
        <Plus className="h-3.5 w-3.5" />
        Tambah Komponen Biaya
      </button>

      {/* Harga Jual */}
      <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-extrabold text-violet-600 uppercase tracking-wider" style={M}>Harga Jual per Pax</span>
        <div className="flex items-center gap-2 ml-auto">
          <select value={state.sellCurrency} onChange={(e) => setField("sellCurrency", e.target.value as "IDR" | "USD")} style={M}
            className="text-[11px] font-bold border border-violet-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white">
            <option value="IDR">IDR</option>
            <option value="USD">USD</option>
          </select>
          {numInput(state.sellPricePerPax, (v) => setField("sellPricePerPax", v), "w-36")}
          {state.sellCurrency === "USD" && (
            <span className="text-[10px] text-violet-500" style={M}>= {fmtIDR(sellIDR)}</span>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <SummaryCard label="HPP / Pax" value={fmtIDR(hppPerPaxTotal)} sub={`Total group: ${fmtIDR(hppTotal)}`} color="bg-slate-50 border-slate-200 text-slate-800" />
        <SummaryCard label="Harga Jual / Pax" value={fmtIDR(sellIDR)} sub={`${state.pax} pax: ${fmtIDR(sellIDR * state.pax)}`} color="bg-violet-50 border-violet-200 text-violet-800" />
        <SummaryCard
          label={profitPerPax >= 0 ? "Untung / Pax" : "Rugi / Pax"}
          value={fmtIDR(profitPerPax)}
          sub={`Margin ${marginPct.toFixed(1)}%`}
          color={profitPerPax >= 0 ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"}
        />
        <SummaryCard
          label={profitTotal >= 0 ? "Total Keuntungan" : "Total Kerugian"}
          value={fmtIDR(profitTotal)}
          sub={`untuk ${state.pax} pax`}
          color={profitTotal >= 0 ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"}
        />
      </div>

      {/* Break-even */}
      {hppPerPaxTotal > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[10.5px] text-amber-700" style={M}>
          <strong>Break-even price:</strong> {fmtIDR(hppPerPaxTotal)} / pax ·{" "}
          {profitPerPax >= 0
            ? <span className="text-emerald-700 font-semibold">✓ Harga jual di atas HPP, sudah untung.</span>
            : <span className="text-red-600 font-semibold">⚠ Harga jual di bawah HPP, akan merugi!</span>
          }
        </div>
      )}
    </div>
  );
}

// ── Main Tab ──────────────────────────────────────────────────────────────────
export function VisaCalculatorTab() {
  const usdRate  = useRatesStore((s) => s.rates.USD);
  const user     = useAuthStore((s) => s.user);

  const [visaType, setVisaType]       = useState<VisaType>("voa");
  const [voaState, setVoaState]       = useState<VisaCalcState>(makeVoaDefault);
  const [studentState, setStudentState] = useState<VisaCalcState>(makeStudentDefault);

  const [savedList, setSavedList]     = useState<SavedVisaCalcRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadPanel, setShowLoadPanel]   = useState(false);
  const [saving, setSaving]           = useState(false);
  const [dbAvailable, setDbAvailable] = useState(true);

  const agencyId = user?.agencyId ?? null;
  const userId   = user?.id ?? null;

  const fetchSaved = useCallback(async () => {
    if (!agencyId) return;
    setLoadingList(true);
    const rows = await listVisaSavedCalcs(agencyId);
    setSavedList(rows);
    setLoadingList(false);
    if (rows === null) setDbAvailable(false);
  }, [agencyId]);

  useEffect(() => {
    fetchSaved();
  }, [fetchSaved]);

  const currentState     = visaType === "voa" ? voaState : studentState;
  const setCurrentState  = visaType === "voa" ? setVoaState : setStudentState;

  async function handleSave(name: string) {
    if (!userId || !agencyId) return;
    setSaving(true);
    const result = await createVisaSavedCalc(
      userId, agencyId, name, visaType,
      JSON.parse(JSON.stringify(currentState)),
    );
    setSaving(false);
    if (result) {
      setSavedList((prev) => [result, ...prev]);
      setShowSaveDialog(false);
      toast.success("Hitungan berhasil disimpan!", { duration: 2500 });
    } else {
      toast.error("Gagal menyimpan. Coba lagi.");
    }
  }

  async function handleDelete(id: string) {
    const ok = await deleteVisaSavedCalc(id);
    if (ok) {
      setSavedList((prev) => prev.filter((s) => s.id !== id));
    } else {
      toast.error("Gagal menghapus hitungan.");
    }
  }

  function handleLoad(item: SavedVisaCalcRow) {
    const state = item.state as VisaCalcState;
    setVisaType(item.visaType);
    if (item.visaType === "voa") setVoaState(state);
    else setStudentState(state);
    toast.success(`Hitungan "${item.name}" dimuat.`, { duration: 2000 });
  }

  const tabs: { key: VisaType; label: string; icon: React.ElementType; desc: string }[] = [
    { key: "voa",     label: "Visa on Arrival", icon: Plane,         desc: "VoA untuk turis asing / visa kunjungan" },
    { key: "student", label: "Visa Pelajar",     icon: GraduationCap, desc: "Visa masuk pelajar / student entry"      },
  ];

  return (
    <div className="space-y-4" style={M}>
      {showSaveDialog && (
        <SaveDialog onSave={handleSave} onClose={() => setShowSaveDialog(false)} saving={saving} />
      )}
      {showLoadPanel && (
        <LoadPanel
          saved={savedList}
          loading={loadingList}
          onLoad={handleLoad}
          onDelete={handleDelete}
          onClose={() => setShowLoadPanel(false)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-muted-foreground" style={M}>
          Hitung HPP, harga jual, dan keuntungan per layanan visa
        </p>
        <div className="flex items-center gap-2">
          {!dbAvailable && (
            <span className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1" style={M}>
              <WifiOff className="h-3 w-3" /> Tabel belum dibuat
            </span>
          )}
          <button
            onClick={() => { fetchSaved(); setShowLoadPanel(true); }}
            style={M}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10.5px] font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors relative"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Hitungan Tersimpan
            {savedList.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-sky-500 text-white text-[9px] font-extrabold rounded-full w-4 h-4 flex items-center justify-center">
                {savedList.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Sub-tab switcher */}
      <div className="flex items-center gap-1 p-1 rounded-xl border border-slate-200 bg-slate-50 self-start flex-wrap">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setVisaType(key)}
            style={M}
            className={cn(
              "px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all inline-flex items-center gap-1.5",
              visaType === key ? "bg-sky-500 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100"
            )}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
            {label}
          </button>
        ))}
      </div>

      {/* Active tab description */}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-sky-50 border border-sky-100 rounded-lg px-3 py-1.5" style={M}>
        <TrendingUp className="h-3.5 w-3.5 text-sky-500 shrink-0" />
        {tabs.find((t) => t.key === visaType)?.desc} ·{" "}
        <span className="font-semibold">kurs USD = {new Intl.NumberFormat("id-ID").format(usdRate)} IDR</span>
      </div>

      {/* Form */}
      {visaType === "voa" ? (
        <VisaForm state={voaState} setState={setVoaState} usdRate={usdRate} onSaveClick={() => setShowSaveDialog(true)} />
      ) : (
        <VisaForm state={studentState} setState={setStudentState} usdRate={usdRate} onSaveClick={() => setShowSaveDialog(true)} />
      )}
    </div>
  );
}
