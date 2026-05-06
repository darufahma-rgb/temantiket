/**
 * openrouter.ts — Centralized AI client untuk Temantiket.
 *
 * Semua panggilan AI melewati server proxy (/api/ai/chat) supaya
 * OPENROUTER_API_KEY tetap aman di server, tidak terekspos ke browser.
 *
 * Gunakan helper functions di bawah untuk tiap use case — mereka sudah
 * dikonfigurasi dengan model, system prompt, dan parameter yang tepat.
 * Jangan memanggil callAI() dari aiFetch.ts secara langsung untuk
 * fitur-fitur yang sudah punya helper di sini.
 */

import { callAI, type CallAIOptions } from "@/lib/aiFetch";
import { useAIOverrideStore } from "@/store/aiOverrideStore";

// ── Model registry ──────────────────────────────────────────────────────────
// Satu tempat untuk semua model — ubah di sini kalau mau ganti model.

export const OR_MODELS = {
  /** Vision + OCR: poster, paspor, tiket screenshot. Murah & cepat. */
  VISION:     "google/gemini-2.0-flash",
  /** Caption marketing — manual maupun dari poster. */
  CAPTION:    "google/gemini-2.0-flash",
  /** Rapikan catatan, formatting teks ringan. */
  TEXT_FAST:  "google/gemini-2.0-flash",
  /** Structured JSON output: itinerary, data terstruktur. */
  STRUCTURED: "google/gemini-2.0-flash",
  /** Reasoning kompleks — hanya pakai kalau butuh kualitas tinggi. */
  REASONING:  "anthropic/claude-3-5-sonnet",
} as const;

export type ORModel = (typeof OR_MODELS)[keyof typeof OR_MODELS];

// ── Core wrapper ────────────────────────────────────────────────────────────

export interface CallAIOpenRouterOptions {
  prompt: string;
  systemPrompt?: string;
  model?: ORModel | string;
  temperature?: number;
  maxTokens?: number;
  /** true → minta JSON mode (response_format: json_object) */
  jsonMode?: boolean;
  /** Base64 data URL gambar untuk vision requests */
  imageBase64?: string;
  /** AbortSignal + timeout dari caller */
  fetchOptions?: CallAIOptions;
}

/**
 * extractErrorMessage — ambil pesan error yang bersih dari value apapun.
 * Handles: Error instance, plain string, object dengan .message, nested objects.
 */
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    if (typeof e.message === "string" && e.message) return e.message;
    if (typeof e.msg === "string" && e.msg) return e.msg;
    const nested = e.response as Record<string, unknown> | undefined;
    const nestedData = nested?.data as Record<string, unknown> | undefined;
    const nestedErr = nestedData?.error as Record<string, unknown> | undefined;
    if (typeof nestedErr?.message === "string" && nestedErr.message) return nestedErr.message;
    const jsonStr = (() => { try { return JSON.stringify(error).slice(0, 300); } catch { return ""; } })();
    if (jsonStr && jsonStr !== "{}") return jsonStr;
  }
  return "Terjadi kesalahan saat menghubungi AI. Silakan coba lagi.";
}

/**
 * callAIOpenRouter — wrapper utama.
 *
 * Mengembalikan teks langsung (bukan Response), sehingga caller tidak perlu
 * `.json()` dan mengekstrak `choices[0].message.content` sendiri.
 *
 * Throws jika server error, timeout, atau AI tidak mengembalikan konten.
 * Selalu melempar Error dengan pesan yang bersih dan bisa dibaca user.
 */
export async function callAIOpenRouter(opts: CallAIOpenRouterOptions): Promise<string> {
  const {
    prompt,
    systemPrompt,
    model = OR_MODELS.TEXT_FAST,
    temperature = 0.7,
    maxTokens = 1500,
    jsonMode = false,
    imageBase64,
    fetchOptions,
  } = opts;

  // Bangun messages array
  const messages: object[] = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  // User message: teks biasa atau multimodal (teks + gambar)
  if (imageBase64) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: imageBase64, detail: "auto" } },
      ],
    });
  } else {
    messages.push({ role: "user", content: prompt });
  }

  console.log(`[callAIOpenRouter] model="${model}" imageBase64=${!!imageBase64}`);

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  try {
    const res = await callAI(body, fetchOptions);
    const data = await res.json() as {
      choices?: { message?: { content?: string } }[];
      error?: unknown;
    };

    // Guard: API-level error dalam body (misal OpenRouter proxying error dari upstream)
    if (data.error) {
      throw new Error(extractErrorMessage(data.error));
    }

    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) throw new Error("AI tidak mengembalikan konten — coba lagi");
    return content;
  } catch (error: unknown) {
    // Selalu rethrow sebagai Error dengan pesan yang bersih
    throw new Error(extractErrorMessage(error));
  }
}

// ── Helper: Caption Generation ──────────────────────────────────────────────

