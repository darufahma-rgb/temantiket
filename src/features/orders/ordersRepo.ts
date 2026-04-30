import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { requireAgencyId, getCurrentAgencyId } from "@/store/authStore";
import { makePersistedCache } from "@/lib/persistedCache";

/**
 * Order = entity universal yg ngebungkus berbagai jenis transaksi:
 *   - umrah         : paket umrah/haji (link ke trip/package + jamaah lama)
 *   - flight        : tiket pesawat
 *   - visa_voa      : visa on arrival
 *   - visa_student  : visa pelajar (mis. Visa Mesir)
 *
 * Untuk type='umrah', metadata bisa berisi snapshot ProfessionalQuote dari
 * kalkulator (breakdown, hpp, sellingPrice, dsb). total_price dipake sbg
 * angka yg ditampilkan di list/dashboard.
 */
export const ORDER_TYPES = ["umrah", "flight", "visa_voa", "visa_student"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_STATUSES = ["Draft", "Confirmed", "Paid", "Completed", "Cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface Order {
  id: string;
  clientId: string | null;
  type: OrderType;
  status: OrderStatus;
  title: string | null;
  totalPrice: number;
  /** Harga modal — apa yg agency bayar ke supplier. profit = totalPrice - costPrice */
  costPrice: number;
  currency: string;
  metadata: Record<string, unknown>;
  tripId: string | null;
  packageId: string | null;
  jamaahId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type OrderDraft = Omit<Order, "id" | "createdAt" | "updatedAt">;

const ORDERS_KEY = "orders";
const cache = makePersistedCache<Order>(ORDERS_KEY);

const _mem: { orders?: Order[] } = {};
function loadCache(): Order[] {
  if (_mem.orders === undefined) _mem.orders = cache.read(getCurrentAgencyId()) as Order[];
  return _mem.orders!.slice();
}
function saveCache(items: Order[]) {
  _mem.orders = items.slice();
  cache.write(getCurrentAgencyId(), items);
}

function coerceType(v: unknown): OrderType {
  return (ORDER_TYPES as readonly string[]).includes(v as string) ? (v as OrderType) : "umrah";
}
function coerceStatus(v: unknown): OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(v as string)
    ? (v as OrderStatus)
    : "Draft";
}

const fromRow = (r: Record<string, unknown>): Order => ({
  id: String(r.id),
  clientId: (r.client_id as string) ?? null,
  type: coerceType(r.type),
  status: coerceStatus(r.status),
  title: (r.title as string) ?? null,
  totalPrice: r.total_price == null ? 0 : Number(r.total_price),
  costPrice: r.cost_price == null ? 0 : Number(r.cost_price),
  currency: String(r.currency ?? "IDR"),
  metadata: (r.metadata as Record<string, unknown>) ?? {},
  tripId: (r.trip_id as string) ?? null,
  packageId: (r.package_id as string) ?? null,
  jamaahId: (r.jamaah_id as string) ?? null,
  notes: (r.notes as string) ?? null,
  createdAt: String(r.created_at ?? new Date().toISOString()),
  updatedAt: String(r.updated_at ?? r.created_at ?? new Date().toISOString()),
});

const toRow = (o: Partial<Order>, agencyId?: string) => ({
  ...(o.id ? { id: o.id } : {}),
  ...(o.clientId !== undefined ? { client_id: o.clientId } : {}),
  ...(o.type !== undefined ? { type: o.type } : {}),
  ...(o.status !== undefined ? { status: o.status } : {}),
  ...(o.title !== undefined ? { title: o.title } : {}),
  ...(o.totalPrice !== undefined ? { total_price: o.totalPrice } : {}),
  ...(o.costPrice !== undefined ? { cost_price: o.costPrice } : {}),
  ...(o.currency !== undefined ? { currency: o.currency } : {}),
  ...(o.metadata !== undefined ? { metadata: o.metadata } : {}),
  ...(o.tripId !== undefined ? { trip_id: o.tripId } : {}),
  ...(o.packageId !== undefined ? { package_id: o.packageId } : {}),
  ...(o.jamaahId !== undefined ? { jamaah_id: o.jamaahId } : {}),
  ...(o.notes !== undefined ? { notes: o.notes } : {}),
  ...(agencyId ? { agency_id: agencyId } : {}),
});

export async function listOrders(filter?: { type?: OrderType; clientId?: string }): Promise<Order[]> {
  if (isSupabaseConfigured()) {
    try {
      let q = supabase!.from("orders").select("*").order("created_at", { ascending: false });
      if (filter?.type) q = q.eq("type", filter.type);
      if (filter?.clientId) q = q.eq("client_id", filter.clientId);
      const { data, error } = await q;
      if (error) throw error;
      const items = (data ?? []).map(fromRow);
      // Update cache incrementally — kalau filter, cuma overwrite subset.
      if (!filter) saveCache(items);
      return items;
    } catch (err) {
      const cached = loadCache();
      console.warn(`[orders] list dari Supabase gagal, pakai cache lokal (${cached.length} item):`, err);
      let out = cached;
      if (filter?.type) out = out.filter((o) => o.type === filter.type);
      if (filter?.clientId) out = out.filter((o) => o.clientId === filter.clientId);
      return out;
    }
  }
  let out = loadCache();
  if (filter?.type) out = out.filter((o) => o.type === filter.type);
  if (filter?.clientId) out = out.filter((o) => o.clientId === filter.clientId);
  return out;
}

export async function getOrder(id: string): Promise<Order | null> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase!.from("orders").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? fromRow(data) : null;
  }
  return loadCache().find((o) => o.id === id) ?? null;
}

export async function createOrder(draft: OrderDraft): Promise<Order> {
  if (isSupabaseConfigured()) {
    const agencyId = requireAgencyId();
    const { data, error } = await supabase!
      .from("orders")
      .insert(toRow(draft, agencyId))
      .select("*")
      .single();
    if (error) throw error;
    const o = fromRow(data);
    saveCache([o, ...loadCache()]);
    return o;
  }
  const now = new Date().toISOString();
  const o: Order = {
    ...draft,
    id: `o-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: now,
    updatedAt: now,
  };
  saveCache([o, ...loadCache()]);
  return o;
}

export async function updateOrder(id: string, patch: Partial<Order>): Promise<Order> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase!
      .from("orders")
      .update(toRow(patch))
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    const o = fromRow(data);
    saveCache(loadCache().map((x) => (x.id === id ? o : x)));
    return o;
  }
  const all = loadCache();
  const idx = all.findIndex((o) => o.id === id);
  if (idx === -1) throw new Error("Order not found");
  const updated = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
  all[idx] = updated;
  saveCache(all);
  return updated;
}

export async function deleteOrder(id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase!
      .from("orders")
      .delete()
      .eq("id", id)
      .select("id");
    if (error) {
      console.error(`[orders] DELETE id=${id} gagal:`, error);
      throw error;
    }
    if (!data || data.length === 0) {
      throw new Error(
        `Hapus order gagal — server tidak menghapus baris (kemungkinan RLS DELETE policy nge-blok). Cek policy "orders_delete" di Supabase.`,
      );
    }
  }
  saveCache(loadCache().filter((o) => o.id !== id));
}

export function resetOrdersCache() {
  _mem.orders = undefined;
}

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  umrah: "Umrah & Haji",
  flight: "Tiket Pesawat",
  visa_voa: "Visa VOA",
  visa_student: "Visa Pelajar",
};

export const ORDER_TYPE_EMOJI: Record<OrderType, string> = {
  umrah: "🕋",
  flight: "✈️",
  visa_voa: "🛂",
  visa_student: "🎓",
};
