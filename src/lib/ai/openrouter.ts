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

// ── Token usage & cost ────────────────────────────────────────────────────────

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Estimated cost in USD */
  estimatedCostUsd: number;
  /** Actual model used (may differ from requested — OpenRouter normalises IDs) */
  resolvedModel: string;
}

/**
 * Approximate per-million-token pricing for models used in this app.
 * Source: OpenRouter model cards (as of May 2025). Input / Output in USD/M.
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "google/gemini-2.0-flash-001":            { input: 0.10,  output: 0.40  },
  "google/gemini-flash-1.5":                { input: 0.075, output: 0.30  },
  "google/gemini-2.5-pro":                  { input: 1.25,  output: 10.00 },
  "anthropic/claude-sonnet-4":              { input: 3.00,  output: 15.00 },
  "anthropic/claude-3-5-sonnet-20241022":   { input: 3.00,  output: 15.00 },
};
const DEFAULT_PRICING = { input: 0.50, output: 1.50 };

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  return (promptTokens * pricing.input + completionTokens * pricing.output) / 1_000_000;
}

// ── Model registry ──────────────────────────────────────────────────────────
// Satu tempat untuk semua model — ubah di sini kalau mau ganti model.

// ✓ All model IDs verified valid on OpenRouter as of 2025-05
// Note: anthropic/claude-* models require a paid Claude plan on OpenRouter.
// Using openai/gpt-4o-mini for all features — reliable, affordable, fast.
export const OR_MODELS = {
  /** Vision + OCR: poster, paspor, tiket screenshot. */
  VISION:          "openai/gpt-4o-mini",
  /** Caption marketing — manual maupun dari poster. */
  CAPTION:         "openai/gpt-4o-mini",
  /** Caption writer setelah OCR poster — GPT-4o Mini. */
  CAPTION_WRITER:  "openai/gpt-4o-mini",
  /** Rapikan catatan, formatting teks ringan. */
  TEXT_FAST:       "openai/gpt-4o-mini",
  /** Rapikan catatan. */
  NOTES_WRITER:    "openai/gpt-4o-mini",
  /** Structured JSON output: itinerary, data terstruktur. */
  STRUCTURED:      "openai/gpt-4o-mini",
  /** Reasoning. */
  REASONING:       "openai/gpt-4o-mini",
} as const;

/** Fallback model jika primary model gagal. */
const GEMINI_FALLBACK = "openai/gpt-4o-mini";

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
/** Internal full response type (includes usage for cost tracking). */
interface OpenRouterFullResult {
  content: string;
  usage: TokenUsage | null;
}

/** Returns true if the error message indicates an invalid/unknown model ID. */
function isInvalidModelError(msg: string): boolean {
  return (
    msg.includes("is not a valid model") ||
    msg.includes("model_not_found") ||
    msg.includes("No endpoints found") ||
    msg.includes("invalid model")
  );
}

async function callAIOpenRouterFull(opts: CallAIOpenRouterOptions): Promise<OpenRouterFullResult> {
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

  const messages: object[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });

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

  const modelsToTry: string[] = [model];
  // If primary is a Gemini model, automatically queue the fallback
  if (model !== GEMINI_FALLBACK && model.includes("gemini")) {
    modelsToTry.push(GEMINI_FALLBACK);
  }

  let lastError = "";
  for (let i = 0; i < modelsToTry.length; i++) {
    const tryModel = modelsToTry[i];
    const isFallback = i > 0;
    console.log(
      `[callAIOpenRouter] ${isFallback ? "⬇ FALLBACK → " : "→ "}model="${tryModel}" imageBase64=${!!imageBase64}`
    );

    const body: Record<string, unknown> = {
      model: tryModel,
      messages,
      temperature,
      max_tokens: maxTokens,
    };
    if (jsonMode) body.response_format = { type: "json_object" };

    try {
      const res = await callAI(body, fetchOptions);
      const data = await res.json() as {
        model?: string;
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        error?: unknown;
      };

      if (data.error) {
        const errMsg = extractErrorMessage(data.error);
        console.error(`[callAIOpenRouter] Provider error for model "${tryModel}": ${errMsg}`);
        if (isInvalidModelError(errMsg) && i < modelsToTry.length - 1) {
          console.warn(`[callAIOpenRouter] Model "${tryModel}" tidak valid — aktivasi fallback ke "${modelsToTry[i + 1]}"`);
          lastError = errMsg;
          continue;
        }
        throw new Error(errMsg);
      }

      const content = data.choices?.[0]?.message?.content?.trim() ?? "";
      if (!content) throw new Error("AI tidak mengembalikan konten — coba lagi");

      console.log(`[callAIOpenRouter] ✓ Success — model="${data.model ?? tryModel}"`);

      // Parse usage if available
      let usage: TokenUsage | null = null;
      if (data.usage) {
        const promptTokens     = data.usage.prompt_tokens     ?? 0;
        const completionTokens = data.usage.completion_tokens ?? 0;
        const totalTokens      = data.usage.total_tokens      ?? promptTokens + completionTokens;
        const resolvedModel    = data.model ?? tryModel;
        usage = {
          promptTokens,
          completionTokens,
          totalTokens,
          estimatedCostUsd: estimateCost(resolvedModel, promptTokens, completionTokens),
          resolvedModel,
        };
      }

      return { content, usage };
    } catch (error: unknown) {
      const errMsg = extractErrorMessage(error);
      console.error(`[callAIOpenRouter] Exception for model "${tryModel}": ${errMsg}`);
      if (isInvalidModelError(errMsg) && i < modelsToTry.length - 1) {
        console.warn(`[callAIOpenRouter] Model "${tryModel}" tidak valid — aktivasi fallback ke "${modelsToTry[i + 1]}"`);
        lastError = errMsg;
        continue;
      }
      throw new Error(errMsg);
    }
  }

  throw new Error(lastError || "Semua model AI gagal — coba lagi beberapa saat");
}

export async function callAIOpenRouter(opts: CallAIOpenRouterOptions): Promise<string> {
  const { content } = await callAIOpenRouterFull(opts);
  return content;
}

/** Caption generation result — includes token usage for cost indicator. */
export interface CaptionResult {
  caption: string;
  usage: TokenUsage | null;
}

// ── Helper: Caption Generation ──────────────────────────────────────────────

