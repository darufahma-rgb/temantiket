import { create } from "zustand";
import { listTicketPrices, type TicketPrice } from "@/features/ticketPrices/ticketPricesRepo";

interface TicketPricesState {
  items: TicketPrice[];
  loading: boolean;
  /** True setelah fetch pertama berhasil. Selanjutnya fetch berjalan di background tanpa loading state. */
  loaded: boolean;
  /** Refresh harga tiket. Jika sudah loaded, berjalan di background tanpa mengubah loading state. */
  refresh: () => Promise<void>;
  /** Update item di store setelah mutasi (create/update/delete) tanpa re-fetch. */
  setItems: (updater: (prev: TicketPrice[]) => TicketPrice[]) => void;
}

export const useTicketPricesStore = create<TicketPricesState>((set, get) => ({
  items: [],
  loading: false,
  loaded: false,

  refresh: async () => {
    const { loaded } = get();
    if (!loaded) set({ loading: true });
    try {
      const data = await listTicketPrices(false);
      set({ items: data, loading: false, loaded: true });
    } catch (err) {
      console.error("[ticketPricesStore] refresh failed:", err);
      set((s) => ({ items: s.items, loading: false }));
    }
  },

  setItems: (updater) => set((s) => ({ items: updater(s.items) })),
}));