/** System prompt brand Temantiket untuk caption marketing */
const CAPTION_SYSTEM_PROMPT = `Kamu adalah Senior Copywriter & Brand Guardian resmi Temantiket.

Temantiket adalah brand travel Umrah & Haji yang ramah, hangat, kekeluargaan, santai tapi terpercaya.
Brand name yang benar: "Temantiket" (bukan TemanTiket, bukan Teman Tiket).

ALUR WAJIB CAPTION (ikuti urutan ini persis — satu blok teks mengalir, BUKAN poin terpisah):
1. HOOK: Emoji + kalimat pembuka yang langsung bikin penasaran atau relate.
2. BENEFIT UTAMA: 1 kalimat yang menjelaskan nilai utama yang ditawarkan.
3. DETAIL KEUNTUNGAN: Gunakan ✅ untuk 2–3 keuntungan spesifik (masing-masing singkat, di baris baru).
4. CTA: "📲 Hubungi sekarang:" + nomor WA (jika ada), atau ajakan action yang jelas.
5. CLOSING BRAND: "Temantiket — mudah, cepat, amanah" + 1 emoji relevan.

ATURAN KETAT:
1. Buat tepat 1 caption saja — pilih sudut pandang terbaik yang paling menarik.
2. Target panjang 600–1000 karakter (termasuk emoji & spasi).
3. Gaya: mengalir natural, santai, meyakinkan — bukan daftar poin kaku atau terlalu salesy.
4. Nama "Temantiket" WAJIB ada di caption.
5. Emoji: 3–4 saja, pilih yang memperkuat emosi teks.
6. Hindari klaim berlebihan: "paling murah", "gratis", "terbatas!" secara hard-sell.

OUTPUT: Langsung tulis caption-nya saja — tanpa label, tanpa penjelasan tambahan.`;

/** System prompt untuk scan poster */
const POSTER_SYSTEM_PROMPT = `Kamu adalah Senior Copywriter & Brand Guardian resmi Temantiket.

Brand name yang benar: "Temantiket" (bukan TemanTiket, bukan Teman Tiket). Wajib ada di caption.

Tugas: Baca isi poster yang dikirim, ekstrak informasi utama (nama paket, harga, keunggulan, dsb), lalu buat 1 caption WhatsApp/Instagram.

ALUR WAJIB CAPTION (satu blok teks mengalir, BUKAN poin terpisah):
1. HOOK: Emoji + kalimat pembuka yang menarik atau pertanyaan yang bikin penasaran.
2. BENEFIT UTAMA: 1 kalimat yang merangkum nilai utama dari poster.
3. DETAIL: Gunakan ✅ untuk 2–3 keunggulan spesifik dari poster (masing-masing singkat, di baris baru).
4. CTA: "📲 Hubungi sekarang:" + nomor WA (jika diberikan), atau ajakan action yang jelas.
5. CLOSING: "Temantiket — mudah, cepat, amanah" + 1 emoji relevan.

ATURAN KETAT:
1. Buat tepat 1 caption saja — pilih sudut pandang terbaik berdasarkan isi poster.
2. Target panjang 600–1000 karakter (termasuk emoji & spasi).
3. Gaya: mengalir natural, santai, meyakinkan — bukan daftar kaku atau terlalu salesy.
4. Nama "Temantiket" WAJIB muncul di caption.
5. Emoji: 3–4 saja.

OUTPUT: Langsung tulis caption-nya saja — tanpa label, tanpa penjelasan tambahan.`;

const TONE_INSTRUCTIONS: Record<string, string> = {
  santai:    "Friendly, casual, akrab — seperti ngobrol sama teman",
  formal:    "Profesional, sopan, & terpercaya — cocok untuk korporat",
  hardsell:  "FOMO & urgency — buat pembaca merasa harus bertindak sekarang",
  story:     "Storytelling emosional — cerita perjalanan yang menyentuh hati",
};

/**
 * generateCaptionFromDetail — buat caption dari input manual (kategori + tone + detail paket).
 * Dipakai di MarketingKitGenerator mode "manual".
 */
export async function generateCaptionFromDetail(params: {
  categoryPrompt: string;
  tone: string;
  packageDetail?: string;
  waNumber?: string;
}): Promise<string> {
  const { categoryPrompt, tone, packageDetail, waNumber } = params;
  const toneInstruction = TONE_INSTRUCTIONS[tone] ?? tone;
  const detailSection = packageDetail?.trim()
    ? `\n\nDetail paket:\n${packageDetail.trim()}`
    : "";
  const waSection = waNumber?.trim()
    ? `\n\nNomor WA untuk CTA: wa.me/${waNumber.trim().replace(/\D/g, "")}`
    : "";

  const model = useAIOverrideStore.getState().getModel("caption", OR_MODELS.CAPTION);
  return callAIOpenRouter({
    model,
    systemPrompt: CAPTION_SYSTEM_PROMPT,
    prompt: `Buat 1 caption marketing untuk ${categoryPrompt}.\nTone yang diminta: ${toneInstruction}.${detailSection}${waSection}`,
    temperature: 0.85,
    maxTokens: 700,
  });
}

/**
 * generateCaptionFromPoster — scan gambar poster lalu buat caption marketing.
 * Dipakai di MarketingKitGenerator mode "poster".
 */