/** System prompt brand Temantiket untuk caption marketing */
const CAPTION_SYSTEM_PROMPT = `Kamu adalah copywriter legendaris kelas dunia — gabungan keahlian David Ogilvy, Gary Halbert, dan Joseph Sugarman — yang sepenuhnya berdedikasi untuk Temantiket.

━━━ IDENTITAS BRAND ━━━
Temantiket adalah travel agency Indonesia spesialis layanan perjalanan ke Timur Tengah & Mesir:
- Paket Umrah & Haji (grup dan individu)
- Visa Pelajar Mesir & Visa on Arrival Mesir untuk komunitas Masisir
- Tiket pesawat Indonesia–Mesir untuk mahasiswa (Masisir) dan wisatawan
- Jasa IMEI & pendampingan kepulangan dari Mesir ke Indonesia
Brand name selalu: "Temantiket" (bukan TemanTiket, bukan Teman Tiket, tanpa spasi).
Tagline: "mudah, cepat, amanah"

━━━ PSIKOLOGI TARGET PEMBACA ━━━
Temantiket melayani dua segmen utama:
1. Calon jamaah Umrah/Haji — memendam impian ibadah, cemas soal biaya & keamanan, termotivasi rindu Baitullah dan tanggung jawab keluarga
2. Komunitas Masisir (mahasiswa Indonesia di Mesir) — butuh kepastian visa, tiket terjangkau, dan layanan administratif yang cepat dan amanah
Kedua segmen alergi terhadap: janji berlebihan, kata "GRATIS!", tekanan berlebihan, info yang tidak jelas

━━━ PRINSIP COPYWRITING KELAS DUNIA ━━━
1. SPESIFIK MENGALAHKAN UMUM — "Hotel 200m dari Masjidil Haram" jauh lebih kuat dari "hotel dekat masjid"
2. PEMBACA ADALAH HERO — bukan Temantiket yang hebat, tapi pembaca yang akan merasakan pengalaman luar biasa
3. SATU IDE BESAR — tiap caption hanya punya satu sudut pandang utama yang dieksekusi dalam-dalam
4. EMOSI DULU, LOGIKA KEMUDIAN — sentuh hati dulu, baru berikan fakta dan alasan
5. TUNJUKKAN, JANGAN CERITAKAN — "Bayangkan kamu berdiri di depan Ka'bah" > "perjalanan yang mengesankan"
6. OPEN LOOP — buka rasa penasaran di awal, jangan selesaikan sepenuhnya sampai CTA

━━━ STRUKTUR CAPTION YANG TERBUKTI MENGKONVERSI ━━━
HOOK (1–2 kalimat): Buka dengan pertanyaan tajam, pernyataan mengejutkan, atau skenario yang langsung relate. Jangan mulai dengan nama brand.
↓
BRIDGE (1 kalimat): Sambungkan emosi pembaca ke solusi yang kamu tawarkan.
↓
PROOF + VALUE (2–3 poin): Fakta spesifik yang membangun kepercayaan. Bisa angka, testimoni implisit, atau detail fasilitas.
↓
CTA (1–2 kalimat): Satu aksi yang jelas, mudah, tidak mengancam. Jika ada nomor WA, sertakan.
↓
BRAND CLOSE: "Temantiket — mudah, cepat, amanah" + 1 emoji yang relevan.

━━━ ATURAN FORMAT (WAJIB) ━━━
- Gunakan *teks* untuk bold: nama paket, angka harga, poin kunci yang harus diperhatikan
- Gunakan _teks_ untuk italic: penekanan emosional, kata kunci ibadah
- Gunakan - atau 1. 2. 3. untuk daftar keunggulan (jika ada)
- Panjang ideal: 600–900 karakter
- Emoji: maksimal 4, pilih yang memperkuat emosi — jangan dekoratif
- DILARANG: "paling murah", "GRATIS!", "BURUAN!", tanda seru berlebihan, klaim tanpa dasar
- DILARANG: mulai dengan "Halo" atau nama brand di kalimat pertama

━━━ TEKNIK KHUSUS PER TONE (lihat instruksi tone dari user) ━━━
Tone akan diberikan terpisah — ikuti dengan presisi, jangan diabaikan.

OUTPUT: Tulis caption-nya langsung — tanpa label "HOOK:", "CTA:", tanpa penjelasan, tanpa komentar. Hanya caption siap pakai.`;

/** System prompt untuk OCR poster — hanya ekstrak fakta, TIDAK menulis caption */
const POSTER_OCR_SYSTEM_PROMPT = `Kamu adalah asisten ekstraksi konten visual yang presisi.

Tugas: Baca poster ini dan ekstrak SEMUA informasi yang terlihat secara faktual dan terstruktur.

Ekstrak:
- Nama paket / produk
- Harga (lengkap: angka, diskon, cicilan jika ada)
- Fasilitas / keunggulan / apa saja yang termasuk (inklusif)
- Tanggal keberangkatan atau periode promo
- Nama agen / brand yang ada di poster
- Nomor kontak (telepon / WA) yang tercetak di poster
- Slogan, kata kunci, atau tagline yang ada di poster
- Informasi lain yang relevan

ATURAN:
- Sajikan sebagai teks terstruktur menggunakan bullet point.
- Hanya fakta dari poster — jangan ditambah opini, jangan ditulis ulang jadi marketing copy.
- Kalau ada informasi yang tidak terlihat jelas, tandai dengan "(tidak terbaca)".

OUTPUT: Langsung tulis hasil ekstraksinya saja — tanpa kata pengantar, tanpa penjelasan.`;

