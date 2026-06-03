import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plane, Sparkles, UserPlus, UserCheck, Wand2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { useClientsStore, type Client } from "@/store/clientsStore";
import { parseFlightText, formatRoute, type ParsedFlight } from "@/features/orders/flightParser";
import { decidePassportSync } from "@/features/clients/passportSync";
import { PassportScanButton } from "@/components/PassportScanButton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Bentuk metadata yang kita simpan di kolom `orders.metadata` ketika
 * `type === 'flight'`. Semua field opsional supaya backwards-compat dgn
 * order lama yg belum punya struktur ini.
 */
export interface FlightMeta {
  pnr?: string;
  airline?: string;
  flightNumber?: string;
  fromCode?: string;
  fromCity?: string;
  toCode?: string;
  toCity?: string;
  departDate?: string;
  departTime?: string;
  arriveDate?: string;
  arriveTime?: string;
  passengerName?: string;
  /** Harga modal (HPP) — utk kalkulasi profit. */
  costPrice?: number;
  /** Harga jual ke klien. Di-mirror ke order.totalPrice. */
  sellPrice?: number;
  /** Raw text yg dipaste user di Magic Parser, disimpan utk reference. */
  rawText?: string;
  /** Tipe perjalanan: sekali jalan atau pulang pergi */
  tripType?: "one_way" | "return";
  /** Field leg pulang (return trip) */
  returnFromCode?: string;
  returnFromCity?: string;
  returnToCode?: string;
  returnToCity?: string;
  returnDate?: string;
  returnDepartTime?: string;
  returnArriveDate?: string;
  returnArriveTime?: string;
  returnFlightNumber?: string;
}

const fmtIDR = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);

interface Props {
  /** Initial flight metadata. Kalo undefined → dianggap order baru/blank. */
  value: FlightMeta;
  /** Initial selected client (boleh null). */
  clientId: string | null;
  /** Dipanggil tiap kali user ngubah field — parent simpan ke local draft. */
  onChange: (meta: FlightMeta, totalPrice: number, clientId: string | null) => void;
  /** Optional title untuk update order.title saat user nge-set route. */
  onAutoTitle?: (title: string) => void;
}

/**
 * Editor lengkap utk flight order:
 *  1. Magic Parser textarea (paste Galileo/Trip.com text → auto-fill)
 *  2. Form fields: PNR, airline, flight#, route, jadwal, harga
 *  3. Passport scan → decidePassportSync → update/create client → link ke order
 */
