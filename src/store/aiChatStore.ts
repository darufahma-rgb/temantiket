import { create } from "zustand";

export interface StoredChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface StoredUIMessage {
  msg: StoredChatMessage;
  toolResults?: Array<{ toolName: string; displayData: Record<string, unknown>; success: boolean }>;
}

interface AIChatState {
  isOpen: boolean;
  pendingText: string | null;
  history: StoredUIMessage[];
  apiMessages: StoredChatMessage[];
  open: () => void;
  close: () => void;
  openWithText: (text: string) => void;
  clearPendingText: () => void;
  addUserMessage: (msg: StoredChatMessage) => void;
  addAssistantMessage: (msg: StoredChatMessage, toolResults?: StoredUIMessage["toolResults"]) => void;
  resetConversation: () => void;
}

export const useAIChatStore = create<AIChatState>((set) => ({
  isOpen: false,
  pendingText: null,
  history: [],
  apiMessages: [],
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  openWithText: (text) => set({ isOpen: true, pendingText: text }),
  clearPendingText: () => set({ pendingText: null }),
  addUserMessage: (msg) => set((s) => ({
    history: [...s.history, { msg }],
    apiMessages: [...s.apiMessages, msg],
  })),
  addAssistantMessage: (msg, toolResults) => set((s) => ({
    history: [...s.history, { msg, toolResults }],
    apiMessages: [...s.apiMessages, msg],
  })),
  resetConversation: () => set({ history: [], apiMessages: [] }),
}));