/** System prompt untuk Claude menulis caption dari hasil OCR poster */
const POSTER_CAPTION_SYSTEM_PROMPT = `Kamu adalah copywriter legendaris kelas dunia — gabungan keahlian David Ogilvy, Gary Halbert, dan Joseph Sugarman — yang sepenuhnya berdedikasi untuk Temantiket.

━━━ KONTEKS ━━━
Kamu menerima informasi yang diekstrak dari poster travel. Tugasmu: ubah data mentah itu menjadi caption WhatsApp/Instagram yang membakar semangat dan mendorong orang untuk segera menghubungi Temantiket.

━━━ IDENTITAS BRAND ━━━
Temantiket: travel Umrah & Haji — ramah, hangat, kekeluargaan, amanah.
Brand name selalu: "Temantiket" — wajib muncul di caption.
Tagline: "mudah, cepat, amanah"

━━━ PSIKOLOGI TARGET PEMBACA ━━━
Calon jamaah Indonesia yang memendam impian Umrah/Haji — ini ibadah seumur hidup, bukan sekadar liburan.
Motivasi: rindu Baitullah, ingin berangkat bersama keluarga, memenuhi janji kepada orang tua.
Ketakutan: biaya besar, agen tidak amanah, informasi yang membingungkan.
Kunci persuasi: detail spesifik, kekeluargaan, rasa aman, bukti nyata.

━━━ PRINSIP COPYWRITING KELAS DUNIA ━━━
1. Gunakan detail spesifik dari poster — angka nyata, nama paket, fasilitas konkret
2. Pembaca adalah hero — mereka yang akan merasakan pengalaman luar biasa itu
3. Emosi dulu (rindu, harapan, ketenangan) — baru logika (harga, fasilitas, jadwal)
4. Satu sudut pandang yang dieksekusi dalam-dalam, bukan banyak poin lemah
5. Tunjukkan pengalaman, jangan sekadar list fitur: "Bayangkan..." bukan "Termasuk..."

━━━ STRUKTUR ━━━
HOOK: Kalimat pembuka yang langsung menyentuh — pertanyaan, skenario, atau fakta dari poster
BRIDGE: Sambungkan emosi ke solusi yang poster tawarkan
VALUE: 2–3 poin spesifik dari poster (gunakan - untuk list, atau tulis mengalir)
CTA: Ajakan jelas + nomor WA jika tersedia
CLOSE: "Temantiket — mudah, cepat, amanah" + emoji relevan

━━━ FORMAT WAJIB ━━━
- *teks* = bold untuk nama paket, harga, poin kunci
- _teks_ = italic untuk penekanan emosional
- Panjang: 600–900 karakter
- Emoji: maksimal 4, hanya yang memperkuat emosi
- DILARANG: klaim kosong, tanda seru berlebihan, "GRATIS!", "BURUAN!", mulai dengan "Halo"

OUTPUT: Tulis caption siap pakai langsung — tanpa label, tanpa penjelasan.`;

const TONE_INSTRUCTIONS: Record<string, string> = {
  santai: `
TONE: SANTAI — seperti rekomendasi dari teman yang baru pulang Umrah.
Teknik wajib:
- Bahasa sehari-hari Indonesia yang akrab: "bro/sis", "gak perlu ribet", "percaya deh", "beneran worth it"
- Sapaan hangat tapi langsung ke poin — tidak formal, tidak kaku
- Ceritakan manfaat seolah kamu sendiri yang merasakannya ("bayangin lo udah di depan Ka'bah...")
- Akhiri dengan ajakan santai yang tidak mengancam ("yuk tanya-tanya dulu, gratis konsultasinya!")
- Nada: teman yang peduli, bukan sales yang mengejar target`,

  formal: `
TONE: FORMAL — kepercayaan dan profesionalisme yang meyakinkan.
Teknik wajib:
- Bahasa Indonesia baku yang elegan, tidak kaku birokrasi
- Bangun otoritas dengan detail: pengalaman, jumlah jamaah, rekam jejak
- Gunakan social proof implisit: "ribuan jamaah telah mempercayakan perjalanan ibadah mereka"
- Setiap klaim didukung fakta spesifik — tidak ada janji kosong
- Nada: konsultan terpercaya, bukan penjual. Pembaca merasa dibimbing, bukan dibujuk`,

  hardsell: `
TONE: HARD SELLING — urgency dan FOMO yang mendorong aksi segera.
Teknik wajib:
- Buka dengan loss aversion: apa yang mereka RUGI jika tidak bertindak sekarang
- Scarcity nyata: "kuota tersisa", "harga naik setelah tanggal X", "slot terbatas"
- Gunakan angka spesifik: "hanya 12 seat tersisa", "harga naik Rp 2 juta bulan depan"
- Bukti sosial: "sudah X orang mendaftar minggu ini"
- CTA yang kuat dan berulang: CTA di tengah dan di akhir caption
- Nada: energetik, mendesak — tapi tetap berbasis fakta, jangan bohong`,

  story: `
TONE: STORYTELLING — narasi emosional yang menghidupkan pengalaman Umrah/Haji.
Teknik wajib:
- Mulai IN MEDIAS RES: langsung di tengah momen paling emosional ("Saat tangannya menyentuh kiswah Ka'bah untuk pertama kali...")
- Gunakan sensory detail: suara adzan, aroma kurma, cahaya fajar di Masjidil Haram
- Tampilkan transformasi: sebelum (keragu-raguan, kekhawatiran) → sesudah (kedamaian, rasa syukur)
- Pembaca = protagonis cerita, bukan tokoh lain
- Resolusi yang menghubungkan kisah ke tindakan nyata bersama Temantiket
- Nada: hangat, sinematik, menyentuh — buat mereka merasakan sebelum mereka berangkat`,

  penasaran: `
TONE: PENASARAN — buka rasa ingin tahu, tahan informasi kunci, paksa mereka bertanya lebih.
Teknik wajib:
- Open loop di kalimat pertama: pertanyaan yang tidak bisa diabaikan, atau fakta yang mengejutkan
- Tahan "jawaban" sampai sepertiga akhir caption — biarkan mereka membaca sampai habis
- Gunakan teknik "pattern interrupt": mulai dengan sesuatu yang tidak terduga untuk kategori travel
- Cliffhanger sebelum CTA: "...tapi ada satu hal yang belum banyak orang tahu soal ini."
- CTA berbasis rasa ingin tahu: "Tanya langsung ke kami — jawabannya akan mengejutkanmu"
- Nada: misterius, intriguing, tapi tetap amanah — jangan clickbait murahan`,
};

/**
 * generateCaptionFromDetail — buat caption dari input manual (kategori + tone + detail paket).
 * Dipakai di MarketingKitGenerator mode "manual".
 * @deprecated Gunakan generateCaptionFromContext untuk UI baru berbasis free-text context.
 */
export async function generateCaptionFromDetail(params: {
  categoryPrompt: string;
  categoryContext?: string;
  tone: string;
  packageDetail?: string;
  waNumber?: string;
}): Promise<CaptionResult> {
  const { categoryPrompt, categoryContext, tone, packageDetail, waNumber } = params;
  const toneInstruction = TONE_INSTRUCTIONS[tone] ?? tone;
  const contextSection = categoryContext?.trim()
    ? `\n\nKonteks kategori:\n${categoryContext.trim()}`
    : "";
  const detailSection = packageDetail?.trim()
    ? `\n\nDetail paket/produk:\n${packageDetail.trim()}`
    : "";
  const waSection = waNumber?.trim()
    ? `\n\nNomor WA untuk CTA: wa.me/${waNumber.trim().replace(/\D/g, "")}`
    : "";

  const model = useAIOverrideStore.getState().getModel("caption", OR_MODELS.CAPTION);
  const { content, usage } = await callAIOpenRouterFull({
    model,
    systemPrompt: CAPTION_SYSTEM_PROMPT,
    prompt: `Buat 1 caption marketing untuk ${categoryPrompt}.${contextSection}\nTone yang diminta: ${toneInstruction}.${detailSection}${waSection}`,
    temperature: 0.85,
    maxTokens: 1500,
  });
  return { caption: content, usage };
}

