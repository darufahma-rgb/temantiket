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
  "google/gemini-2.5-flash-preview":        { input: 0.15,  output: 0.60  },
  "google/gemini-2.5-flash-preview-05-20":  { input: 0.15,  output: 0.60  },
  "google/gemini-2.5-pro-preview-05-06":    { input: 1.25,  output: 10.00 },
  "google/gemini-2.5-pro":                  { input: 1.25,  output: 10.00 },
  "anthropic/claude-sonnet-4":              { input: 3.00,  output: 15.00 },
  "anthropic/claude-4-sonnet-20250522":     { input: 3.00,  output: 15.00 },
  "anthropic/claude-3-5-sonnet-20241022":   { input: 3.00,  output: 15.00 },
};
const DEFAULT_PRICING = { input: 0.50, output: 1.50 };

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  return (promptTokens * pricing.input + completionTokens * pricing.output) / 1_000_000;
}

// ── Model registry ──────────────────────────────────────────────────────────
// Satu tempat untuk semua model — ubah di sini kalau mau ganti model.

export const OR_MODELS = {
  /** Vision + OCR: poster, paspor, tiket screenshot. Gemini 2.5 Flash — murah, cepat, akurat. */
  VISION:          "google/gemini-2.5-flash-preview-05-20",
  /** Caption marketing — manual maupun dari poster. */
  CAPTION:         "google/gemini-2.0-flash-001",
  /** Caption writer setelah OCR poster — Claude untuk kualitas copywriting terbaik. */
  CAPTION_WRITER:  "anthropic/claude-3-5-sonnet-20241022",
  /** Rapikan catatan, formatting teks ringan. */
  TEXT_FAST:       "google/gemini-2.0-flash-001",
  /** Structured JSON output: itinerary, data terstruktur. */
  STRUCTURED:      "google/gemini-2.0-flash-001",
  /** Reasoning kompleks — hanya pakai kalau butuh kualitas tinggi. */
  REASONING:       "anthropic/claude-3-5-sonnet-20241022",
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
/** Internal full response type (includes usage for cost tracking). */
interface OpenRouterFullResult {
  content: string;
  usage: TokenUsage | null;
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

  console.log(`[callAIOpenRouter] model="${model}" imageBase64=${!!imageBase64}`);

  const body: Record<string, unknown> = {
    model,
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

    if (data.error) throw new Error(extractErrorMessage(data.error));

    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) throw new Error("AI tidak mengembalikan konten — coba lagi");

    // Parse usage if available
    let usage: TokenUsage | null = null;
    if (data.usage) {
      const promptTokens     = data.usage.prompt_tokens     ?? 0;
      const completionTokens = data.usage.completion_tokens ?? 0;
      const totalTokens      = data.usage.total_tokens      ?? promptTokens + completionTokens;
      const resolvedModel    = data.model ?? model;
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
    throw new Error(extractErrorMessage(error));
  }
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
Temantiket adalah travel Umrah & Haji Indonesia yang ramah, hangat, kekeluargaan, dan amanah.
Brand name selalu: "Temantiket" (bukan TemanTiket, bukan Teman Tiket, tanpa spasi).
Tagline: "mudah, cepat, amanah"

━━━ PSIKOLOGI TARGET PEMBACA ━━━
Kamu menulis untuk calon jamaah Indonesia yang:
- Memendam impian Umrah/Haji bertahun-tahun — ini bukan sekadar liburan, ini ibadah seumur hidup
- Cemas soal biaya, keamanan, dan memilih agen yang tepat (takut ditipu)
- Termotivasi oleh: rasa rindu Baitullah, tanggung jawab kepada orang tua, impian keluarga berangkat bersama
- Merespons kuat terhadap: kisah nyata, bukti sosial, detail spesifik, dan rasa kekeluargaan
- Alergi terhadap: janji berlebihan, kata "GRATIS!", tekanan terlalu kuat, terlalu formal/kaku

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
  const { content, usage } = await callAIOpenRouterFull({
    model,
    systemPrompt: CAPTION_SYSTEM_PROMPT,
    prompt: `Buat 1 caption marketing untuk ${categoryPrompt}.\nTone yang diminta: ${toneInstruction}.${detailSection}${waSection}`,
    temperature: 0.85,
    maxTokens: 1500,
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
