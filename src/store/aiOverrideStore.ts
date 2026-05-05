/**
 * aiOverrideStore — per-feature AI model override.
 *
 * Persisted to localStorage sehingga pilihan user tetap tersimpan antar sesi.
 * Setiap feature punya override sendiri — ganti model di satu feature tidak
 * mempengaruhi feature lain.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Key unik per fitur yang mendukung model override. */
export type AIFeatureKey = "caption" | "notes";

/** Dua tier model yang tersedia untuk di-toggle user. */
export const AI_TIERS = {
  /** Default: cepat & hemat — Gemini Flash via OpenRouter. */
  FAST: "google/gemini-2.0-flash",
  /** Pro: kualitas tinggi — Claude 3.5 Sonnet via OpenRouter. */
  PRO:  "anthropic/claude-3-5-sonnet",
} as const;

export type AITier = (typeof AI_TIERS)[keyof typeof AI_TIERS];

export const AI_TIER_LABELS: Record<AITier, { short: string; long: string; badge: string }> = {
  [AI_TIERS.FAST]: {
    short: "Gemini Flash",
    long:  "Google Gemini 2.0 Flash — cepat & hemat",
    badge: "Cepat",
  },
  [AI_TIERS.PRO]: {
    short: "Claude Sonnet",
    long:  "Anthropic Claude 3.5 Sonnet — kualitas tinggi",
    badge: "Pro",
  },
};

interface AIOverrideState {
  overrides: Partial<Record<AIFeatureKey, AITier>>;
  /** Set override model untuk feature tertentu. Null → hapus override (kembali ke default). */
  setOverride: (feature: AIFeatureKey, model: AITier | null) => void;
  /** Toggle antara FAST ↔ PRO untuk feature tertentu. */
  toggleOverride: (feature: AIFeatureKey, defaultTier?: AITier) => void;
  /**
   * Kembalikan model yang aktif untuk feature ini.
   * Jika ada override, pakai itu; kalau tidak, pakai defaultModel.
   */
  getModel: (feature: AIFeatureKey, defaultModel: string) => string;
  /** Cek apakah feature ini sedang pakai mode Pro. */
  isPro: (feature: AIFeatureKey) => boolean;
}

export const useAIOverrideStore = create<AIOverrideState>()(
  persist(
    (set, get) => ({
      overrides: {},

      setOverride: (feature, model) =>
        set((s) => {
          const next = { ...s.overrides };
          if (model === null) {
            delete next[feature];
          } else {
            next[feature] = model;
          }
          return { overrides: next };
        }),

      toggleOverride: (feature, defaultTier = AI_TIERS.FAST) => {
        const current = get().overrides[feature] ?? defaultTier;
        const next = current === AI_TIERS.FAST ? AI_TIERS.PRO : AI_TIERS.FAST;
        set((s) => ({ overrides: { ...s.overrides, [feature]: next } }));
      },

      getModel: (feature, defaultModel) =>
        get().overrides[feature] ?? defaultModel,

      isPro: (feature) =>
        get().overrides[feature] === AI_TIERS.PRO,
    }),
    { name: "ai-override-v1" },
  ),
);
