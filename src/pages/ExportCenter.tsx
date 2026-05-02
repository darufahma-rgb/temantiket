import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { motion } from "framer-motion";
import {
  Download, FileSpreadsheet, Users, Plane, Loader2,
  FileDown, Search, Receipt, CheckCircle2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useTripsStore } from "@/store/tripsStore";
import { listJamaah, type Jamaah } from "@/features/trips/tripsRepo";
import { listOrders, type Order } from "@/features/orders/ordersRepo";
import { listClients, type Client } from "@/features/clients/clientsRepo";
import { generateInvoicePdfRemote } from "@/lib/exportPdfApi";
import { nextInvoiceNumber, todayString } from "@/lib/invoiceGenerator";
import { useInvoiceStore } from "@/store/invoiceStore";
import { loadIghAdminSettings } from "@/lib/ighSettings";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const fmtIDR = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);

const ORDER_TYPE_LABEL: Record<string, string> = {
  flight: "Tiket Pesawat",
  umrah: "Umrah & Haji",
  visa_voa: "Visa VOA",
  visa_student: "Visa Pelajar",
};

const STATUS_COLOR: Record<string, string> = {
  Confirmed: "bg-emerald-100 text-emerald-700",
  Paid: "bg-blue-100 text-blue-700",
  Completed: "bg-purple-100 text-purple-700",
  Draft: "bg-gray-100 text-gray-600",
  Cancelled: "bg-red-100 text-red-600",
};

