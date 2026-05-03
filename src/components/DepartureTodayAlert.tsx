import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plane, Home, ChevronRight, MessageCircle, Send } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { buildMemberSlug, buildPublicMemberUrl, normalizePhoneForWa } from "@/lib/memberSlug";
import type { Package } from "@/features/packages/packagesRepo";
import type { Order } from "@/features/orders/ordersRepo";
import type { Client } from "@/store/clientsStore";

// ── WhatsApp template builders ─────────────────────────────────────────────

export function buildDepartureWAText(opts: {
  clientName: string;
  packageName?: string | null;
  memberCardUrl: string;
}): string {
  const firstName = opts.clientName.trim().split(/\s+/)[0] || "Sahabat";
  const pkgLine = opts.packageName ? `*${opts.packageName}*` : "perjalanan ibadah kamu";
  return (
    `✈️ Selamat Berangkat, ${firstName}! 🙏\n\n` +
    `Alhamdulillah, hari ini kamu akan memulai ${pkgLine}.\n\n` +
    `Semoga perjalanannya lancar, selamat, dan mabrur! Kami mendoakan yang terbaik untukmu.\n\n` +
    `📋 Cek detail perjalanan & member card kamu di sini:\n` +
    `🔗 ${memberCardUrl}\n\n` +
    `Jangan ragu hubungi kami jika butuh bantuan. Selamat jalan! 🌟\n` +
    `— Temantiket`
  );
}

export function buildReturnWAText(opts: {
  clientName: string;
  packageName?: string | null;
  memberCardUrl: string;
}): string {
  const firstName = opts.clientName.trim().split(/\s+/)[0] || "Sahabat";
  return (
    `🏠 Selamat Datang Kembali, ${firstName}! 🎉\n\n` +
    `Alhamdulillah, kamu sudah kembali dengan selamat. Kami sangat senang mendengarnya!\n\n` +
    `Semoga ibadah kamu diterima dan menjadi pengalaman yang selalu dikenang. 🤲\n\n` +
    `📋 Lihat riwayat perjalananmu di Member Card Temantiket:\n` +
    `🔗 ${memberCardUrl}\n\n` +
    `Terima kasih sudah mempercayakan perjalananmu kepada kami. Sampai jumpa di trip berikutnya! 😊\n` +
    `— Temantiket`
  );
}