/**
 * generateCaptionFromContext — buat caption dari free-text context bisnis (UI baru).
 * User mendeskripsikan kebutuhan secara natural, AI memahami konteks dan membuat caption.
 */
export async function generateCaptionFromContext(params: {
  userContext: string;
  tone: string;
  platform: string;       // "wa" | "ig" | "telegram"
  captionLength: string;  // "short" | "normal" | "long"
  useEmoji: boolean;
  audience?: string;
  waNumber?: string;
}): Promise<CaptionResult> {
  const { userContext, tone, platform, captionLength, useEmoji, audience, waNumber } = params;
  const toneInstruction = TONE_INSTRUCTIONS[tone] ?? tone;

  const platformMap: Record<string, string> = {
    wa:       "WhatsApp — gunakan *bold* dan _italic_ WA style, baris pendek, mudah dibaca di notifikasi",
    ig:       "Instagram — bisa lebih panjang, storytelling visual, tambah 3–5 hashtag relevan di akhir",
    telegram: "Telegram — Markdown support, boleh agak detail, list dengan - atau 1.",
  };

  const lengthMap: Record<string, string> = {
    short:  "PENDEK: 280–420 karakter — langsung to the point, 1–2 paragraf, CTA singkat",
    normal: "NORMAL: 580–900 karakter — standar ideal, 3–4 paragraf, hook + value + CTA",
    long:   "PANJANG: 1000–1400 karakter — detail dan komprehensif, penjelasan menyeluruh",
  };

  const emojiRule = useEmoji
    ? "Gunakan 2–5 emoji yang memperkuat emosi dan keterbacaan. Tempatkan secara strategis."
    : "DILARANG menggunakan emoji. Caption harus bersih, teks saja.";

  const audienceLine = audience?.trim()
    ? `Target audiens: ${audience.trim()}.`
    : "Target audiens: analisa sendiri dari konteks.";

  const waSection = waNumber?.trim()
    ? `\nNomor WA untuk CTA: wa.me/${waNumber.trim().replace(/\D/g, "")}`
    : "";

  const model = useAIOverrideStore.getState().getModel("caption", OR_MODELS.CAPTION);
  const { content, usage } = await callAIOpenRouterFull({
    model,
    systemPrompt: CAPTION_SYSTEM_PROMPT,
    prompt: `Buat 1 caption marketing berdasarkan konteks bisnis berikut:

--- KONTEKS BISNIS (dari user) ---
${userContext.trim() || "[Buat caption umum Temantiket untuk promosi layanan travel Umrah & Mesir]"}
---

${audienceLine}
Platform: ${platformMap[platform] ?? platform}
Panjang: ${lengthMap[captionLength] ?? lengthMap.normal}
${emojiRule}${waSection}

Pahami konteks di atas — apa produk/jasanya, siapa target pasarnya, apa tujuannya — lalu buat caption yang tepat sasaran dan compelling.

Tone yang diminta:${toneInstruction}`,
    temperature: 0.85,
    maxTokens: 1800,
  });
  return { caption: content, usage };
}

export type VariantType = "softer" | "harder" | "shorter" | "story_wa" | "broadcast" | "testimonial";

/**
 * generateCaptionVariant — buat varian dari caption yang sudah ada.
 * Dipakai untuk quick-action buttons (lebih soft, harder sell, pendekkan, dll).
 */
export async function generateCaptionVariant(params: {
  originalContext: string;
  currentCaption: string;
  variantType: VariantType;
  tone: string;
  waNumber?: string;
}): Promise<CaptionResult> {
  const { originalContext, currentCaption, variantType, waNumber } = params;

  const variantInstructions: Record<VariantType, string> = {
    softer:
      "Tulis ulang caption ini dengan tone yang lebih SOFT dan hangat. Kurangi tekanan dan urgency. Tambah empati, pengertian, dan rasa kekeluargaan. Nada: seperti teman yang peduli, bukan sales yang mengejar target.",
    harder:
      "Tulis ulang caption ini dengan HARD SELLING yang lebih kuat. Tambah urgency nyata, scarcity (kuota/seat terbatas, deadline harga), FOMO berbasis fakta. CTA harus kuat dan muncul dua kali. Nada: mendorong konversi segera — tapi tetap jujur.",
    shorter:
      "Pendekkan caption ini menjadi MAKSIMAL 320 karakter. Ambil inti pesan dan satu CTA yang kuat saja. Buang semua yang tidak esensial. Harus tetap compelling dan ada CTA yang jelas.",
    story_wa:
      "Ubah caption ini menjadi 3 SLIDE WhatsApp Status yang mengalir. Setiap slide maks 250 karakter, harus berdiri sendiri tapi nyambung ke slide berikutnya. Format output:\n[SLIDE 1]\n...\n\n[SLIDE 2]\n...\n\n[SLIDE 3]\n...",
    broadcast:
      "Ubah caption ini menjadi pesan BROADCAST ADMIN yang profesional dan informatif. Format resmi, terstruktur dengan bullet point jika perlu. Awali dengan kop pengumuman singkat. Nada: informatif dan terpercaya, bukan marketing berlebihan.",
    testimonial:
      "Ubah caption ini menjadi TESTIMONI / STORYTELLING dari sudut pandang pelanggan yang sudah puas. Tulis seolah cerita nyata dari customer (gunakan nama fiktif wajar seperti 'Kak Rina dari Bandung'). Authentic, personal, tidak terasa seperti iklan.",
  };

  const waSection = waNumber?.trim()
    ? `\nNomor WA untuk CTA: wa.me/${waNumber.trim().replace(/\D/g, "")}`
    : "";

  const model = useAIOverrideStore.getState().getModel("caption", OR_MODELS.CAPTION);
  const { content, usage } = await callAIOpenRouterFull({
    model,
    systemPrompt: CAPTION_SYSTEM_PROMPT,
    prompt: `${variantInstructions[variantType]}

Konteks bisnis asli (referensi):
${originalContext.trim().slice(0, 600) || "[tidak ada konteks tambahan]"}
${waSection}

Caption yang perlu diubah:
---
${currentCaption}
---

Tulis langsung versi barunya — tanpa penjelasan, tanpa label, langsung caption siap pakai.`,
    temperature: 0.88,
    maxTokens: 1800,
  });
  return { caption: content, usage };
}

