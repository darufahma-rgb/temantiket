import { create } from "zustand";

interface AIChatState {
  isOpen: boolean;
  pendingText: string | null;
  open: () => void;
  close: () => void;
  openWithText: (text: string) => void;
  clearPendingText: () => void;
}

export const useAIChatStore = create<AIChatState>((set) => ({
  isOpen: false,
  pendingText: null,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  openWithText: (text) => set({ isOpen: true, pendingText: text }),
  clearPendingText: () => set({ pendingText: null }),
}));
