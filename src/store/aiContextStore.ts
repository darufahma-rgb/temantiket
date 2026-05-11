/**
 * aiContextStore — AITEM page context
 *
 * Pages write their active context here so AITEM can read it and answer
 * accurately without the user having to re-explain what they're looking at.
 *
 * Usage (in a page component):
 *   const { setPageContext, setActiveItem, setOnApplyEdit, clearContext } = useAIContextStore();
 *
 *   useEffect(() => {
 *     setPageContext({ pageId: "notes", pageTitle: "Catatan" });
 *     return () => clearContext();
 *   }, []);
 *
 *   useEffect(() => {
 *     if (expandedNote) {
 *       setActiveItem({ id, title, content, type: "note" });
 *       setOnApplyEdit((newContent) => { ... save ... });
 *     } else {
 *       setActiveItem(null); setOnApplyEdit(null);
 *     }
 *   }, [expandedNote]);
 */

import { create } from "zustand";

export interface AIActiveItem {
  id: string;
  title: string;
  content: string;
  type: "note" | "bc_template" | "order" | "client" | "itinerary" | "agent";
}

export interface AIPageInfo {
  pageId: string;
  pageTitle: string;
}

interface AIContextState {
  page: AIPageInfo | null;
  activeItem: AIActiveItem | null;
  onApplyEdit: ((newContent: string) => void) | null;
  pageData: Record<string, unknown> | null;

  setPageContext: (page: AIPageInfo) => void;
  setActiveItem: (item: AIActiveItem | null) => void;
  setOnApplyEdit: (fn: ((newContent: string) => void) | null) => void;
  setPageData: (data: Record<string, unknown> | null) => void;
  clearContext: () => void;
}

export const useAIContextStore = create<AIContextState>((set) => ({
  page: null,
  activeItem: null,
  onApplyEdit: null,
  pageData: null,

  setPageContext: (page) => set({ page }),
  setActiveItem: (activeItem) => set({ activeItem }),
  setOnApplyEdit: (onApplyEdit) => set({ onApplyEdit }),
  setPageData: (pageData) => set({ pageData }),
  clearContext: () => set({ page: null, activeItem: null, onApplyEdit: null, pageData: null }),
}));