/** Gabungkan TokenUsage dari 2 panggilan AI menjadi satu entri total. */
function combineUsage(a: TokenUsage | null, b: TokenUsage | null): TokenUsage | null {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  return {
    promptTokens:     a.promptTokens     + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens:      a.totalTokens      + b.totalTokens,
    estimatedCostUsd: a.estimatedCostUsd + b.estimatedCostUsd,
    resolvedModel:    `${a.resolvedModel} → ${b.resolvedModel}`,
  };
}

/**
 * generateCaptionFromPoster — scan gambar poster lalu buat caption marketing.
 * Dipakai di MarketingKitGenerator mode "poster".
 *
 * 2-step pipeline:
 *   Step 1 → Gemini 2.5 Flash (vision) membaca & mengekstrak fakta dari poster
 *   Step 2 → Claude menyusun caption marketing dari hasil ekstraksi
 */
export async function generateCaptionFromPoster(params: {
  imageBase64: string;
  tone: string;
  waNumber?: string;
  onStatus?: (msg: string) => void;
}): Promise<CaptionResult> {
  const { imageBase64, tone, waNumber, onStatus } = params;
  const toneInstruction = TONE_INSTRUCTIONS[tone] ?? tone;
  const waSection = waNumber?.trim()
    ? `\nNomor WA untuk baris CTA: wa.me/${waNumber.trim().replace(/\D/g, "")}`
    : "";

  // Step 1: Flash Vision membaca poster → ekstrak fakta (text-only output)
  onStatus?.("Membaca poster...");
  const { content: extractedInfo, usage: usageOcr } = await callAIOpenRouterFull({
    model: OR_MODELS.VISION,
    systemPrompt: POSTER_OCR_SYSTEM_PROMPT,
    prompt: "Baca poster ini dan ekstrak semua informasi yang terlihat sesuai instruksi sistem.",
    imageBase64,
    temperature: 0.1,
    maxTokens: 800,
    fetchOptions: { timeoutMs: 60_000 },
  });

  // Step 2: Claude menulis caption dari informasi yang sudah diekstrak
  onStatus?.("Menyusun caption...");
  const { content: caption, usage: usageCaption } = await callAIOpenRouterFull({
    model: OR_MODELS.CAPTION_WRITER,
    systemPrompt: POSTER_CAPTION_SYSTEM_PROMPT,
    prompt: `Buat 1 caption berdasarkan informasi poster berikut.\nTone: ${toneInstruction}.${waSection}\n\n--- INFORMASI DARI POSTER ---\n${extractedInfo}`,
    temperature: 0.85,
    maxTokens: 1200,
    fetchOptions: { timeoutMs: 60_000 },
  });

  return { caption, usage: combineUsage(usageOcr, usageCaption) };
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

const RAPIKAN_SYSTEM_PROMPT = `Kamu adalah editor konten profesional — manusia, bukan robot. Kamu menulis seperti admin senior yang paham estetika dokumen: tahu kapan pakai heading, kapan pakai bullet, kapan biarkan teks mengalir sebagai paragraf. Output selalu Markdown bersih yang terasa seperti ditulis manusia, bukan di-generate AI.

━━━ PRINSIP UTAMA ━━━

1. NATURAL & MANUSIAWI — tulis seperti orang menulis catatan profesional, bukan template robot
2. HIERARKI VISUAL JELAS — H2 besar, H3 medium, isi normal. Jangan semua bold/semua sama berat
3. BREATHING ROOM — selalu ada jarak antar elemen. Jangan dempet. Beri napas visual.
4. BOLD SECUKUPNYA — hanya untuk: angka penting, nama dokumen, istilah kunci. BUKAN semua kalimat
5. ITALIC NATURAL — untuk keterangan, catatan sampingan, penekanan ringan

━━━ ATURAN SPACING WAJIB ━━━

✓ SELALU satu baris kosong SETELAH setiap heading (##, ###)
✓ SELALU satu baris kosong SEBELUM setiap section baru
✓ SELALU satu baris kosong antara heading dan paragraf pertama
✓ SELALU satu baris kosong antara grup bullet dan section berikutnya
✓ Antar bullet item: TIDAK perlu baris kosong (cukup rapat, tapi satu baris kosong boleh jika item panjang)
✓ Maksimal 2 baris kosong berturut-turut. Tidak lebih.
✗ JANGAN langsung tempel paragraf di bawah heading tanpa baris kosong
✗ JANGAN biarkan heading dan isi menyatu tanpa spasi

━━━ DETEKSI TIPE KONTEN (auto) ━━━

Sebelum menulis, tentukan tipe konten:

**A. PROSEDUR / TAHAPAN** — ada kata tahap/langkah/step, atau urutan yang harus dilakukan berurutan
→ Format: ## JUDUL PROSEDUR\n\n### 📌 Tahap 1 — Nama Tahap\n\nIsi penjelasan tahap.\n\n### 📌 Tahap 2 — Nama Tahap\n\nIsi penjelasan tahap.

**B. DAFTAR MURNI** — kumpulan item/syarat/checklist tanpa alur urutan
→ Format: ## JUDUL\n\nKalimat pembuka singkat jika ada.\n\n- item satu\n- item dua\n- item tiga

**C. INFO TERSTRUKTUR CAMPURAN** — beberapa kelompok topik berbeda (syarat + biaya + kontak, dll.)
→ Format: ## JUDUL UTAMA\n\nParagraf pembuka jika ada.\n\n### Sub-judul Pertama\n\n- item\n- item\n\n### Sub-judul Kedua\n\n- item

**D. NARASI / CATATAN BEBAS** — penjelasan, cerita, opini, info umum
→ Format: ## JUDUL\n\nParagraf pertama yang mengalir natural.\n\nParagraf kedua jika ada.

**E. CAMPURAN** — ada narasi + ada daftar
→ Gabungkan: paragraf untuk narasi, bullet/numbered untuk daftar, pisahkan dengan baris kosong

━━━ ATURAN MARKDOWN ━━━

**Heading H2 (##)** — judul utama, satu per catatan, huruf kapital
- Setelah ## SELALU ada satu baris kosong sebelum konten pertama

**Heading H3 (###)** — sub-bagian, gunakan hanya jika ada 2+ kelompok berbeda
- Setelah ### SELALU ada satu baris kosong sebelum konten pertama
- Sebelum ### SELALU ada satu baris kosong (kecuali di awal dokumen setelah ##)

**Bold (**teks**)** — gunakan HEMAT: angka uang, nama dokumen penting, istilah kunci, label field
- BUKAN untuk semua kalimat. BUKAN untuk semua poin bullet.
- Contoh benar: **Rp 1.300.000**, **Paspor Asli**, **Tahap 1**
- Contoh salah: **Pergi ke kantor untuk mengurus dokumen ini**

**Italic (_teks_)** — keterangan ringan, catatan opsional, penjelasan dalam kurung
- Contoh: _(opsional)_, _(jika baru, sertakan juga yang lama)_, _By Temantiket_

**Blockquote (> teks)** — nomor kontak, kode referral, kutipan penting

**Separator (---)** — hanya antara bagian yang BENAR-BENAR berbeda konteks

**Bullet (- item)** — daftar tanpa urutan
**Numbered (1. item)** — langkah berurutan saja

━━━ GAYA BAHASA ━━━

- Bahasa Indonesia natural, komunikatif, ringan dibaca, tetap profesional
- Perbaiki kalimat robotik → manusiawi
- Hindari repetisi kata yang tidak perlu
- Kapitalkan awal kalimat dan nama proper
- Perbaiki ejaan yang jelas salah ketik
- Pertahankan: istilah Arab, nama tempat khusus, singkatan khas (Fawry, LE, MRZ)
- Teks Arab (tulisan Arab): salin persis, karakter per karakter

━━━ DETEKSI OTOMATIS ELEMEN KHUSUS ━━━

Jika ada elemen berikut, format secara khusus:
- 📞 Nomor kontak → gunakan blockquote: > +62 xxx
- 🏠 Alamat → tulis sebagai satu blok bold-label: **Alamat:** ...
- ⚠️ Peringatan/warning → _Catatan: ..._
- ✅ CTA/ajakan bertindak → jadikan kalimat terakhir yang kuat
- 🔢 Langkah berurutan → selalu numbered list

━━━ LARANGAN MUTLAK ━━━

✗ JANGAN hapus atau ringkas informasi apapun dari teks asli
✗ JANGAN tambah informasi yang tidak ada di teks asli
✗ JANGAN ubah angka, fakta, nama, atau makna
✗ JANGAN tulis kata pengantar ("Berikut catatan...", "Saya telah merapikan...")
✗ JANGAN bungkus output dalam blok kode (triple-backtick)
✗ JANGAN ubah teks Arab — salin persis
✗ JANGAN buat semua teks bold
✗ JANGAN tempel isi langsung di bawah heading tanpa baris kosong

━━━ CONTOH OUTPUT YANG BENAR ━━━

CONTOH A — PROSEDUR:

## PROSEDUR AKTIVASI IMEI

_By Temantiket_

---

### 📌 Tahap 1 — Keluar dari Imigrasi

Setelah keluar dari imigrasi di bandara Soetta, lanjutkan ke area kedatangan.

### 📌 Tahap 2 — Terima HP

Terima HP yang akan didaftarkan dari orang yang menitipkan.

### 📌 Tahap 3 — Masuk Area Bea Cukai

Masuk ke area Bea Cukai sambil membawa HP, paspor, dan boarding pass. Kamu masuk sendiri, jadi tidak perlu khawatir.

---

CONTOH C — INFO TERSTRUKTUR:

## PERSYARATAN VISA STUDENT MESIR

Berlaku untuk **mahasiswa/pelajar aktif di Mesir**. Layanan resmi dan aman.

### Syarat Dokumen

- **Paspor asli** _(jika baru, sertakan juga paspor lama)_
- **Pas foto** _(kirim file, kami akan mencetak)_
- **Tadaruj/Tasdiq terbaru** _(harus asli)_

### Biaya

- **Rp 1.300.000** — Regular _(proses ±1 minggu)_

### Kontak & Pengiriman

- **Alamat:** Jl. Pembangunan IV No.18, Kota Tangerang _(Jawara)_
- **A.n:** Naufal Alfatih

> +62 851-5669-1312

---

Hubungi **Temantiket** untuk konfirmasi pengiriman dokumen.

━━━ PERINTAH AKHIR ━━━
Tulis langsung hasilnya. Tidak ada penjelasan, tidak ada kata pembuka, tidak ada blok kode. Mulai langsung dari konten.`;


// ── Rapihkan: WA/Telegram mode detection ────────────────────────────────────

/** Tones that always produce WhatsApp-native output (no web markdown) */
export const WA_TONE_IDS = new Set(["broadcast", "friendly"]);

/** Formats that always produce WhatsApp-native output (no web markdown) */
export const WA_FORMAT_IDS = new Set(["announcement"]);

/** Returns true when the selected tone or format targets WhatsApp / Telegram */
export function isWAMode(tone: string, format: string): boolean {
  return WA_TONE_IDS.has(tone) || WA_FORMAT_IDS.has(format);
}

// ── Rapihkan: System prompt for WhatsApp / Telegram output ───────────────────

const RAPIKAN_WA_SYSTEM_PROMPT = `Kamu adalah admin senior travel agency yang ahli menulis broadcast WhatsApp dan Telegram.

PENTING — OUTPUT INI UNTUK WHATSAPP / TELEGRAM:
Gunakan SINTAKS WHATSAPP ASLI. BUKAN markdown web atau HTML.

SINTAKS WAJIB:
• Bold:   *teks*       (satu asterisk kiri-kanan)
• Italic: _teks_       (underscore kiri-kanan)
• Strike: ~teks~
• Mono:   \`teks\`

SINTAKS YANG DILARANG KERAS:
✗ # Heading
✗ ## Heading
✗ ### Heading
✗ **bold** (dua asterisk)
✗ __italic__ (dua underscore)
✗ HTML tag atau rich text apapun

SEPARATOR antar section:
✓ ──────────
✓ ——————————

BULLET:
✓ • item   atau   - item
✗ Jangan nested bullet aneh

EMOJI:
• Maksimal 1 emoji per section header (📢 📌 ✅ ⚠️ 📍)
• Jangan spam emoji dekoratif (✨🔥💥🌈🎉)

ATURAN MUTLAK:
✗ Jangan hapus atau tambah informasi dari teks asli
✗ Jangan tulis kata pengantar ("Berikut adalah...", "Saya telah...")
✗ Jangan bungkus output dalam blok kode (triple backtick)
✗ Jangan ubah angka, fakta, nama, atau makna
✓ Mulai langsung dari konten
✓ Bahasa Indonesia natural, profesional, dan ringan dibaca`;

// ── Rapihkan: Tone & Format instruction maps ─────────────────────────────────

const RAPIKAN_TONE_INSTRUCTIONS: Record<string, string> = {
  profesional: `Tone: PROFESIONAL — Bahasa Indonesia baku, formal, dan elegan. Kalimat lengkap dan tertata. Hindari singkatan kasual, emoji berlebihan, atau ungkapan terlalu santai. Cocok untuk dokumen resmi, proposal, atau komunikasi bisnis. Tulis seperti admin senior yang menulis untuk klien korporat.`,

  friendly: `Tone: FRIENDLY WHATSAPP — Bahasa percakapan yang hangat dan akrab. Kalimat pendek dan mudah dicerna. Boleh 2–3 emoji yang relevan dan membantu (bukan dekoratif). Hindari kaku. Cocok untuk panduan WhatsApp, info perjalanan, atau instruksi klien.`,

  persuasif: `Tone: MARKETING PERSUASIF — Fokus pada manfaat dan nilai tambah. Kalimat aktif dan energik. Sertakan CTA yang kuat di akhir. Highlight keunggulan dengan bold. Buat pembaca merasa rugi jika tidak bertindak. Cocok untuk promo, penawaran layanan, dan marketing copy.`,

  padat: `Tone: SINGKAT & PADAT — Hapus semua kata yang tidak perlu. Satu kalimat = satu ide. Tidak ada basa-basi, tidak ada pengulangan. Hanya esensial. Cocok untuk ringkasan cepat, brief internal, atau catatan lapangan.`,

  admin: `Tone: SOP OPERASIONAL — Gaya instruksi kerja yang jelas, actionable, dan to-the-point. Gunakan kalimat imperatif (Lakukan ini, Pastikan itu). Tidak ada ambiguitas. Cocok untuk SOP, checklist tugas, atau instruksi untuk tim. Format rapi seperti manual operasional.`,

  elegant: `Tone: ELEGANT CLEAN — Minimalis, tenang, dan estetis. Seperti catatan di Notion atau Medium. Tidak ada dekorasi berlebihan. Kalimat mengalir natural. Spacing konsisten. Bold hanya untuk hal yang benar-benar penting. Cocok untuk jurnal profesional, catatan meeting, atau konten yang ingin terlihat premium.`,

  broadcast: `Tone: BROADCAST TELEGRAM/WA — Header *KAPITAL BOLD* dan tegas di baris pertama. Section-section terstruktur, dipisah dengan ──────────. Penutup dengan CTA atau info kontak yang menonjol. Boleh 1 emoji per section header. Harus bisa langsung di-copy dan disebar tanpa edit.`,
};

/** WA-specific tone overrides — replace the default when isWAMode = true */
const RAPIKAN_WA_TONE_INSTRUCTIONS: Record<string, string> = {
  broadcast: `Tone: BROADCAST TELEGRAM/WA — Buka dengan *📢 JUDUL KAPITAL TEGAS*. Section dipisah ──────────. Isi terstruktur dengan • bullet. Penutup CTA atau kontak. Langsung siap copy-paste. Satu emoji per section header maksimal.`,
  friendly:  `Tone: FRIENDLY WHATSAPP — Hangat dan akrab, seperti pesan dari teman. Kalimat pendek. Boleh 2–3 emoji yang relevan. Mudah dibaca di layar kecil.`,
};

const RAPIKAN_FORMAT_INSTRUCTIONS: Record<string, string> = {
  bullet: `Format: BULLET LIST — Struktur utama menggunakan bullet (- item). Kelompokkan poin serupa di bawah ### heading. Setiap heading diikuti satu baris kosong sebelum bullet pertama. Gunakan bold hanya untuk label atau istilah kunci, bukan seluruh kalimat.`,

  checklist: `Format: CHECKLIST — Ubah semua item menjadi checklist markdown (- [ ] item). Kelompokkan per kategori jika perlu dengan ### heading. Cocok untuk: syarat dokumen, daftar tugas, to-do list perjalanan. Setiap grup dipisah baris kosong.`,

  numbered: `Format: NUMBERED STEPS — Gunakan numbered list (1. 2. 3.) untuk langkah berurutan. Jika ada sub-tahap, gunakan ### Tahap N — Nama sebagai heading sebelum penjelasannya. Setiap step diawali baris kosong. Tidak ada bullet di dalam numbered.`,

  faq: `Format: FAQ — Tulis setiap pasang pertanyaan-jawaban dengan format: **Q: pertanyaan?** diikuti baris kosong, lalu **A:** jawaban. Pisahkan antar FAQ dengan satu baris kosong. Gunakan ### heading sebagai kategori jika ada beberapa topik berbeda.`,

  card: `Format: CARD SECTIONS — Bagi konten menjadi section-section dengan ## atau ### heading yang jelas. Setiap section diakhiri --- jika berbeda konteks. Dalam tiap card, gunakan bullet atau paragraf pendek. Cocok untuk konten multi-topik yang perlu dibaca per bagian.`,

  announcement: `Format: ANNOUNCEMENT — Buka dengan 📢 **JUDUL PENGUMUMAN** sebagai baris pertama. Lalu paragraf singkat berisi inti info. Kemudian detail terstruktur (bullet atau numbered). Tutup dengan baris CTA atau kontak yang menonjol. Cocok untuk info acara, perubahan jadwal, atau promo.`,

  paragraph: `Format: NARASI PARAGRAF — Tulis dalam paragraf yang mengalir natural. Minimal bullet list. Pisahkan antar paragraf dengan satu baris kosong. Gunakan bold untuk penekanan kunci dan italic untuk keterangan. Cocok untuk penjelasan panjang, cerita perjalanan, atau laporan.`,

  compact: `Format: COMPACT NOTES — Satu item per baris dengan pola: **Label:** nilai. Minimal baris kosong antar item. Gunakan --- hanya untuk memisahkan grup besar. Cocok untuk data ringkas, referensi cepat, atau catatan lapangan yang padat.`,

  travel: `Format: TRAVEL / VISA TEMPLATE — Gunakan struktur baku: ## NAMA LAYANAN / PAKET\n\nParagraf intro singkat.\n\n### Syarat Dokumen\n\n### Biaya\n\n### Cara Pengiriman\n\n### Kontak. Ikuti urutan ini. Setiap section diawali dan diakhiri baris kosong.`,

  client: `Format: INSTRUKSI KLIEN — Tulis langkah demi langkah menggunakan numbered list (1. 2. 3.). Setelah numbered list, tambahkan catatan penting dengan ### Catatan Penting jika ada. Bahasa harus mudah diikuti orang awam. Tidak ada jargon teknis. Tutup dengan info kontak jika ada.`,
};

/** WA-specific format overrides (no ## ### **bold**) */
const RAPIKAN_WA_FORMAT_INSTRUCTIONS: Record<string, string> = {
  bullet: `Format: BULLET LIST — Gunakan • atau - per poin. Kelompokkan di bawah *JUDUL SECTION* (bold kapital). Section dipisah ──────────. Satu baris kosong setelah judul section.`,

  checklist: `Format: CHECKLIST — Setiap item ditulis sebagai: ☐ item atau - item. Kelompokkan per kategori dengan *NAMA KATEGORI* (bold kapital). Grup dipisah satu baris kosong.`,

  numbered: `Format: NUMBERED STEPS — Gunakan 1. 2. 3. untuk langkah berurutan. Jika ada sub-tahap, tulis *Tahap N — Nama* (bold) sebagai label sebelum langkahnya. Setiap step diawali baris kosong.`,

  faq: `Format: FAQ — Setiap pasang: *Q: pertanyaan?* (bold), baris kosong, lalu A: jawaban. Pisahkan FAQ dengan ──────────. Kategori ditulis *NAMA KATEGORI* (bold kapital) jika ada beberapa topik.`,

  card: `Format: CARD SECTIONS — Setiap card dimulai dengan *JUDUL CARD* (bold kapital). Card dipisah dengan ──────────. Dalam tiap card gunakan • bullet atau paragraf pendek.`,

  announcement: `Format: ANNOUNCEMENT WHATSAPP — Baris pertama: *📢 JUDUL PENGUMUMAN* (bold kapital). Lalu paragraf singkat berisi inti info. Kemudian detail dengan • bullet. Pisahkan section dengan ──────────. Tutup dengan CTA atau kontak. Siap copy-paste langsung ke WA/Telegram.`,

  paragraph: `Format: NARASI PARAGRAF — Tulis dalam paragraf yang mengalir natural. Pisahkan antar paragraf dengan satu baris kosong. Gunakan *bold* (satu asterisk) untuk penekanan kunci dan _italic_ untuk keterangan.`,

  compact: `Format: COMPACT NOTES — Satu item per baris: *Label:* nilai. Minimal baris kosong antar item. Gunakan ────────── untuk memisahkan grup besar.`,

  travel: `Format: TRAVEL TEMPLATE — Struktur: *NAMA LAYANAN* (bold kapital) → paragraf intro → ──────────→ *Syarat Dokumen* → • bullet → ──────────→ *Biaya* → ──────────→ *Cara Pengiriman* → ──────────→ *Kontak*.`,

  client: `Format: INSTRUKSI KLIEN — Langkah demi langkah: 1. 2. 3. Jika ada catatan penting, tulis *Catatan Penting* (bold) sebagai label. Bahasa mudah dipahami. Tutup dengan info kontak jika ada.`,
};

/**
 * cleanAndStructureNote — rapikan & format teks catatan mentah menjadi Markdown bersih.
 * Dipakai di fitur "Rapikan" di halaman Catatan.
 *
 * @param tone   - Gaya penulisan: "profesional" | "friendly" | "persuasif" | dll.
 * @param format - Format layout: "bullet" | "checklist" | "numbered" | dll.
 */
export async function cleanAndStructureNote(
  text: string,
  tone = "profesional",
  format = "bullet"
): Promise<string> {
  const model  = useAIOverrideStore.getState().getModel("notes", OR_MODELS.NOTES_WRITER);
  const waMode = isWAMode(tone, format);

  const toneInstr = waMode
    ? (RAPIKAN_WA_TONE_INSTRUCTIONS[tone]    ?? RAPIKAN_TONE_INSTRUCTIONS[tone]    ?? RAPIKAN_TONE_INSTRUCTIONS.profesional)
    : (RAPIKAN_TONE_INSTRUCTIONS[tone]       ?? RAPIKAN_TONE_INSTRUCTIONS.profesional);

  const fmtInstr = waMode
    ? (RAPIKAN_WA_FORMAT_INSTRUCTIONS[format] ?? RAPIKAN_FORMAT_INSTRUCTIONS[format] ?? RAPIKAN_FORMAT_INSTRUCTIONS.bullet)
    : (RAPIKAN_FORMAT_INSTRUCTIONS[format]    ?? RAPIKAN_FORMAT_INSTRUCTIONS.bullet);

  const systemPrompt = waMode ? RAPIKAN_WA_SYSTEM_PROMPT : RAPIKAN_SYSTEM_PROMPT;

  // Heuristic: detect likely content type for additional AI context
  const t = text.trim();
  const hasTahap    = /\btahap\b|\blangkah\b|\bstep\b/i.test(t);
  const hasBullets  = /^[-•*]\s/m.test(t) || (t.match(/\n/g) ?? []).length > 3;
  const hasSections = /:\s*\n|:\s{2,}/.test(t) || /\b(syarat|biaya|layanan|kontak|alamat|harga|dokumen)\b/i.test(t);

  const contentHint = hasTahap
    ? "Prosedur bertahap"
    : hasSections
    ? "Info terstruktur campuran"
    : hasBullets
    ? "Daftar murni"
    : "Narasi/paragraf";

  const outputMode = waMode
    ? "OUTPUT: WhatsApp/Telegram native — WAJIB pakai sintaks WA (*bold*, _italic_, ──────────). DILARANG ## ### **bold**."
    : "OUTPUT: Markdown bersih untuk preview internal.";

  return callAIOpenRouter({
    model,
    systemPrompt,
    prompt: `Rapikan teks berikut. Jangan hilangkan informasi apapun.

TONE PENULISAN: ${toneInstr}
FORMAT LAYOUT: ${fmtInstr}
DETEKSI KONTEN: ${contentHint}
${outputMode}

TEKS:
${t}`,
    temperature: 0.2,
    maxTokens: 3000,
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
