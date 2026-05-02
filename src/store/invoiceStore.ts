/**
 * Zustand store for invoice state:
 * - Custom template image (persisted in localStorage as base64)
 * - Last generated invoice blob URL (for AI Command Center download)
 */
import { create } from "zustand";

const TEMPLATE_KEY = "temantiket.invoice.template.v1";

interface InvoiceState {
  /** Custom template image as data URL. null = use built-in template. */
  templateDataUrl: string | null;
  /** Last generated invoice as data URL (for AI download trigger). */
  lastInvoiceDataUrl: string | null;
  /** Human-readable label of last invoice (e.g. "INV-20260502-0001 · Ahmad Fauzi"). */
  lastInvoiceLabel: string | null;
  /** Load template from localStorage on init. */
  loadTemplate: () => void;
  /** Set and persist a new template. */
  setTemplate: (dataUrl: string) => void;
  /** Remove custom template. */
  clearTemplate: () => void;
  /** Store the last generated invoice for AI download. */
  setLastInvoice: (dataUrl: string, label: string) => void;
  /** Clear last invoice. */
  clearLastInvoice: () => void;
}

export const useInvoiceStore = create<InvoiceState>((set) => ({
  templateDataUrl: null,
  lastInvoiceDataUrl: null,
  lastInvoiceLabel: null,

  loadTemplate: () => {
    try {
      const raw = localStorage.getItem(TEMPLATE_KEY);
      set({ templateDataUrl: raw ?? null });
    } catch {
      set({ templateDataUrl: null });
    }
  },

  setTemplate: (dataUrl) => {
    try {
      localStorage.setItem(TEMPLATE_KEY, dataUrl);
    } catch {
      /* quota exceeded */
    }
    set({ templateDataUrl: dataUrl });
  },

  clearTemplate: () => {
    localStorage.removeItem(TEMPLATE_KEY);
    set({ templateDataUrl: null });
  },

  setLastInvoice: (dataUrl, label) => {
    set({ lastInvoiceDataUrl: dataUrl, lastInvoiceLabel: label });
  },

  clearLastInvoice: () => {
    set({ lastInvoiceDataUrl: null, lastInvoiceLabel: null });
  },
}));
