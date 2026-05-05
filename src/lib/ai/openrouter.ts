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
 * callAIOpenRouter — wrapper utama.
 *
 * Mengembalikan teks langsung (bukan Response), sehingga caller tidak perlu
 * `.json()` dan mengekstrak `choices[0].message.content` sendiri.
 *
 * Throws jika server error, timeout, atau AI tidak mengembalikan konten.
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

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const res = await callAI(body, fetchOptions);
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) throw new Error("AI tidak mengembalikan konten — coba lagi");
  return content;
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

  return callAIOpenRouter({
    model: OR_MODELS.CAPTION,
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

  return callAIOpenRouter({
    model: OR_MODELS.VISION,
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

const RAPIKAN_SYSTEM_PROMPT = `Kamu adalah Content Formatter profesional untuk Temantiket.

Tugas: Terima teks mentah dari user, lalu rapikan menjadi format Markdown yang bersih, terstruktur, dan langsung bisa di-paste ke WhatsApp atau dokumen internal tanpa perlu diedit lagi.

ATURAN FORMAT WAJIB:
1. Gunakan **teks** (bintang ganda) untuk heading seksi atau teks yang perlu ditebalkan/ditekankan.
2. Gunakan - (strip/dash) sebagai bullet untuk daftar tidak berurutan.
3. Gunakan angka (1. 2. 3.) untuk daftar yang berurutan, langkah-langkah, atau syarat.
4. Beri SATU baris kosong antar seksi atau antar paragraf agar tidak berdempetan.
5. Pertahankan 100% makna asli — jangan tambah atau kurangi informasi.
6. Perbaiki ejaan dan tata bahasa tanpa mengubah maksud.
7. Jika ada seksi yang bisa dikelompokkan (misal: syarat, biaya, alamat, layanan), beri heading **Judul Seksi** yang jelas.
8. Output HANYA berisi teks yang sudah dirapikan — jangan tambahkan kata pengantar, penutup, atau penjelasan apapun.

CONTOH OUTPUT YANG BENAR:
**Persyaratan Umum**
- Paspor aktif minimal 6 bulan
- Foto ukuran 4x6 (background putih)
- Akte kelahiran asli

**Biaya**
1. DP: Rp 5.000.000
2. Pelunasan: Rp 20.000.000

**Catatan**
Hubungi Temantiket untuk konfirmasi jadwal keberangkatan.`;

/**
 * cleanAndStructureNote — rapikan & format teks catatan mentah menjadi Markdown bersih.
 * Dipakai di fitur "Rapikan" di halaman Catatan.
 */
export async function cleanAndStructureNote(text: string): Promise<string> {
  return callAIOpenRouter({
    model: OR_MODELS.TEXT_FAST,
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