function buildWAUrl(phone: string | undefined | null, text: string): string {
  const recipient = normalizePhoneForWa(phone);
  const encoded = encodeURIComponent(text);
  return recipient
    ? `https://wa.me/${recipient}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}

// ── Types ──────────────────────────────────────────────────────────────────

interface DepartureItem {
  clientId: string;
  clientName: string;
  clientPhone: string;
  packageId: string;
  packageName: string;
  memberCardUrl: string;
  type: "departing" | "returning";
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildItems(
  packages: Package[],
  orders: Order[],
  clients: Client[],
  sortedClients: Client[],
): { departing: DepartureItem[]; returning: DepartureItem[] } {
  const today = toDateStr(new Date());
  const yesterday = toDateStr(new Date(Date.now() - 86400000));

  const clientMap = new Map(clients.map((c) => [c.id, c]));

  const getClientMemberIndex = (clientId: string) => {
    const idx = sortedClients.findIndex((c) => c.id === clientId);
    return idx >= 0 ? idx + 1 : 1;
  };

  const departing: DepartureItem[] = [];
  const returning: DepartureItem[] = [];

  for (const pkg of packages) {
    if (!pkg.id) continue;

    const isDepToday = pkg.departureDate === today;
    const isRetToday = pkg.returnDate === today || pkg.returnDate === yesterday;
    if (!isDepToday && !isRetToday) continue;

    const pkgOrders = orders.filter((o) => o.packageId === pkg.id && o.clientId);
    for (const order of pkgOrders) {
      const client = clientMap.get(order.clientId!);
      if (!client) continue;
      const memberIndex = getClientMemberIndex(client.id);
      const slug = buildMemberSlug(client.name, memberIndex);
      const memberCardUrl = buildPublicMemberUrl(slug);

      const item: DepartureItem = {
        clientId: client.id,
        clientName: client.name,
        clientPhone: client.phone,
        packageId: pkg.id,
        packageName: pkg.name || "—",
        memberCardUrl,
        type: isDepToday ? "departing" : "returning",
      };

      if (isDepToday) departing.push(item);
      else returning.push(item);
    }
  }

  // Deduplicate by clientId (client might have multiple orders in same package)
  const dedup = (arr: DepartureItem[]) =>
    arr.filter((v, i, a) => a.findIndex((x) => x.clientId === v.clientId && x.packageId === v.packageId) === i);

  return { departing: dedup(departing), returning: dedup(returning) };
}

// ── Sub-list ────────────────────────────────────────────────────────────────

function AlertRow({
  item,
  type,
  onNavigate,
}: {
  item: DepartureItem;
  type: "departing" | "returning";
  onNavigate: (clientId: string) => void;
}) {
  const waText =
    type === "departing"
      ? buildDepartureWAText({ clientName: item.clientName, packageName: item.packageName, memberCardUrl: item.memberCardUrl })
      : buildReturnWAText({ clientName: item.clientName, packageName: item.packageName, memberCardUrl: item.memberCardUrl });

  const waUrl = buildWAUrl(item.clientPhone, waText);

  return (
    <div className="flex items-center gap-2 rounded-xl bg-white border border-sky-100 p-2 hover:border-sky-300 hover:shadow-sm transition-all">
      <button
        type="button"
        onClick={() => onNavigate(item.clientId)}
        className="flex-1 min-w-0 flex items-center gap-2 text-left"
      >
        <div
          className={cn(
            "h-8 w-8 rounded-lg shrink-0 flex items-center justify-center text-base",
            type === "departing" ? "bg-sky-100" : "bg-emerald-100",
          )}
        >
          {type === "departing" ? "✈️" : "🏠"}
        </div>
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-foreground truncate">{item.clientName}</p>
          <p className="text-[10px] text-muted-foreground truncate">{item.packageName}</p>
        </div>
      </button>
      <a
        href={waUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={`Kirim pesan ${type === "departing" ? "keberangkatan" : "kepulangan"} ke ${item.clientName}`}
        className="shrink-0 h-7 px-2 rounded-lg bg-[#25D366] text-white flex items-center gap-1 text-[10.5px] font-semibold hover:bg-[#1ebe57] transition-colors"
      >
        <MessageCircle className="h-3 w-3" />
        <span className="hidden sm:inline">WA</span>
      </a>
      <button
        type="button"
        onClick={() => onNavigate(item.clientId)}
        className="shrink-0 h-7 w-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

interface DepartureTodayAlertProps {
  packages: Package[];
  orders: Order[];
  clients: Client[];
}

export function DepartureTodayAlert({ packages, orders, clients }: DepartureTodayAlertProps) {
  const navigate = useNavigate();
  const [depCollapsed, setDepCollapsed] = useState(false);
  const [retCollapsed, setRetCollapsed] = useState(false);

  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [clients],
  );

  const { departing, returning } = useMemo(
    () => buildItems(packages, orders, clients, sortedClients),
    [packages, orders, clients, sortedClients],
  );

  if (departing.length === 0 && returning.length === 0) return null;

  const handleNavigate = (clientId: string) => navigate(`/clients/${clientId}`);

  return (
    <motion.div
      className="mb-1.5 md:mb-5 space-y-1.5"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.12, ease: "easeOut" }}
    >
      {/* ── Departing ── */}
      {departing.length > 0 && (
        <div className="rounded-xl md:rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-blue-50 overflow-hidden">
          <button
            onClick={() => setDepCollapsed((c) => !c)}
            className="w-full px-3 py-2 flex items-center justify-between gap-2 hover:bg-sky-100/40 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-7 w-7 rounded-lg bg-sky-500 flex items-center justify-center shrink-0">
                <Send strokeWidth={2} className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="text-left min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h2 className="text-[12px] md:text-[14px] font-bold text-sky-700">
                    Berangkat Hari Ini ✈️
                  </h2>
                  <span className="h-4 px-1.5 rounded-full bg-sky-500 text-white text-[9.5px] font-bold flex items-center">
                    {departing.length}
                  </span>
                </div>
                <p className="text-[10px] text-sky-600/80 truncate">
                  Kirim pesan keberangkatan ke klien hari ini
                </p>
              </div>
            </div>
            <ChevronRight
              strokeWidth={2}
              className={cn("h-3.5 w-3.5 text-sky-500 shrink-0 transition-transform", !depCollapsed && "rotate-90")}
            />
          </button>
          {!depCollapsed && (
            <div className="px-2.5 pb-2.5 space-y-1.5">
              {departing.map((item) => (
                <AlertRow key={`${item.clientId}-${item.packageId}`} item={item} type="departing" onNavigate={handleNavigate} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Returning ── */}
      {returning.length > 0 && (
        <div className="rounded-xl md:rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 overflow-hidden">
          <button
            onClick={() => setRetCollapsed((c) => !c)}
            className="w-full px-3 py-2 flex items-center justify-between gap-2 hover:bg-emerald-100/40 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-7 w-7 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0">
                <Home strokeWidth={2} className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="text-left min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h2 className="text-[12px] md:text-[14px] font-bold text-emerald-700">
                    Baru Pulang 🏠
                  </h2>
                  <span className="h-4 px-1.5 rounded-full bg-emerald-500 text-white text-[9.5px] font-bold flex items-center">
                    {returning.length}
                  </span>
                </div>
                <p className="text-[10px] text-emerald-600/80 truncate">
                  Sambut klien yang baru kembali dari perjalanan
                </p>
              </div>
            </div>
            <ChevronRight
              strokeWidth={2}
              className={cn("h-3.5 w-3.5 text-emerald-500 shrink-0 transition-transform", !retCollapsed && "rotate-90")}
            />
          </button>
          {!retCollapsed && (
            <div className="px-2.5 pb-2.5 space-y-1.5">
              {returning.map((item) => (
                <AlertRow key={`${item.clientId}-${item.packageId}`} item={item} type="returning" onNavigate={handleNavigate} />
              ))}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