export default function ExportCenter() {
  // ── Trip manifest state ──────────────────────────────────────────────────────
  const trips = useTripsStore((s) => s.trips);
  const fetchTrips = useTripsStore((s) => s.fetchTrips);
  const [tripId, setTripId] = useState<string>("");
  const [jamaah, setJamaah] = useState<Jamaah[]>([]);
  const [loadingJamaah, setLoadingJamaah] = useState(false);
  const [exporting, setExporting] = useState<"rooming" | "manifest" | null>(null);

  // ── Invoice state ────────────────────────────────────────────────────────────
  const [orders, setOrders] = useState<Order[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [orderSearch, setOrderSearch] = useState<string>("");
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const { templateDataUrl, setLastInvoice } = useInvoiceStore();

  useEffect(() => { fetchTrips(); }, [fetchTrips]);

  useEffect(() => {
    if (!tripId) { setJamaah([]); return; }
    setLoadingJamaah(true);
    listJamaah(tripId)
      .then(setJamaah)
      .catch(() => toast.error("Gagal memuat data jamaah."))
      .finally(() => setLoadingJamaah(false));
  }, [tripId]);

  useEffect(() => {
    setLoadingOrders(true);
    Promise.all([listOrders(), listClients()])
      .then(([ords, cls]) => { setOrders(ords); setClients(cls); })
      .catch(() => toast.error("Gagal memuat data order."))
      .finally(() => setLoadingOrders(false));
  }, []);

  const clientMap = useMemo(() => {
    const m: Record<string, Client> = {};
    clients.forEach((c) => { m[c.id] = c; });
    return m;
  }, [clients]);

  const filteredOrders = useMemo(() => {
    const q = orderSearch.toLowerCase().trim();
    if (!q) return orders;
    return orders.filter((o) => {
      const client = o.clientId ? clientMap[o.clientId] : null;
      return (
        (o.title ?? "").toLowerCase().includes(q) ||
        (client?.name ?? "").toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        (ORDER_TYPE_LABEL[o.type] ?? "").toLowerCase().includes(q)
      );
    });
  }, [orders, orderSearch, clientMap]);

  const selectedOrder = useMemo(() =>
    orders.find((o) => o.id === selectedOrderId) ?? null,
    [orders, selectedOrderId]
  );
  const selectedClient = useMemo(() =>
    selectedOrder?.clientId ? (clientMap[selectedOrder.clientId] ?? null) : null,
    [selectedOrder, clientMap]
  );

  const trip = useMemo(() => trips.find((t) => t.id === tripId), [trips, tripId]);
  const safeName = (s: string) => s.replace(/[^a-zA-Z0-9-_]+/g, "_").slice(0, 40);
  const needReviewCount = jamaah.filter((j) => j.needsReview).length;

  // ── Export handlers ──────────────────────────────────────────────────────────
  const exportRoomingList = () => {
    if (!trip || jamaah.length === 0) return;
    setExporting("rooming");
    try {
      const rows = [...jamaah].sort((a, b) => {
        if (a.gender !== b.gender) return (a.gender || "Z").localeCompare(b.gender || "Z");
        return a.name.localeCompare(b.name);
      });
      let roomNo = 0;
      const data = rows.map((j, idx) => {
        if (idx % 2 === 0) roomNo++;
        return {
          No: idx + 1,
          "Kamar": `K-${String(roomNo).padStart(3, "0")}`,
          "Nama Jamaah": j.name,
          "Gender": j.gender === "L" ? "Laki-laki" : j.gender === "P" ? "Perempuan" : "-",
          "No. Paspor": j.passportNumber || "-",
          "No. HP": j.phone || "-",
          "Tgl Lahir": j.birthDate || "-",
        };
      });
      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [{ wch: 4 }, { wch: 8 }, { wch: 30 }, { wch: 11 }, { wch: 14 }, { wch: 16 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Rooming List");
      XLSX.writeFile(wb, `RoomingList_${safeName(trip.name)}.xlsx`);
      toast.success("Rooming list berhasil di-export.");
    } catch {
      toast.error("Export gagal.");
    } finally {
      setExporting(null);
    }
  };

  const exportFlightManifest = () => {
    if (!trip || jamaah.length === 0) return;
    setExporting("manifest");
    try {
      const data = jamaah.map((j, idx) => ({
        No: idx + 1,
        "Nama Lengkap (sesuai paspor)": j.name,
        "Gender": j.gender === "L" ? "M" : j.gender === "P" ? "F" : "-",
        "Tgl Lahir": j.birthDate || "-",
        "No. Paspor": j.passportNumber || "-",
        "No. HP": j.phone || "-",
        "Status Review": j.needsReview ? "PERLU REVIEW" : "OK",
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [{ wch: 4 }, { wch: 32 }, { wch: 8 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Flight Manifest");
      XLSX.writeFile(wb, `FlightManifest_${safeName(trip.name)}.xlsx`);
      toast.success("Flight manifest berhasil di-export.");
    } catch {
      toast.error("Export gagal.");
    } finally {
      setExporting(null);
    }
  };

  const handleGenerateInvoice = async () => {
    if (!selectedOrder) return;
    setGeneratingInvoice(true);
    try {
      const settings = loadIghAdminSettings();
      const invoiceNumber = nextInvoiceNumber();
      const invoiceDate = todayString();

      const pdfBytes = await generateInvoicePdfRemote({
        invoiceNumber,
        invoiceDate,
        order: selectedOrder,
        client: selectedClient,
        agencyName: "Temantiket",
        agencyPhone: settings.adminWhatsapp,
        agencyInstagram: settings.adminInstagram,
        templateDataUrl,
      });

      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const fileName = `${invoiceNumber}_${(selectedClient?.name ?? selectedOrder.title ?? "invoice").replace(/\s+/g, "_")}.pdf`;

      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();

      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        setLastInvoice(dataUrl, `${invoiceNumber} · ${selectedClient?.name ?? selectedOrder.title ?? selectedOrder.id.slice(0, 8)}`);
        URL.revokeObjectURL(url);
      };
      reader.readAsDataURL(blob);

      toast.success(`Invoice ${invoiceNumber} berhasil dibuat`, {
        description: selectedClient?.name ? `Untuk ${selectedClient.name}` : undefined,
        duration: 4000,
      });
    } catch (err) {
      toast.error("Gagal membuat invoice", {
        description: err instanceof Error ? err.message : "Coba lagi.",
      });
    } finally {
      setGeneratingInvoice(false);
    }
  };

  return (
    <motion.div
      className="container mx-auto p-4 sm:p-6 max-w-4xl space-y-8"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileSpreadsheet className="h-6 w-6 text-primary" />
          Export Center
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Export invoice PDF, rooming list, dan flight manifest.
        </p>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 1 — INVOICE PDF
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-emerald-600" />
          <h2 className="text-base font-semibold">Invoice PDF</h2>
        </div>

        <Card>
          <CardContent className="pt-5 space-y-4">
            {/* Search orders */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-9 text-sm"
                placeholder="Cari order berdasarkan nama klien, judul, atau tipe…"
                value={orderSearch}
                onChange={(e) => { setOrderSearch(e.target.value); setSelectedOrderId(""); }}
              />
              {orderSearch && (
                <button
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => { setOrderSearch(""); setSelectedOrderId(""); }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Order list */}
            {loadingOrders ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Memuat order…</span>
              </div>
            ) : filteredOrders.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">
                {orderSearch ? "Tidak ada order yang cocok." : "Belum ada order."}
              </p>
            ) : (
              <div className="border rounded-xl overflow-hidden divide-y max-h-[320px] overflow-y-auto">
                {filteredOrders.map((order) => {
                  const client = order.clientId ? clientMap[order.clientId] : null;
                  const isSelected = order.id === selectedOrderId;
                  return (
                    <button
                      key={order.id}
                      onClick={() => setSelectedOrderId(isSelected ? "" : order.id)}
                      className={cn(
                        "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors",
                        isSelected
                          ? "bg-emerald-50 dark:bg-emerald-950/30"
                          : "hover:bg-muted/50"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px] font-semibold truncate">
                            {client?.name ?? order.title ?? order.id.slice(0, 12)}
                          </span>
                          <span className={cn(
                            "text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0",
                            STATUS_COLOR[order.status] ?? "bg-gray-100 text-gray-600"
                          )}>
                            {order.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-muted-foreground">
                            {ORDER_TYPE_LABEL[order.type] ?? order.type}
                          </span>
                          <span className="text-muted-foreground opacity-40">·</span>
                          <span className="text-[11px] font-medium text-foreground">
                            {order.currency === "EGP"
                              ? `EGP ${Number(order.totalPrice).toLocaleString("en")}`
                              : fmtIDR(Number(order.totalPrice))}
                          </span>
                        </div>
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Selected order summary + generate button */}
            {selectedOrder && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <p className="text-[13px] font-bold text-foreground">
                      {selectedClient?.name ?? selectedOrder.title ?? "—"}
                    </p>
                    {selectedClient?.phone && (
                      <p className="text-[11px] text-muted-foreground">{selectedClient.phone}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[13px] font-bold text-emerald-700">
                      {selectedOrder.currency === "EGP"
                        ? `EGP ${Number(selectedOrder.totalPrice).toLocaleString("en")}`
                        : fmtIDR(Number(selectedOrder.totalPrice))}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{ORDER_TYPE_LABEL[selectedOrder.type] ?? selectedOrder.type}</p>
                  </div>
                </div>
                <Button
                  onClick={handleGenerateInvoice}
                  disabled={generatingInvoice}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                  size="sm"
                >
                  {generatingInvoice ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <FileDown className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {generatingInvoice ? "Membuat invoice…" : "Generate Invoice PDF"}
                </Button>
              </motion.div>
            )}

            {!selectedOrder && !loadingOrders && filteredOrders.length > 0 && (
              <p className="text-center text-[11px] text-muted-foreground">
                Pilih satu order di atas untuk generate invoice-nya.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 2 — TRIP EXPORTS
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-blue-600" />
          <h2 className="text-base font-semibold">Manifest & Rooming List</h2>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pilih Trip</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={tripId} onValueChange={setTripId}>
              <SelectTrigger data-testid="select-trip">
                <SelectValue placeholder="Pilih trip…" />
              </SelectTrigger>
              <SelectContent>
                {trips.length === 0 ? (
                  <SelectItem value="__none" disabled>Belum ada trip.</SelectItem>
                ) : (
                  trips.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.emoji} {t.name} — {t.destination}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            {tripId && (
              <div className="rounded-lg bg-muted/40 p-3 text-sm flex items-center justify-between">
                {loadingJamaah ? (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Memuat jamaah…
                  </span>
                ) : (
                  <>
                    <span><strong>{jamaah.length}</strong> jamaah terdaftar</span>
                    {needReviewCount > 0 && (
                      <span className="text-amber-700 font-medium">
                        ⚠ {needReviewCount} perlu review
                      </span>
                    )}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-500" /> Rooming List
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Daftar pembagian kamar (2 jamaah/kamar), dipisah per gender.
              </p>
              <Button
                onClick={exportRoomingList}
                disabled={!tripId || jamaah.length === 0 || loadingJamaah || exporting !== null}
                className="w-full"
                data-testid="btn-export-rooming"
              >
                {exporting === "rooming" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Generate Excel
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Plane className="h-5 w-5 text-emerald-500" /> Flight Manifest
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Detail paspor & data penerbangan untuk maskapai/agen visa.
              </p>
              <Button
                onClick={exportFlightManifest}
                disabled={!tripId || jamaah.length === 0 || loadingJamaah || exporting !== null}
                className="w-full"
                data-testid="btn-export-manifest"
              >
                {exporting === "manifest" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Generate Excel
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </motion.div>
  );
}
