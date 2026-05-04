import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { requireAgencyId, getCurrentAgencyId, useAuthStore } from "@/store/authStore";
import { makePersistedCache } from "@/lib/persistedCache";
import { withTimeout } from "@/lib/supabaseTimeout";
import { pullAgencySetting, pushAgencySetting } from "@/lib/settingsSync";

export type TicketCurrency = "IDR" | "EGP" | "USD" | "SAR";

export interface TicketPrice {
  id: string;
  agencyId: string;
  airline: string;
  airlineCode: string;
  fromCode: string;
  fromCity: string;
  toCode: string;
  toCity: string;
  departDate: string | null;       // YYYY-MM-DD or null
  basePrice: number;
  currency: TicketCurrency;
  validUntil: string | null;       // YYYY-MM-DD
  notes: string | null;
  isPublished: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  // Fase 19.2 — extended flight details
  flightNumber: string | null;     // e.g. "QR818"
  etd: string | null;              // "HH:MM" departure time
  eta: string | null;              // "HH:MM" arrival time
  terminal: string | null;         // e.g. "T3"
  transitCode: string | null;      // IATA transit airport
  transitCity: string | null;      // transit city name
  transitDuration: string | null;  // e.g. "2h 30m"
}

export type TicketPriceDraft = Omit<TicketPrice, "id" | "agencyId" | "createdAt" | "updatedAt">;

// ── Cache ────────────────────────────────────────────────────────────────────
const CACHE_KEY = "ticket_prices";
const cache = makePersistedCache<TicketPrice>(CACHE_KEY);
const _mem: { items?: TicketPrice[] } = {};

function loadCache(): TicketPrice[] {
  if (_mem.items === undefined) _mem.items = cache.read(getCurrentAgencyId()) as TicketPrice[];
  return _mem.items!.slice();
}
function saveCache(items: TicketPrice[]) {
  _mem.items = items.slice();
  cache.write(getCurrentAgencyId(), items);
}
export function resetTicketPricesCache() {
  _mem.items = undefined;
}

// ── Row mappers ──────────────────────────────────────────────────────────────
const fromRow = (r: Record<string, unknown>): TicketPrice => ({
  id:              String(r.id),
  agencyId:        String(r.agency_id),
  airline:         String(r.airline ?? ""),
  airlineCode:     String(r.airline_code ?? ""),
  fromCode:        String(r.from_code ?? ""),
  fromCity:        String(r.from_city ?? ""),
  toCode:          String(r.to_code ?? ""),
  toCity:          String(r.to_city ?? ""),
  departDate:      (r.depart_date as string) ?? null,
  basePrice:       Number(r.base_price ?? 0),
  currency:        (r.currency as TicketCurrency) ?? "IDR",
  validUntil:      (r.valid_until as string) ?? null,
  notes:           (r.notes as string) ?? null,
  isPublished:     r.is_published !== false,
  sortOrder:       Number(r.sort_order ?? 0),
  createdAt:       String(r.created_at ?? new Date().toISOString()),
  updatedAt:       String(r.updated_at ?? new Date().toISOString()),
  flightNumber:    (r.flight_number as string) ?? null,
  etd:             (r.etd as string) ?? null,
  eta:             (r.eta as string) ?? null,
  terminal:        (r.terminal as string) ?? null,
  transitCode:     (r.transit_code as string) ?? null,
  transitCity:     (r.transit_city as string) ?? null,
  transitDuration: (r.transit_duration as string) ?? null,
});

const toRow = (d: Partial<TicketPriceDraft>, agencyId?: string): Record<string, unknown> => ({
  ...(agencyId ? { agency_id: agencyId } : {}),
  ...(d.airline          !== undefined ? { airline:          d.airline }          : {}),
  ...(d.airlineCode      !== undefined ? { airline_code:     d.airlineCode }      : {}),
  ...(d.fromCode         !== undefined ? { from_code:        d.fromCode }         : {}),
  ...(d.fromCity         !== undefined ? { from_city:        d.fromCity }         : {}),
  ...(d.toCode           !== undefined ? { to_code:          d.toCode }           : {}),
  ...(d.toCity           !== undefined ? { to_city:          d.toCity }           : {}),
  ...(d.departDate       !== undefined ? { depart_date:      d.departDate }       : {}),
  ...(d.basePrice        !== undefined ? { base_price:       d.basePrice }        : {}),
  ...(d.currency         !== undefined ? { currency:         d.currency }         : {}),
  ...(d.validUntil       !== undefined ? { valid_until:      d.validUntil }       : {}),
  ...(d.notes            !== undefined ? { notes:            d.notes }            : {}),
  ...(d.isPublished      !== undefined ? { is_published:     d.isPublished }      : {}),
  ...(d.sortOrder        !== undefined ? { sort_order:       d.sortOrder }        : {}),
  ...(d.flightNumber     !== undefined ? { flight_number:    d.flightNumber }     : {}),
  ...(d.etd              !== undefined ? { etd:              d.etd }              : {}),
  ...(d.eta              !== undefined ? { eta:              d.eta }              : {}),
  ...(d.terminal         !== undefined ? { terminal:         d.terminal }         : {}),
  ...(d.transitCode      !== undefined ? { transit_code:     d.transitCode }      : {}),
  ...(d.transitCity      !== undefined ? { transit_city:     d.transitCity }      : {}),
  ...(d.transitDuration  !== undefined ? { transit_duration: d.transitDuration }  : {}),
});

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function listTicketPrices(publishedOnly = false): Promise<TicketPrice[]> {
  if (isSupabaseConfigured()) {
    try {
      let q = supabase!
        .from("ticket_prices")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (publishedOnly) q = q.eq("is_published", true);
      const { data, error } = await withTimeout(q, 10000);
      if (error) throw error;
      const items = (data ?? []).map(fromRow);
      saveCache(items);
      return items;
    } catch (err) {
      const cached = loadCache();
      console.warn("[ticket_prices] fetch gagal, pakai cache:", err);
      return publishedOnly ? cached.filter((t) => t.isPublished) : cached;
    }
  }
  const cached = loadCache();
  return publishedOnly ? cached.filter((t) => t.isPublished) : cached;
}

