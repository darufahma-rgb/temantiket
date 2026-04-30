import { create } from "zustand";
import {
  listClients, createClient, updateClient, deleteClient, getClient,
  type Client, type ClientDraft,
} from "@/features/clients/clientsRepo";

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
      const data = await listClients();
      set({ clients: data, loadingClients: false });
    } catch (err) {
      console.error("[clientsStore] fetchClients failed:", err);
      set((s) => ({ clients: s.clients, loadingClients: false }));
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