export async function generateCaptionFromPoster(params: {
  imageBase64: string;
  tone: string;
  waNumber?: string;
}): Promise<string> {
  const { imageBase64, tone, waNumber } = params;
  const toneInstruction = TONE_INSTRUCTIONS[tone] ?? tone;
  const waSection = waNumber?.trim()
    ? `\nNomor WA untuk baris CTA: wa.me/${waNumber.trim().replace(/\D/g, "")}`
    : "";

  const model = useAIOverrideStore.getState().getModel("caption", OR_MODELS.VISION);
  return callAIOpenRouter({
    model,
    systemPrompt: POSTER_SYSTEM_PROMPT,
    prompt: `Scan poster ini dan buat 1 caption sesuai struktur dan aturan di instruksi sistem.\nTone: ${toneInstruction}.${waSection}`,
    imageBase64,
    temperature: 0.8,
    maxTokens: 700,
    fetchOptions: { timeoutMs: 90_000 },
  });
}

/**
 * analyzePosterWithVision — ekstrak informasi dari gambar poster tanpa membuat caption.
 * Berguna untuk preview/debug isi poster sebelum generate caption.
 */
export async function analyzePosterWithVision(imageBase64: string): Promise<string> {
  return callAIOpenRouter({
    model: OR_MODELS.VISION,
    systemPrompt: "Kamu adalah asisten analisis konten visual untuk travel agency.",
    prompt: "Ekstrak semua informasi penting dari poster ini: nama paket, harga, keunggulan, tanggal, kontak, dan info lainnya. Sajikan dalam format poin-poin yang jelas.",
    imageBase64,
    temperature: 0.2,
    maxTokens: 800,
    fetchOptions: { timeoutMs: 60_000 },
  });
}

// ── Helper: Notes / Text Formatting ────────────────────────────────────────

const RAPIKAN_SYSTEM_PROMPT = `
Kamu adalah seorang editor profesional yang sangat ahli dalam merapikan dan menstrukturkan catatan mentah menjadi dokumen Markdown yang bersih, terorganisir, dan mudah dibaca.

Tugas utama kamu:
- Ubah catatan yang berantakan menjadi struktur Markdown yang rapi dan profesional.
- Gunakan heading yang jelas (## untuk judul utama, ### untuk sub topik).
- Kelompokkan poin-poin yang berkaitan ke dalam sub-bagian dengan heading.
- Gunakan bullet point (-) atau numbered list jika sesuai.
- Berikan spasi yang cukup antar paragraf dan antar section agar mudah dibaca.
- Perbaiki alur kalimat agar lebih mengalir, tapi jangan mengubah makna asli dari catatan.
- Gunakan **bold** untuk menekankan hal-hal penting.
- Hasil akhir harus dalam format Markdown yang benar dan rapi.

Aturan penting:
- Jangan pernah membuat ringkasan atau menghilangkan informasi penting.
- Jangan menambahkan informasi baru yang tidak ada di catatan asli.
- Hindari membuat paragraf yang terlalu panjang. Pecah menjadi beberapa bagian jika perlu.
- Hasilkan hanya konten Markdown-nya saja, tanpa penjelasan tambahan di luar.

Contoh struktur yang baik:
## Judul Utama

### Sub Topik 1
- Poin pertama
- Poin kedua

### Sub Topik 2
Penjelasan singkat...

Berikan output hanya dalam format Markdown yang rapi dan terstruktur.
`;

/**
 * cleanAndStructureNote — rapikan & format teks catatan mentah menjadi Markdown bersih.
 * Dipakai di fitur "Rapikan" di halaman Catatan.
 */
export async function cleanAndStructureNote(text: string): Promise<string> {
  const model = useAIOverrideStore.getState().getModel("notes", OR_MODELS.TEXT_FAST);
  return callAIOpenRouter({
    model,
    systemPrompt: RAPIKAN_SYSTEM_PROMPT,
    prompt: `Rapikan catatan berikut:\n\n${text.trim()}`,
    temperature: 0.35,
    maxTokens: 1500,
  });
}

// ── Helper: Structured Data Parsing ────────────────────────────────────────

/**
 * parseStructuredData — ekstrak data terstruktur (JSON) dari teks bebas.
 * Berguna untuk itinerary, daftar penerbangan, atau data lain yang butuh parsing.
 *
 * @param text   - Teks input mentah
 * @param schema - Deskripsi skema JSON yang diharapkan (ditulis sebagai string)
 */
export async function parseStructuredData(text: string, schema?: string): Promise<string> {
  const schemaSection = schema
    ? `\n\nReturn data dalam format JSON berikut:\n${schema}`
    : "\n\nReturn HANYA JSON yang valid — tanpa markdown fence, tanpa penjelasan.";

  return callAIOpenRouter({
    model: OR_MODELS.STRUCTURED,
    systemPrompt: "Kamu adalah data extractor presisi. Ekstrak data terstruktur dari teks input.",
    prompt: `Ekstrak data dari teks berikut:${schemaSection}\n\nTeks:\n${text.slice(0, 8000)}`,
    temperature: 0,
    maxTokens: 2500,
    jsonMode: true,
  });
}