export async function createTicketPrice(draft: TicketPriceDraft): Promise<TicketPrice> {
  const me = useAuthStore.getState().user;
  if (isSupabaseConfigured()) {
    const agencyId = requireAgencyId();
    const { data, error } = await withTimeout(
      supabase!
        .from("ticket_prices")
        .insert({ ...toRow(draft, agencyId), created_by: me?.id ?? null })
        .select("*")
        .single(),
    );
    if (error) throw error;
    const item = fromRow(data);
    saveCache([item, ...loadCache()]);
    return item;
  }
  const now = new Date().toISOString();
  const item: TicketPrice = {
    ...draft,
    id: `tp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    agencyId: "local",
    createdAt: now,
    updatedAt: now,
  };
  saveCache([item, ...loadCache()]);
  return item;
}

export async function updateTicketPrice(id: string, patch: Partial<TicketPriceDraft>): Promise<TicketPrice> {
  if (isSupabaseConfigured()) {
    const { data, error } = await withTimeout(
      supabase!
        .from("ticket_prices")
        .update(toRow(patch))
        .eq("id", id)
        .select("*")
        .single(),
    );
    if (error) throw error;
    const item = fromRow(data);
    saveCache(loadCache().map((x) => (x.id === id ? item : x)));
    return item;
  }
  const all = loadCache();
  const idx = all.findIndex((x) => x.id === id);
  if (idx === -1) throw new Error("Ticket price not found");
  const updated: TicketPrice = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
  all[idx] = updated;
  saveCache(all);
  return updated;
}

export async function deleteTicketPrice(id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const { data, error } = await withTimeout(
      supabase!
        .from("ticket_prices")
        .delete()
        .eq("id", id)
        .select("id"),
    );
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Hapus gagal — mungkin RLS block DELETE.");
  }
  saveCache(loadCache().filter((x) => x.id !== id));
}

// ── Markup (localStorage + cloud sync) ───────────────────────────────────────
const MARKUP_KEY  = "ticket_prices.markup.v1";
const MARKUP_CLOUD_KEY = "ticket_markup";

export function loadMarkup(): number {
  try { return Number(localStorage.getItem(MARKUP_KEY) ?? "0") || 0; } catch { return 0; }
}

export function saveMarkup(val: number) {
  const safe = Math.max(0, Math.round(val));
  localStorage.setItem(MARKUP_KEY, String(safe));
  void pushAgencySetting(MARKUP_CLOUD_KEY, safe);
}

/** Pull markup dari Supabase → tulis ke localStorage. */
export async function pullMarkup(): Promise<number | null> {
  const remote = await pullAgencySetting<number>(MARKUP_CLOUD_KEY);
  if (remote === null || remote === undefined) return null;
  const safe = Math.max(0, Math.round(Number(remote) || 0));
  localStorage.setItem(MARKUP_KEY, String(safe));
  return safe;
}

// ── Price helpers ────────────────────────────────────────────────────────────
export function toIDR(basePrice: number, currency: TicketCurrency, rates: Record<string, number>): number {
  if (currency === "IDR") return basePrice;
  if (currency === "EGP") return Math.round(basePrice * (rates.EGP ?? 515));
  if (currency === "USD") return Math.round(basePrice * (rates.USD ?? 16000));
  if (currency === "SAR") return Math.round(basePrice * (rates.SAR ?? 4250));
  return basePrice;
}

export function sellingPrice(basePrice: number, currency: TicketCurrency, rates: Record<string, number>, markup: number): number {
  return toIDR(basePrice, currency, rates) + markup;
}

export function isExpired(validUntil: string | null): boolean {
  if (!validUntil) return false;
  const d = new Date(validUntil + "T23:59:59");
  return d < new Date();
}

export function fmtIDR(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "Fleksibel";
  try {
    return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso + "T00:00:00"));
  } catch { return iso; }
}

export const CURRENCY_LABEL: Record<TicketCurrency, string> = {
  IDR: "Rupiah (IDR)",
  EGP: "Egyptian Pound (EGP)",
  USD: "US Dollar (USD)",
  SAR: "Saudi Riyal (SAR)",
};
