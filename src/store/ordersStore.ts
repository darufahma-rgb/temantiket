import { create } from "zustand";
import {
  listOrders, createOrder, updateOrder, deleteOrder, getOrder,
  type Order, type OrderDraft, type OrderType,
} from "@/features/orders/ordersRepo";

interface OrdersState {
  orders: Order[];
  loadingOrders: boolean;
  fetchOrders: (filter?: { type?: OrderType; clientId?: string }) => Promise<void>;
  addOrder: (draft: OrderDraft) => Promise<Order>;
  patchOrder: (id: string, patch: Partial<Order>) => Promise<void>;
  removeOrder: (id: string) => Promise<void>;
  getOneOrder: (id: string) => Promise<Order | null>;
}

export const useOrdersStore = create<OrdersState>((set) => ({
  orders: [],
  loadingOrders: false,

  fetchOrders: async (filter) => {
    set({ loadingOrders: true });
    try {
      const data = await listOrders(filter);
      set({ orders: data, loadingOrders: false });
    } catch (err) {
      console.error("[ordersStore] fetchOrders failed:", err);
      set((s) => ({ orders: s.orders, loadingOrders: false }));
    }
  },

  addOrder: async (draft) => {
    const o = await createOrder(draft);
    set((s) => ({ orders: [o, ...s.orders] }));
    return o;
  },

  patchOrder: async (id, patch) => {
    const updated = await updateOrder(id, patch);
    set((s) => ({ orders: s.orders.map((o) => (o.id === id ? updated : o)) }));
  },

  removeOrder: async (id) => {
    await deleteOrder(id);
    set((s) => ({ orders: s.orders.filter((o) => o.id !== id) }));
  },

  getOneOrder: getOrder,
}));

export type { Order, OrderDraft, OrderType };
