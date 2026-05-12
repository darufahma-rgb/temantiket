import { create } from "zustand";
import {
  listClients, createClient, updateClient, deleteClient, getClient,
  type Client, type ClientDraft,
} from "@/features/clients/clientsRepo";
import { toast } from "sonner";

const FETCH_TIMEOUT = 25_000;
function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Waktu koneksi habis. Periksa jaringan Anda.")), FETCH_TIMEOUT),
    ),
  ]);
}

interface ClientsState {
  clients: Client[];
  loadingClients: boolean;
  fetchClients: () => Promise<void>;
  addClient: (draft: ClientDraft) => Promise<Client>;
  patchClient: (id: string, patch: Partial<Client>) => Promise<void>;
  removeClient: (id: string) => Promise<void>;
  getOneClient: (id: string) => Promise<Client | null>;
}

export const useClientsStore = create<ClientsState>((set) => ({
  clients: [],
  loadingClients: false,

  fetchClients: async () => {
    set({ loadingClients: true });
    try {
      const data = await withTimeout(listClients());
      set({ clients: data, loadingClients: false });
    } catch (err) {
      console.error("[clientsStore] fetchClients failed:", err);
      set((s) => ({ clients: s.clients, loadingClients: false }));
      const msg = err instanceof Error ? err.message : "Gagal memuat klien.";
      toast.error("Gagal memuat klien", { description: msg, duration: 4000, id: "clients-fetch-err" });
    }
  },

  addClient: async (draft) => {
    const c = await createClient(draft);
    set((s) => ({ clients: [c, ...s.clients] }));
    return c;
  },

  patchClient: async (id, patch) => {
    const updated = await updateClient(id, patch);
    set((s) => ({ clients: s.clients.map((c) => (c.id === id ? updated : c)) }));
  },

  removeClient: async (id) => {
    await deleteClient(id);
    set((s) => ({ clients: s.clients.filter((c) => c.id !== id) }));
  },

  getOneClient: getClient,
}));

export type { Client, ClientDraft };