export function FlightOrderEditor({ value, clientId, onChange, onAutoTitle }: Props) {
  const { clients, fetchClients, addClient, patchClient } = useClientsStore();
  const navigate = useNavigate();

  const [meta, setMeta] = useState<FlightMeta>(value);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(clientId);
  const [rawText, setRawText] = useState<string>(value.rawText ?? "");
  const [parsing, setParsing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Sync dgn parent ketika props.value berubah (mis. order ke-load ulang)
  useEffect(() => {
    setMeta(value);
    setRawText(value.rawText ?? "");
  }, [value]);

  useEffect(() => {
    setSelectedClientId(clientId);
  }, [clientId]);

  useEffect(() => {
    if (clients.length === 0) void fetchClients();
  }, [clients.length, fetchClients]);

  // Helper: update field dan propagate ke parent
  const updateMeta = (patch: Partial<FlightMeta>) => {
    const next = { ...meta, ...patch };
    setMeta(next);
    onChange(next, Number(next.sellPrice ?? 0), selectedClientId);
  };

  const updateClient = (id: string | null) => {
    setSelectedClientId(id);
    onChange(meta, Number(meta.sellPrice ?? 0), id);
  };

  const linkedClient = useMemo(
    () => (selectedClientId ? clients.find((c) => c.id === selectedClientId) ?? null : null),
    [clients, selectedClientId],
  );

  // ── Magic Parser ──
  const handleParse = () => {
    if (!rawText.trim()) {
      toast.error("Tempel dulu data tiket di textarea");
      return;
    }
    setParsing(true);
    try {
      const parsed = parseFlightText(rawText);
      const filledCount = Object.keys(parsed).length;
      if (filledCount === 0) {
        toast.warning("Parser gak nemu data", {
          description: "Coba paste text yang lebih lengkap (PNR, kode IATA, tanggal).",
        });
        return;
      }
      // Merge: jangan overwrite field yg user udah isi manual.
      const merged: FlightMeta = { ...meta, rawText };
      (Object.keys(parsed) as (keyof ParsedFlight)[]).forEach((k) => {
        const cur = (merged as Record<string, unknown>)[k];
        if (cur === undefined || cur === "" || cur === 0 || cur === null) {
          (merged as Record<string, unknown>)[k] = parsed[k];
        }
      });
      setMeta(merged);
      const totalPrice = Number(merged.sellPrice ?? 0);
      onChange(merged, totalPrice, selectedClientId);
      // Auto-set title kalo masih kosong
      if (onAutoTitle && merged.fromCode && merged.toCode) {
        const title = `${merged.fromCode} → ${merged.toCode}${merged.departDate ? ` · ${merged.departDate}` : ""}`;
        onAutoTitle(title);
      }
      toast.success(`Berhasil parse ${filledCount} field`, {
        description: filledCount < 6 ? "Cek field yang masih kosong & isi manual ya." : undefined,
      });
    } catch (e) {
      toast.error("Parser error", {
        description: e instanceof Error ? e.message : "Format tidak dikenali.",
      });
    } finally {
      setParsing(false);
    }
  };

  const handleClearParser = () => {
    setRawText("");
    updateMeta({ rawText: undefined });
  };

  // ── Passport scan & sync ──
  const handlePassportScan = async (
    passport: import("@/lib/ocrPassport").PassportData,
    photoDataUrl: string,
  ) => {
    setSyncing(true);
    try {
      const decision = decidePassportSync(clients, passport, { photoDataUrl });
      if (decision.kind === "noop") {
        toast.warning("Data paspor terlalu kosong", { description: decision.reason });
        return;
      }
      if (decision.kind === "match") {
        const { client, patch } = decision;
        if (Object.keys(patch).length > 0) {
          await patchClient(client.id, patch);
          toast.success("Klien diperbarui dari paspor", {
            description: `${client.name} — ${Object.keys(patch).length} field di-update.`,
          });
        } else {
          toast.success("Klien sudah lengkap", {
            description: `Cocok dgn ${client.name}, gak ada field baru.`,
          });
        }
        // Link ke order + auto-set passenger name di flight meta
        updateClient(client.id);
        if (passport.name && !meta.passengerName) {
          updateMeta({ passengerName: passport.name });
        }
        return;
      }
      // create
      const newClient = await addClient(decision.draft);
      toast.success("Klien baru dibuat dari paspor", {
        description: `${newClient.name}${newClient.passportNumber ? ` · ${newClient.passportNumber}` : ""}`,
        action: {
          label: "Lihat",
          onClick: () => navigate(`/clients/${newClient.id}`),
        },
      });
      updateClient(newClient.id);
      if (passport.name && !meta.passengerName) {
        updateMeta({ passengerName: passport.name });
      }
    } catch (e) {
      toast.error("Sync paspor gagal", {
        description: e instanceof Error ? e.message : "Coba lagi.",
      });
    } finally {
      setSyncing(false);
    }
  };

  const profit = Number(meta.sellPrice ?? 0) - Number(meta.costPrice ?? 0);

  return (
    <div className="space-y-5">
      {/* ── Magic Parser ───────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold">Magic Parser</h3>
          </div>
          <span className="text-[10px] text-muted-foreground">Galileo / Trip.com / itinerary email</span>
        </div>
        <p className="text-[11.5px] text-muted-foreground -mt-1">
          Tempel raw text booking di sini — PNR, airline, rute, jadwal, harga akan di-isi otomatis.
        </p>
        <Textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text");
            if (pasted.trim().length > 20) {
              setTimeout(() => {
                setRawText(pasted);
                const btn = document.querySelector('[data-parse-btn]') as HTMLButtonElement;
                if (btn) btn.click();
              }, 100);
            }
          }}
          placeholder={`Contoh:\n  1 GA 980 Y 15MAR 4 CGKJED HK1  1700 0030 16MAR\n  RLOC 1A ABC123\n  Total: IDR 12.500.000`}
          className="min-h-[120px] font-mono text-[12px]"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={handleParse}
            disabled={parsing || !rawText.trim()}
            className="bg-amber-600 hover:bg-amber-700 text-white"
            data-parse-btn="true"
          >
            <Wand2 className="h-3.5 w-3.5 mr-1.5" />
            {parsing ? "Parsing…" : "Parse Sekarang"}
          </Button>
          {rawText && (
            <Button type="button" size="sm" variant="outline" onClick={handleClearParser}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Reset
            </Button>
          )}
        </div>
      </section>

      {/* ── Flight form ────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Plane className="h-4 w-4 text-sky-600" />
          <h3 className="text-sm font-semibold">Detail Tiket</h3>
        </div>

        {/* Trip type toggle */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm font-medium text-slate-600">Tipe Perjalanan:</span>
          <div className="flex rounded-xl border border-slate-200 overflow-hidden">
            <button
              type="button"
              onClick={() => updateMeta({ tripType: "one_way" })}
              className={cn(
                "px-4 py-1.5 text-[13px] font-semibold transition-colors",
                (meta.tripType ?? "one_way") === "one_way"
                  ? "bg-blue-600 text-white"
                  : "text-slate-500 hover:bg-slate-50"
              )}
            >
              Sekali Jalan
            </button>
            <button
              type="button"
              onClick={() => updateMeta({ tripType: "return" })}
              className={cn(
                "px-4 py-1.5 text-[13px] font-semibold transition-colors",
                meta.tripType === "return"
                  ? "bg-blue-600 text-white"
                  : "text-slate-500 hover:bg-slate-50"
              )}
            >
              Pulang Pergi ⇄
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="PNR / Kode Booking">
            <Input
              value={meta.pnr ?? ""}
              onChange={(e) => updateMeta({ pnr: e.target.value.toUpperCase() })}
              placeholder="ABC123"
              className="font-mono uppercase"
            />
          </Field>
          <Field label="Airline">
            <Input
              value={meta.airline ?? ""}
              onChange={(e) => updateMeta({ airline: e.target.value })}
              placeholder="Garuda Indonesia"
            />
          </Field>
          <Field label="Nomor Penerbangan">
            <Input
              value={meta.flightNumber ?? ""}
              onChange={(e) => updateMeta({ flightNumber: e.target.value.toUpperCase() })}
              placeholder="GA980"
              className="font-mono uppercase"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-secondary/30 p-3 space-y-2">
            <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground font-semibold">Berangkat</div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Kode (IATA)">
                <Input
                  value={meta.fromCode ?? ""}
                  onChange={(e) => updateMeta({ fromCode: e.target.value.toUpperCase().slice(0, 3) })}
                  placeholder="CGK"
                  className="font-mono uppercase"
                />
              </Field>
              <Field label="Kota">
                <Input
                  value={meta.fromCity ?? ""}
                  onChange={(e) => updateMeta({ fromCity: e.target.value })}
                  placeholder="Jakarta"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tgl">
                <Input type="date" value={meta.departDate ?? ""} onChange={(e) => updateMeta({ departDate: e.target.value })} />
              </Field>
              <Field label="Jam">
                <Input type="time" value={meta.departTime ?? ""} onChange={(e) => updateMeta({ departTime: e.target.value })} />
              </Field>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-secondary/30 p-3 space-y-2">
            <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground font-semibold">Tiba</div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Kode (IATA)">
                <Input
                  value={meta.toCode ?? ""}
                  onChange={(e) => updateMeta({ toCode: e.target.value.toUpperCase().slice(0, 3) })}
                  placeholder="JED"
                  className="font-mono uppercase"
                />
              </Field>
              <Field label="Kota">
                <Input
                  value={meta.toCity ?? ""}
                  onChange={(e) => updateMeta({ toCity: e.target.value })}
                  placeholder="Jeddah"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tgl">
                <Input type="date" value={meta.arriveDate ?? ""} onChange={(e) => updateMeta({ arriveDate: e.target.value })} />
              </Field>
              <Field label="Jam">
                <Input type="time" value={meta.arriveTime ?? ""} onChange={(e) => updateMeta({ arriveTime: e.target.value })} />
              </Field>
            </div>
          </div>
        </div>

        {/* Return leg — hanya tampil kalau pulang pergi */}
        {meta.tripType === "return" && (
          <div className="border border-violet-200 rounded-2xl p-4 space-y-3 bg-violet-50/30">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-violet-700">✈️ Leg Pulang</span>
              <span className="text-[11px] text-violet-400">(return flight)</span>
            </div>

            {/* Nomor penerbangan pulang */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Nomor Penerbangan Pulang
              </label>
              <Input
                placeholder="e.g. EK357"
                value={meta.returnFlightNumber ?? ""}
                onChange={(e) => updateMeta({ returnFlightNumber: e.target.value.toUpperCase() })}
                className="mt-1"
              />
            </div>

            {/* Rute pulang */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2 border border-slate-200 rounded-xl p-3 bg-white">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Berangkat (Pulang)</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400">Kode (IATA)</label>
                    <Input
                      placeholder="DXB"
                      value={meta.returnFromCode ?? ""}
                      onChange={(e) => updateMeta({ returnFromCode: e.target.value.toUpperCase().slice(0, 3) })}
                      className="mt-0.5 uppercase"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400">Kota</label>
                    <Input
                      placeholder="Dubai"
                      value={meta.returnFromCity ?? ""}
                      onChange={(e) => updateMeta({ returnFromCity: e.target.value })}
                      className="mt-0.5"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400">Tgl</label>
                    <Input
                      type="date"
                      value={meta.returnDate ?? ""}
                      onChange={(e) => updateMeta({ returnDate: e.target.value })}
                      className="mt-0.5"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400">Jam</label>
                    <Input
                      type="time"
                      value={meta.returnDepartTime ?? ""}
                      onChange={(e) => updateMeta({ returnDepartTime: e.target.value })}
                      className="mt-0.5"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2 border border-slate-200 rounded-xl p-3 bg-white">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tiba (Pulang)</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400">Kode (IATA)</label>
                    <Input
                      placeholder="CGK"
                      value={meta.returnToCode ?? ""}
                      onChange={(e) => updateMeta({ returnToCode: e.target.value.toUpperCase().slice(0, 3) })}
                      className="mt-0.5 uppercase"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400">Kota</label>
                    <Input
                      placeholder="Jakarta"
                      value={meta.returnToCity ?? ""}
                      onChange={(e) => updateMeta({ returnToCity: e.target.value })}
                      className="mt-0.5"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400">Tgl Tiba</label>
                    <Input
                      type="date"
                      value={meta.returnArriveDate ?? ""}
                      onChange={(e) => updateMeta({ returnArriveDate: e.target.value })}
                      className="mt-0.5"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400">Jam Tiba</label>
                    <Input
                      type="time"
                      value={meta.returnArriveTime ?? ""}
                      onChange={(e) => updateMeta({ returnArriveTime: e.target.value })}
                      className="mt-0.5"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Route preview */}
        {(meta.fromCode || meta.toCode) && (
          <div className="rounded-lg bg-sky-50 border border-sky-100 px-3 py-2 text-[12px] flex items-center gap-2">
            <Plane className="h-3.5 w-3.5 text-sky-600" />
            <span className="font-semibold">{formatRoute(meta) || "—"}</span>
          </div>
        )}

        <Field label="Nama Penumpang">
          <Input
            value={meta.passengerName ?? ""}
            onChange={(e) => updateMeta({ passengerName: e.target.value })}
            placeholder="Sesuai paspor"
          />
        </Field>
      </section>

      {/* ── Pricing ───────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-4 space-y-3">
        <h3 className="text-sm font-semibold">Harga</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Harga Modal (HPP) — IDR">
            <Input
              type="number"
              inputMode="numeric"
              value={meta.costPrice ?? ""}
              onChange={(e) => updateMeta({ costPrice: e.target.value === "" ? undefined : Number(e.target.value) })}
              placeholder="0"
              className="font-mono"
            />
          </Field>
          <Field label="Harga Jual — IDR *">
            <Input
              type="number"
              inputMode="numeric"
              value={meta.sellPrice ?? ""}
              onChange={(e) => updateMeta({ sellPrice: e.target.value === "" ? undefined : Number(e.target.value) })}
              placeholder="0"
              className="font-mono font-semibold"
            />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-2 text-[12px]">
          <Stat label="Modal" value={fmtIDR(Number(meta.costPrice ?? 0))} />
          <Stat label="Jual" value={fmtIDR(Number(meta.sellPrice ?? 0))} highlight />
          <Stat
            label="Profit"
            value={fmtIDR(profit)}
            highlight
            tone={profit >= 0 ? "ok" : "bad"}
          />
        </div>
      </section>

      {/* ── Klien & Passport scan ─────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            {linkedClient ? <UserCheck className="h-4 w-4 text-emerald-600" /> : <UserPlus className="h-4 w-4 text-muted-foreground" />}
            Klien
          </h3>
          <PassportScanButton
            onScanned={handlePassportScan}
            label={syncing ? "Sync…" : "Scan Paspor"}
            aiOnly
          />
        </div>
        <p className="text-[11.5px] text-muted-foreground -mt-1">
          Scan paspor → sistem cek apakah ada klien dgn nomor paspor sama. Kalo ada → di-update; kalo belum → dibuat baru, lalu otomatis ditautkan ke order ini.
        </p>
        <Select value={selectedClientId || "__none"} onValueChange={(v) => updateClient(v === "__none" ? null : v)}>
          <SelectTrigger><SelectValue placeholder="Pilih klien" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">— Tanpa klien —</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}{c.passportNumber ? ` · ${c.passportNumber}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {linkedClient && (
          <ClientSummary client={linkedClient} />
        )}
      </section>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Stat({
  label, value, highlight, tone,
}: { label: string; value: string; highlight?: boolean; tone?: "ok" | "bad" }) {
  const toneClass = tone === "ok" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : "text-foreground";
  return (
    <div className={`rounded-lg border p-2.5 ${highlight ? "bg-secondary/40" : "bg-white"}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-mono font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function ClientSummary({ client }: { client: Client }) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-[12px] space-y-1">
      <div className="font-semibold">{client.name}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground text-[11.5px]">
        {client.phone && <div>📞 {client.phone}</div>}
        {client.email && <div>✉️ {client.email}</div>}
        {client.passportNumber && <div>📄 {client.passportNumber}</div>}
        {client.passportExpiry && <div>⏳ exp {client.passportExpiry}</div>}
      </div>
    </div>
  );
}
