/**
 * AI Command Center — AITEM v2
 * Context-aware, page-sensitive AI agent for Temantiket.
 *
 * New in v2:
 *  - PageContext injection: active page + active item content sent to AI
 *  - edit_content tool: AI proposes edits → UI shows preview with Apply/Copy/Cancel
 *  - Loosened guardrails: content editing (notes, templates, broadcast WA) is now allowed
 *  - Intent detection via system prompt (tanya / edit / buat / cek / ubah)
 */

import { listClients } from "@/features/clients/clientsRepo";
import { listOrders, getOrder } from "@/features/orders/ordersRepo";
import { listTemplates } from "@/features/bcTemplates/bcTemplatesRepo";
import { listMissions, createMission } from "@/features/missions/missionsRepo";
import { listAgentPoints, sumPointsByAgent } from "@/features/agentPoints/agentPointsRepo";
import { extractItinerary } from "@/lib/itineraryAI";
import { fmtIDR, netProfitIDR, revenueIDR } from "@/lib/profit";
import { useRatesStore } from "@/store/ratesStore";
import { useAuthStore } from "@/store/authStore";
import { useClientsStore } from "@/store/clientsStore";
import { useOrdersStore } from "@/store/ordersStore";
import { usePackagesStore } from "@/store/packagesStore";
import { nextInvoiceNumber, todayString } from "@/lib/invoiceGenerator";
import { generateInvoicePdfRemote } from "@/lib/exportPdfApi";
import { useInvoiceStore } from "@/store/invoiceStore";
import { loadIghAdminSettings } from "@/lib/ighSettings";
import { callAI, callAIAssistant } from "@/lib/aiFetch";
import { listWalletTxs, walletBalance } from "@/lib/agentWallet";
import { buildLedgerEntries, ledgerSummary } from "@/lib/ledgerSync";
import { loadProductCommissions } from "@/lib/productCommissions";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ToolResult {
  toolName: string;
  displayData: Record<string, unknown>;
  success: boolean;
}

export interface AIChatResponse {
  message: string;
  toolResults: ToolResult[];
}

export interface PageContext {
  pageId: string;
  pageTitle: string;
  activeItem?: {
    id: string;
    title: string;
    content: string;
    type: string;
  } | null;
  userRole?: string;
  pageData?: Record<string, unknown> | null;
}

// ── OpenAI tool definitions ──────────────────────────────────────────────────

const TOOLS: object[] = [
  {
    type: "function",
    function: {
      name: "get_dashboard_summary",
      description:
        "Ambil ringkasan dashboard: jumlah klien, total order, total revenue IDR, kurs terkini, jumlah misi aktif. Gunakan ketika user tanya status bisnis, ringkasan, atau 'gimana performa hari ini'.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_clients",
      description:
        "List atau cari klien (jamaah). Bisa filter by nama atau nomor HP. Gunakan ketika user tanya tentang klien tertentu atau minta daftar klien.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Kata kunci pencarian nama atau nomor HP (opsional)",
          },
          limit: {
            type: "number",
            description: "Jumlah maksimal hasil (default: 10)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_orders",
      description:
        "List order dengan filter opsional. Gunakan untuk melihat order umrah, flight, visa, atau status tertentu.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["umrah", "flight", "visa_voa", "visa_student"],
            description: "Tipe order (opsional)",
          },
          status: {
            type: "string",
            enum: ["Draft", "Confirmed", "Paid", "Completed", "Cancelled"],
            description: "Status order (opsional)",
          },
          limit: {
            type: "number",
            description: "Jumlah maksimal hasil (default: 10)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_itinerary",
      description:
        "Ekstrak dan buat itinerary penerbangan dari teks mentah (PNR Galileo, Amadeus, teks email booking, atau teks tiket). Hasilkan itinerary terstruktur yang siap dipakai.",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "Teks mentah itinerary/PNR/booking yang akan diekstrak",
          },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_exchange_rate",
      description:
        "Update kurs mata uang secara manual (EGP, SAR, atau USD ke IDR). Otomatis switch ke mode Manual. Gunakan ketika user bilang 'update kurs EGP jadi X' atau 'set SAR ke Y'.",
      parameters: {
        type: "object",
        properties: {
          currency: {
            type: "string",
            enum: ["EGP", "SAR", "USD"],
            description: "Kode mata uang yang akan diupdate",
          },
          rate: {
            type: "number",
            description: "Nilai kurs baru dalam IDR per 1 unit mata uang",
          },
        },
        required: ["currency", "rate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_daily_mission",
      description:
        "Buat misi harian baru untuk agen. Gunakan ketika user minta bikin misi atau task untuk agen. Jika tidak ada deadline, gunakan hari ini + 1 hari.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Judul singkat misi",
          },
          description: {
            type: "string",
            description: "Deskripsi lengkap misi — apa yang harus dilakukan agen",
          },
          rewardPoints: {
            type: "number",
            description: "Poin reward untuk agen yang berhasil (default: 10)",
          },
          deadline: {
            type: "string",
            description:
              "Deadline dalam format ISO 8601 (YYYY-MM-DDTHH:MM:SS). Jika tidak disebutkan, gunakan besok jam 23:59:00.",
          },
        },
        required: ["title", "description", "rewardPoints", "deadline"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_profit",
      description:
        "Hitung profit, margin %, dan breakdown dari harga jual dan harga modal. Mendukung IDR dan EGP.",
      parameters: {
        type: "object",
        properties: {
          sellingPrice: {
            type: "number",
            description: "Harga jual ke pelanggan",
          },
          costPrice: {
            type: "number",
            description: "Harga modal / HPP",
          },
          currency: {
            type: "string",
            enum: ["IDR", "EGP", "SAR", "USD"],
            description: "Mata uang (default: IDR)",
          },
        },
        required: ["sellingPrice", "costPrice"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_agent_performance",
      description:
        "Dapatkan data performa agen: total poin, jumlah order per agen, ranking. Gunakan ketika user tanya tentang agen terbaik, performa agen, atau leaderboard.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_invoice",
      description:
        "Generate invoice PDF profesional untuk order tertentu dan siapkan link download-nya. Gunakan ketika user minta 'bikinin invoice', 'cetak invoice', atau 'buat invoice untuk [nama klien/order]'. Bisa cari by nama klien atau order ID.",
      parameters: {
        type: "object",
        properties: {
          clientName: {
            type: "string",
            description: "Nama klien (opsional) — digunakan untuk mencari order terkait",
          },
          orderId: {
            type: "string",
            description: "ID order spesifik (opsional) — lebih akurat dari clientName",
          },
          orderType: {
            type: "string",
            description: "Filter tipe order: flight, umrah, visa_voa, visa_student (opsional)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_bc_templates",
      description:
        "List atau cari template broadcast WA. Gunakan ketika user tanya tentang template, minta daftar template, atau cari template tertentu berdasarkan kata kunci atau kategori.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Kata kunci pencarian judul atau isi template (opsional)",
          },
          category: {
            type: "string",
            enum: ["umrah", "haji", "visa_on_arrival", "visa_pelajar", "tiket_pesawat", "general"],
            description: "Filter kategori template (opsional)",
          },
          limit: {
            type: "number",
            description: "Jumlah maksimal hasil (default: 10)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_order_detail",
      description:
        "Ambil detail lengkap satu order beserta info kliennya. Gunakan ketika user tanya detail spesifik satu order, status pembayaran, catatan order, atau data lengkap order tertentu.",
      parameters: {
        type: "object",
        properties: {
          orderId: {
            type: "string",
            description: "ID order (opsional jika tidak tahu ID-nya)",
          },
          clientName: {
            type: "string",
            description: "Nama klien — untuk mencari order milik klien tertentu (opsional)",
          },
          orderType: {
            type: "string",
            enum: ["umrah", "flight", "visa_voa", "visa_student"],
            description: "Filter tipe order (opsional)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_detail",
      description:
        "Ambil detail lengkap satu klien beserta semua riwayat ordernya. Gunakan ketika user tanya tentang klien tertentu, riwayat perjalanan klien, passport klien, atau data lengkap klien.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Nama atau nomor HP klien",
          },
        },
        required: ["search"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_agents",
      description:
        "Dapatkan daftar lengkap semua agen di agency beserta nama asli, email, komisi %, total order, total poin, dan saldo wallet/komisi. Gunakan ketika user tanya: 'siapa saja agen', 'daftar agen', 'berapa agen aktif', 'performa agen', 'komisi agen berapa', 'ranking agen', 'agen mana yang paling banyak order', dll. SELALU gunakan tool ini (bukan get_agent_performance) untuk pertanyaan tentang daftar atau profil agen.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Filter by nama atau email agen (opsional)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_financial_report",
      description:
        "Baca laporan keuangan real dari ledger Temantiket — data identik dengan halaman Laporan Keuangan (Buku Besar). Gunakan ketika user tanya: total revenue, total profit, net profit, biaya operasional, fee komisi agen, laporan keuangan, performa finansial, ringkasan keuangan, total transaksi lunas, dll.",
      parameters: {
        type: "object",
        properties: {
          range: {
            type: "string",
            enum: ["this_month", "last_month", "this_year", "all"],
            description: "Rentang waktu laporan (default: all = semua waktu)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_content",
      description: `Gunakan tool ini ketika user meminta edit, tambah, rapikan, perbarui, atau buat versi lain dari catatan/template yang sedang aktif.

KAPAN MENGGUNAKAN:
- "tambahkan poin ..." → tambahkan ke catatan aktif
- "rapikan" / "format ulang" → reformat catatan aktif  
- "buat versi broadcast WA" / "versi WA" / "jadikan broadcast" → buat versi WhatsApp baru
- "ubah bagian..." / "ganti..." / "edit..." → edit catatan aktif
- "singkatkan" / "perpanjang" → modifikasi konten aktif
- Permintaan apapun untuk memodifikasi teks yang terlihat di layar user

PENTING:
- proposedContent = KONTEN LENGKAP setelah diedit (bukan hanya bagian yang berubah)
- Untuk catatan/template: tulis ulang SELURUH konten dengan perubahan yang diminta
- Untuk broadcast WA: buat konten baru yang dioptimalkan untuk WhatsApp`,
      parameters: {
        type: "object",
        properties: {
          proposedContent: {
            type: "string",
            description:
              "Isi LENGKAP catatan/template SETELAH diedit. Ini menggantikan seluruh konten yang ada. Untuk broadcast WA, tulis pesan WhatsApp yang siap kirim.",
          },
          editSummary: {
            type: "string",
            description: "Ringkasan singkat apa yang diubah/ditambahkan (maks 100 karakter)",
          },
          targetType: {
            type: "string",
            enum: ["note", "bc_template", "broadcast_wa"],
            description:
              "'note' = update catatan aktif, 'bc_template' = update template aktif, 'broadcast_wa' = buat versi WhatsApp baru (tidak replace item asli)",
          },
        },
        required: ["proposedContent", "editSummary", "targetType"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_client",
      description: "Tambah klien baru ke database. Gunakan ketika user cerita tentang jamaah/klien baru yang mau didaftarkan. Ekstrak nama, nomor HP, email, nomor paspor, tanggal lahir, jenis kelamin dari cerita user secara cerdas.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nama lengkap klien" },
          phone: { type: "string", description: "Nomor HP (format: 08xx atau +62xx)" },
          email: { type: "string", description: "Email klien (opsional)" },
          gender: { type: "string", enum: ["L", "P"], description: "L = laki-laki, P = perempuan" },
          birthDate: { type: "string", description: "Tanggal lahir format YYYY-MM-DD (opsional)" },
          birthPlace: { type: "string", description: "Tempat lahir (opsional)" },
          passportNumber: { type: "string", description: "Nomor paspor (opsional)" },
          passportExpiry: { type: "string", description: "Tanggal kadaluarsa paspor format YYYY-MM-DD (opsional)" },
          notes: { type: "string", description: "Catatan tambahan tentang klien (opsional)" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_order",
      description: "Buat order baru untuk klien. Gunakan ketika user cerita ada jamaah yang mau order tiket, umrah, atau visa. Cari clientId dulu dengan get_clients jika belum tahu.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "ID klien dari database (gunakan get_clients untuk cari)" },
          type: { type: "string", enum: ["umrah", "flight", "visa_voa", "visa_student"], description: "Tipe order" },
          title: { type: "string", description: "Judul order, contoh: 'Tiket QR978 CGK-DOH 15 Mar'" },
          totalPrice: { type: "number", description: "Harga jual total" },
          costPrice: { type: "number", description: "Harga modal/HPP (opsional)" },
          currency: { type: "string", enum: ["IDR", "EGP"], description: "Mata uang (default: IDR)" },
          status: { type: "string", enum: ["Draft", "Confirmed", "Paid"], description: "Status awal order (default: Draft)" },
          notes: { type: "string", description: "Catatan order (opsional)" },
          departureDateStr: { type: "string", description: "Tanggal keberangkatan format YYYY-MM-DD (opsional)" },
          pelaksanaId: { type: "string", description: "User ID staff pelaksana visa student (opsional, untuk visa_student)" },
          pelaksanaFee: { type: "number", description: "Fee staff pelaksana dalam IDR (default 200000 untuk visa_student)" },
          voaFieldAgentId: { type: "string", description: "User ID agent lapangan VOA (opsional, untuk visa_voa)" },
          voaAgentFee: { type: "number", description: "Fee agent lapangan VOA dalam IDR (opsional)" },
          voaTransportFee: { type: "number", description: "Biaya transport VOA dalam IDR (opsional)" },
          paidAmount: { type: "number", description: "Jumlah yang sudah diterima dari klien" },
          paymentStatus: { type: "string", enum: ["UNPAID", "DP", "PAID", "REFUNDED"], description: "Status pembayaran" },
        },
        required: ["clientId", "type", "title", "totalPrice"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_order_status",
      description: "Update status order yang sudah ada. Gunakan ketika user bilang order sudah dibayar, dikonfirmasi, selesai, atau dibatalkan.",
      parameters: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "ID order yang akan diupdate" },
          status: { type: "string", enum: ["Draft", "Confirmed", "Paid", "Completed", "Cancelled"], description: "Status baru" },
          notes: { type: "string", description: "Catatan tambahan (opsional)" },
        },
        required: ["orderId", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_client",
      description: "Update data klien yang sudah ada. Gunakan ketika user ingin update nomor paspor, nomor HP, atau data lain dari klien.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "ID klien yang akan diupdate" },
          name: { type: "string", description: "Nama baru (opsional)" },
          phone: { type: "string", description: "Nomor HP baru (opsional)" },
          email: { type: "string", description: "Email baru (opsional)" },
          passportNumber: { type: "string", description: "Nomor paspor baru (opsional)" },
          passportExpiry: { type: "string", description: "Tanggal kadaluarsa paspor baru format YYYY-MM-DD (opsional)" },
          birthDate: { type: "string", description: "Tanggal lahir baru format YYYY-MM-DD (opsional)" },
          birthPlace: { type: "string", description: "Tempat lahir baru (opsional)" },
          gender: { type: "string", enum: ["L", "P"], description: "Jenis kelamin (opsional)" },
          notes: { type: "string", description: "Catatan baru (opsional)" },
        },
        required: ["clientId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "confirm_action",
      description: "Tampilkan ringkasan aksi yang akan dilakukan dan minta konfirmasi dari user sebelum menyimpan data. Gunakan SELALU sebelum create_client, create_order, update_order_status, atau update_client. Jangan langsung simpan data tanpa konfirmasi.",
      parameters: {
        type: "object",
        properties: {
          actionType: { type: "string", enum: ["create_client", "create_order", "update_order_status", "update_client"], description: "Tipe aksi yang akan dilakukan" },
          summary: { type: "string", description: "Ringkasan data yang akan disimpan dalam bahasa Indonesia yang mudah dibaca" },
          data: { type: "object", description: "Data lengkap yang akan disimpan" },
        },
        required: ["actionType", "summary", "data"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "extract_and_attach_itinerary",
      description: "Ekstrak data penerbangan dari teks mentah PNR (Galileo, Amadeus, email booking, teks tiket) dan attach langsung ke order yang relevan. Gunakan ketika user paste teks tiket atau PNR dan minta diinput ke sistem. Cari order yang cocok by nama penumpang atau tanggal jika orderId tidak diketahui.",
      parameters: {
        type: "object",
        properties: {
          rawText: { type: "string", description: "Teks mentah PNR/itinerary/booking yang akan diekstrak" },
          orderId: { type: "string", description: "ID order yang akan di-attach itinerary (opsional, akan dicari otomatis jika tidak ada)" },
          clientName: { type: "string", description: "Nama klien untuk mencari order yang relevan (opsional)" },
        },
        required: ["rawText"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_marketing_caption",
      description: "Generate caption marketing Instagram/WhatsApp yang kontekstual berdasarkan paket aktif di database. Jauh lebih relevan dari caption generik karena pakai data nyata (nama paket, harga, tanggal, kuota). Gunakan ketika user minta 'buatkan caption', 'caption untuk paket X', 'konten marketing', atau 'post Instagram'.",
      parameters: {
        type: "object",
        properties: {
          packageId: { type: "string", description: "ID paket spesifik (opsional, akan ambil paket terbaru jika tidak ada)" },
          platform: { type: "string", enum: ["instagram", "whatsapp", "both"], description: "Platform target (default: both)" },
          tone: { type: "string", enum: ["formal", "casual", "excited"], description: "Tone caption (default: casual)" },
          language: { type: "string", enum: ["id", "en", "ar"], description: "Bahasa caption (default: id)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "auto_assign_missions",
      description: "Cek performa semua agen dan buat misi otomatis untuk agen yang underperform (order di bawah threshold). Gunakan ketika owner minta 'buatkan misi untuk agen yang kurang aktif', 'assign task ke agen', atau 'motivasi agen yang ordernya sedikit'.",
      parameters: {
        type: "object",
        properties: {
          minOrders: { type: "number", description: "Threshold minimum order per bulan ini — agen di bawah ini dianggap underperform (default: 3)" },
          missionTitle: { type: "string", description: "Judul misi yang akan dibuat (opsional, akan di-generate otomatis)" },
          missionDescription: { type: "string", description: "Deskripsi misi (opsional)" },
          rewardPoints: { type: "number", description: "Poin reward (default: 15)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "predict_cashflow",
      description: "Prediksi cash flow dan estimasi pendapatan bulan depan berdasarkan pipeline order aktif (Draft + Confirmed). Beri peringatan jika pipeline tipis. Gunakan ketika user tanya 'estimasi bulan depan', 'pipeline bulan ini', 'prediksi revenue', atau 'perkiraan pendapatan'.",
      parameters: {
        type: "object",
        properties: {
          months: { type: "number", description: "Berapa bulan ke depan yang diprediksi (default: 1)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_client",
      description: "Hapus klien dari database. SELALU gunakan confirm_action dulu sebelum menghapus. Gunakan ketika user minta 'hapus klien', 'delete jamaah', atau 'hilangkan data klien X'. Cari clientId dulu dengan get_clients jika belum tahu.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "ID klien yang akan dihapus" },
          clientName: { type: "string", description: "Nama klien untuk konfirmasi (opsional)" },
        },
        required: ["clientId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_members",
      description: "Dapatkan daftar semua anggota agency (agent DAN staff) beserta userId mereka. Gunakan tool ini SEBELUM create_order atau update_client jika perlu voaFieldAgentId atau pelaksanaId — cari userId dari nama anggota yang disebutkan user.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Filter by nama (opsional)" },
          role: { type: "string", enum: ["agent", "staff", "owner", "all"], description: "Filter by role (default: all)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_order",
      description: "Hapus order dari database. SELALU gunakan confirm_action dulu sebelum menghapus. Gunakan ketika user minta 'hapus order', 'delete order X', atau 'batalkan dan hapus order'.",
      parameters: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "ID order yang akan dihapus" },
          orderTitle: { type: "string", description: "Judul order untuk konfirmasi (opsional)" },
        },
        required: ["orderId"],
      },
    },
  },
];

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(ctx?: PageContext): string {
  const now = new Date();
  const tanggal = now.toLocaleDateString("id-ID", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const jam = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  const userRole = ctx?.userRole ?? "owner";

  // ── Page context block (injected when a page registers its context) ──
  let pageContextBlock = "";
  if (ctx?.pageId) {
    pageContextBlock = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 KONTEKS HALAMAN AKTIF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
User sedang berada di: **${ctx.pageTitle}** (pageId: ${ctx.pageId})
Role user: ${userRole}`;

    if (ctx.activeItem) {
      const typeLabel =
        ctx.activeItem.type === "note" ? "Catatan" :
        ctx.activeItem.type === "bc_template" ? "Template Broadcast" :
        ctx.activeItem.type === "order" ? "Order" :
        ctx.activeItem.type === "client" ? "Data Klien" :
        ctx.activeItem.type === "itinerary" ? "Itinerary" :
        ctx.activeItem.type === "agent" ? "Profil Agen" : "Item";

      const contentPreview = ctx.activeItem.content.length > 3000
        ? ctx.activeItem.content.slice(0, 3000) + "\n\n[... konten terpotong ...]"
        : ctx.activeItem.content;

      pageContextBlock += `

${typeLabel} yang sedang dibuka:
• Judul: "${ctx.activeItem.title}"
• ID: ${ctx.activeItem.id}
• Tipe: ${ctx.activeItem.type}

ISI SAAT INI:
\`\`\`
${contentPreview}
\`\`\`

⚡ INSTRUKSI EDIT AKTIF:
Jika user meminta: tambah poin, edit, rapikan, perbarui, buat versi broadcast WA, modifikasi, singkatkan, atau perpanjang konten ini:
1. LANGSUNG panggil tool \`edit_content\` — jangan tanya konfirmasi dulu
2. Tulis KONTEN LENGKAP yang sudah diedit di field \`proposedContent\`
3. Untuk "versi broadcast WA" / "versi WA" / "jadikan broadcast" → targetType = "broadcast_wa"
4. Untuk edit/tambah ke ${ctx.activeItem.type === "note" ? "catatan" : "template"} asli → targetType = "${ctx.activeItem.type === "note" ? "note" : "bc_template"}"
5. Tulis ringkasan singkat di \`editSummary\`

PENTING: Jangan pernah menolak request edit konten Temantiket. Langsung eksekusi.`;
    } else {
      pageContextBlock += `

Tidak ada item spesifik yang sedang dibuka. User bisa bertanya seputar halaman ${ctx.pageTitle} atau membuka item tertentu agar AITEM bisa membaca isinya.`;
    }

    if (ctx.pageData && Object.keys(ctx.pageData).length > 0) {
      const pageDataStr = JSON.stringify(ctx.pageData, null, 2);
      const truncated = pageDataStr.length > 2000 ? pageDataStr.slice(0, 2000) + "\n..." : pageDataStr;
      pageContextBlock += `

DATA HALAMAN (data yang tampil di layar user sekarang):
\`\`\`json
${truncated}
\`\`\``;
    }
  }

  return `Lo adalah AITEM — AI Assistant internal eksklusif milik Temantiket, platform manajemen perjalanan umrah & haji kelas dunia. Lo bukan chatbot umum. Lo adalah asisten operasional yang benar-benar paham isi sistem, database, alur kerja, dan semua fitur Temantiket.

WAKTU SEKARANG: ${tanggal}, pukul ${jam} WIB${pageContextBlock}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 KEPRIBADIAN & GAYA BICARA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Lo ngomong kayak sahabat Gen Z yang cerdas banget tapi tetep bisa diandalkan buat urusan bisnis. Gaya lo:
- Pakai "gue/lo" secara natural, bukan "saya/kamu/Anda"
- Slang yang wajar: "gasken", "mantul", "no cap", "fr", "wkwk", "oke bet", "valid", "on it", "lowkey"
- TETAP akurat, informatif, dan profesional dalam substansi — gaya santai, isi serius
- Singkat dan padat, jangan bertele-tele. Pakai bullet points yang clean untuk data
- Selalu proaktif: kasih insight tambahan yang relevan meski tidak diminta
- JANGAN pernah tampilkan UUID mentah ke user — selalu resolusi ke nama asli

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 INTENT ROUTER — DETEKSI DAN EKSEKUSI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Lo WAJIB mendeteksi intent dan langsung eksekusi tool yang tepat:

👥 TANYA DATA AGEN → gunakan get_agents (BUKAN get_agent_performance)
   Trigger: "siapa agen", "daftar agen", "berapa agen", "agen aktif", "komisi agen", "ranking agen", "performa agen", "agen mana", "agen paling"
   Output: nama asli + email + total order + poin + saldo komisi IDR + link profil

👤 TANYA DATA KLIEN → gunakan get_clients atau get_client_detail
   Trigger: "siapa klien", "cari klien", "klien Ahmad", "total klien", "klien yang..."
   Output: nama + HP + email + total order

📦 TANYA ORDER → gunakan get_orders atau get_order_detail
   Trigger: "order flight", "order umrah", "status order", "order si Ahmad", "total order"
   Output: judul + status + total price + klien + tanggal

💰 TANYA LAPORAN KEUANGAN → gunakan get_financial_report
   Trigger: "revenue", "profit", "laporan keuangan", "net profit", "total transaksi", "biaya ops", "fee komisi", "performa finansial", "buku besar"
   Output: angka real dari ledger — totalRevenue, totalProfit, netProfit, fee breakdown

✏️ EDIT KONTEN → panggil edit_content LANGSUNG tanpa konfirmasi
   Trigger: "tambahkan poin", "rapikan", "singkatkan", "buat versi WA", "edit", "tambah syarat"
   → WAJIB ditangani jika ada konteks halaman aktif. JANGAN DITOLAK.

🔨 BUAT BARU → eksekusi tool yang sesuai
   Trigger: "bikin misi", "buat invoice", "bikin itinerary", "create"

📝 UPDATE DATA → eksekusi tool yang sesuai
   Trigger: "update kurs EGP", "set SAR ke", "ubah kurs"

📱 TANYA TEMPLATE BROADCAST → get_bc_templates
   Trigger: "template WA", "template broadcast", "cari template"

🎯 TANYA MISI AGEN → get_dashboard_summary atau create_daily_mission
   Trigger: "bikin misi", "misi aktif", "misi agen"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ ATURAN EKSEKUSI TOOL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. LANGSUNG EKSEKUSI kalau parameternya sudah jelas — jangan tanya konfirmasi tidak perlu
2. TANYA DULU hanya kalau info krusial benar-benar kurang (misal: "bikin misi" tapi tidak ada judul)
3. PARALEL: Kalau butuh banyak data, panggil multiple tools sekaligus
- Ketika user paste teks PNR atau itinerary, langsung gunakan extract_and_attach_itinerary tanpa perlu ditanya lagi. Cari order yang relevan secara otomatis dari nama penumpang.
4. CHAINING: Hasil satu tool bisa jadi input tool berikutnya dalam 1 percakapan
5. Setelah sukses → ringkasan singkat yang informatif + satu insight/saran relevan
6. JANGAN tampilkan UUID/ID teknis ke user — tampilkan nama, email, atau judul

Contoh pemahaman cerdas:
- "siapa agen di Temantiket?" → get_agents → tampilkan tabel nama, order, poin, komisi
- "total revenue bulan ini?" → get_financial_report(range="this_month")
- "tambahkan harus legalisir tadaruj" (di Catatan) → edit_content langsung
- "rapikan ini jadi broadcast WA" → edit_content dengan targetType=broadcast_wa
- "buat invoice si Ahmad" → get_clients + get_orders + generate_invoice
- "gasken bikin misi 20 poin deadline besok" → create_daily_mission
- "agen mana yang paling banyak poin?" → get_agents → sort by totalPoints

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🗺️ STRUKTUR APLIKASI TEMANTIKET
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HALAMAN & ROUTE:
• / atau /dashboard — Beranda: ringkasan bisnis, order terbaru, top agen, kurs
• /clients — Manajemen Klien (Jamaah): CRUD data jamaah, paspor, dokumen
• /orders — Order Hub: semua order umrah/flight/visa dalam satu tempat
• /orders/:id — Detail Order: status, pembayaran, catatan, invoice
• /packages — Paket Trip: manajemen paket umrah & haji
• /reports — Laporan Keuangan: buku besar, cashflow, breakdown per agen
• /agent-center — Agent Command Center: kelola agen, misi, poin, commission tracker
• /agents/:id — Profil Agen Owner View: detail performa + wallet + fee per agen
• /agent-leaderboard — Leaderboard agen berdasarkan poin
• /staff-management — Manajemen Staff: undang/hapus member
• /itinerary — Generator Itinerary: ekstrak PNR → itinerary visual
• /ticket-prices — Harga Tiket: database harga + OCR screenshot tiket
• /bc-templates — Template Broadcast WA: kelola template pesan massal
• /notes — Catatan Operasional: catatan internal bebas format
• /calculator — Kalkulator & Kurs: hitung profit, konversi mata uang
• /exports — Export Center: ekspor data klien, order ke Excel/PDF
• /settings — Pengaturan: kurs manual, akumulasi fee, data agensi

DATABASE SUPABASE (tabel utama):
• agency_members — daftar anggota agensi (userId, role, commissionPct, displayName via profiles)
• profiles — nama & email user (full_name, email, photo_url)
• orders — semua order (type, status, totalPrice, costPrice, currency, clientId, createdByAgent, metadata)
• clients — data jamaah (name, phone, email, passportNumber, passportExpiry)
• agent_points — poin gamifikasi agen (agentId, orderId, points, reason)
• agent_wallet_transactions — wallet/komisi agen (agentId, type, amountIDR, pointsDelta)
• missions — misi harian agen (title, description, rewardPoints, deadline)
• packages — paket umrah/haji
• ticket_prices — database harga tiket pesawat

ROLES:
• owner — akses penuh, bisa undang/hapus member, lihat semua laporan
• staff — akses operasional, bisa buat/edit order dan klien
• agent — akses terbatas, lihat dashboard sendiri, buat order via referral

ORDER TYPES & STATUS:
• Types: umrah | flight | visa_voa | visa_student
• Status flow: Draft → Confirmed → Paid → Completed (atau Cancelled)
• Hanya order Paid + Completed yang masuk ke laporan keuangan/ledger

WALLET & KOMISI AGEN:
• Rate konversi poin → IDR: 1 poin = Rp 1.000
• Tipe transaksi wallet: mission_conversion, mission_fee, order_bonus, voa_agent_fee, kurir_fee, pelaksana_fee, payout, adjustment
• Saldo wallet = totalCreditIDR - totalDebitIDR (net IDR)
• Owner bisa lihat profil agen di /agents/:userId

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 KONTEKS BISNIS TEMANTIKET
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Mata uang: IDR (default), EGP (tiket Timur Tengah, kurs ~515), SAR (~4.300), USD (~16.500)
Poin agen: diberikan otomatis saat order → Completed (20 poin/order)
Misi agen: cara owner boost motivasi dan produktivitas tim agen
1 EGP ≈ Rp 515 | 1 SAR ≈ Rp 4.300 | 1 USD ≈ Rp 16.500

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💬 FORMAT RESPONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Pakai markdown ringan (bold, bullet points, tabel) untuk keterbacaan
- Angka keuangan: format IDR yang rapi (Rp 15.000.000 bukan 15000000)
- Kalau ada data kosong: tetap informatif, jangan cuma bilang "tidak ada data"
- Saat menampilkan laporan keuangan, SELALU sertakan analisis naratif: kondisi profit/loss, pipeline order, dan 1-2 rekomendasi konkret yang actionable. Jangan hanya tampilkan angka.
- Untuk prediksi cash flow, jelaskan dengan bahasa sederhana: berapa potensi pendapatan dari pipeline yang ada, berapa yang kemungkinan besar akan convert, dan apa risikonya. Sertakan rekomendasi tindakan konkret.
- Emoji boleh tapi tidak berlebihan — gunakan untuk emphasis, bukan dekorasi
- NAMA BUKAN UUID: Selalu tampilkan nama asli. UUID hanya untuk kebutuhan teknis jika diminta
- Untuk data agen: tampilkan dalam bentuk tabel atau list yang rapi dengan semua kolom relevan
- Untuk navigasi: sertakan link internal seperti "/agents/UUID" hanya di teks markdown, jangan expose UUID mentah
- Sertakan "next step" atau rekomendasi tindakan setelah menampilkan data

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚫 GUARDRAILS — BATAS TOPIK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Lo BOLEH membantu semua hal yang berkaitan dengan Temantiket:
- Data sistem: klien, order, agen, kurs, profit, invoice, misi, poin, wallet, visa
- Operasional: umrah, haji, tiket penerbangan, visa student, visa VOA
- Konten bisnis: catatan operasional, template broadcast WA, itinerary, caption marketing
- Edit & format konten: rapikan catatan, tambah poin, buat versi broadcast, modifikasi template
- Kalkulasi bisnis: profit, margin, konversi mata uang
- Cara penggunaan fitur sistem, penjelasan alur, debugging flow

Lo TIDAK membantu:
- Politik, berita nasional/internasional yang tidak terkait bisnis travel
- Konten berbahaya, SARA, atau ilegal
- Hal yang sama sekali tidak ada kaitannya dengan bisnis/operasional Temantiket

CARA MENOLAK (hanya untuk hal yang benar-benar di luar zona):
Tolak singkat dan arahkan balik: "Wkwk itu di luar zona gue bro — gue cuma bisa bantu urusan Temantiket. Ada yang mau dicek dari sistem?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📥 KEMAMPUAN INPUT DATA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Kamu bisa tambah klien baru, buat order, dan update data langsung ke sistem.
Cara kerjamu saat user input data:
1. Ekstrak semua informasi dari cerita user secara cerdas (nama, HP, tipe order, harga, dll)
2. Jika ada info yang kurang untuk field wajib, tanya dengan spesifik — jangan tanya semua sekaligus
3. SELALU gunakan confirm_action dulu sebelum menyimpan — tampilkan ringkasan data yang akan disimpan
4. Tunggu user bilang 'ya', 'oke', 'lanjut', atau konfirmasi sejenis sebelum eksekusi
5. Setelah berhasil simpan, kasih tahu user dengan jelas dan refresh data terkait
6. Jika user cerita tentang klien yang sudah ada (misal update paspor), cari dulu dengan get_clients
7. Untuk hapus data (delete_client, delete_order): WAJIB gunakan confirm_action dulu dengan pesan peringatan yang jelas bahwa data tidak bisa dikembalikan. Contoh summary: '⚠️ HAPUS PERMANEN: Klien Ahmad Fauzi dan semua riwayat ordernya akan dihapus. Tindakan ini tidak bisa dibatalkan.' Baru eksekusi setelah user konfirmasi.

Contoh flow yang benar:
User: 'ada jamaah baru namanya Ahmad Fauzi HP 081234567890 mau umrah'
AITEM: gunakan confirm_action dengan summary lengkap
User: 'ya betul'
AITEM: eksekusi create_client lalu create_order

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CARA INPUT ORDER YANG BENAR:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Sistem profit order menggunakan rumus:
Net Profit = (totalPrice - costPrice) - pelaksanaFee - voaOpCost - kurirOpCost

VISA STUDENT (visa_pelajar):
- totalPrice = harga yang dibayar klien
- costPrice = 0 (tidak ada modal ke supplier)
- metadata.pelaksanaId = user_id staff yang mengerjakan visa
- metadata.pelaksanaFee = fee staff dalam IDR (default 200.000)
- paidAmount = uang yang benar-benar diterima (setelah dikurangi pengembalian)
- paymentStatus = REFUNDED jika ada uang dikembalikan ke klien
- notes = catat detail pengembalian dana

Contoh kasus: Klien bayar Rp 1.300.000, dikembalikan Rp 900.000, fee staff Naufal Rp 200.000
→ totalPrice: 1300000
→ costPrice: 0
→ paidAmount: 400000 (1.300.000 - 900.000)
→ paymentStatus: REFUNDED
→ metadata.pelaksanaFee: 200000
→ metadata.pelaksanaId: [id Naufal]
→ notes: 'Dikembalikan Rp 900.000 ke klien karena visa tidak jadi'
→ Net Profit otomatis: 400.000 - 200.000 = Rp 200.000 ✓

VISA VOA:
- totalPrice = harga jual ke klien (dalam EGP atau IDR)
- costPrice = harga modal ke mandub/supplier (dalam EGP atau IDR)
- currency = EGP jika transaksi dalam EGP, IDR jika dalam IDR
- metadata.voaFieldAgentId = user_id agent lapangan
- metadata.voaAgentFee = fee agent lapangan dalam IDR
- metadata.voaTransportFee = biaya transport dalam IDR (opsional)
- paidAmount = sama dengan totalPrice jika lunas
- paymentStatus = PAID jika lunas

Contoh kasus: Klien bayar 185 USD, modal 145 USD, fee Fairuz Rp 300.000
PENTING: Sistem tidak punya currency USD untuk visa_voa, konversi ke IDR dulu.
→ totalPrice: 3348500 (185 x 18100)
→ costPrice: 2624500 (145 x 18100)
→ currency: IDR
→ metadata.voaAgentFee: 300000
→ metadata.voaFieldAgentId: [id Fairuz]
→ paymentStatus: PAID
→ Net Profit otomatis: (3.348.500 - 2.624.500) - 300.000 = Rp 424.000 ✓

JANGAN buat order terpisah untuk fee staff atau pengembalian dana.
Semua dimasukkan ke 1 order dengan field yang tepat.
Gunakan confirm_action dulu sebelum menyimpan, tampilkan breakdown profit yang akan tercatat.

CARA ASSIGN AGENT LAPANGAN / PELAKSANA:
1. Jika user sebut nama (misal 'Fairuz' atau 'Naufal'), SELALU gunakan get_members dulu untuk cari userId-nya
2. Gunakan userId yang didapat sebagai voaFieldAgentId atau pelaksanaId
3. JANGAN tulis nama di notes sebagai pengganti — harus pakai userId yang benar
4. Contoh flow:
   User: 'fee Fairuz 300.000'
   AITEM: get_members({search: 'Fairuz'}) → dapat userId: 'abc-123'
   AITEM: create_order({..., voaFieldAgentId: 'abc-123', voaAgentFee: 300000})\`\`;
}

// ── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ result: string; displayData: Record<string, unknown>; success: boolean }> {
  const auth = useAuthStore.getState();
  const ratesStore = useRatesStore.getState();
  const agencyId = auth.user?.agencyId ?? "";
  const userId = auth.user?.id ?? "";
  const egpRate = ratesStore.rates.EGP ?? 515;

  try {
    switch (toolName) {
      case "get_dashboard_summary": {
        const [clients, orders, missions, agentPoints, members] = await Promise.all([
          listClients(),
          listOrders(),
          listMissions(agencyId),
          listAgentPoints(),
          useAuthStore.getState().listMembers(),
        ]);
        const memberNameById = new Map(members.map((m) => [m.userId, m.displayName]));
        const completedOrders = orders.filter((o) => o.status === "Completed");
        const totalRevIDR = completedOrders.reduce((s, o) => s + revenueIDR(o, egpRate), 0);
        const totalProfitIDR = completedOrders.reduce((s, o) => s + netProfitIDR(o, egpRate), 0);
        const activeMissions = missions.filter(
          (m) => new Date(m.deadline) > new Date(),
        );
        const pointMap = sumPointsByAgent(agentPoints);
        const topAgentEntry = Array.from(pointMap.entries()).sort((a, b) => b[1] - a[1])[0];

        const summary = {
          totalClients: clients.length,
          totalOrders: orders.length,
          completedOrders: completedOrders.length,
          totalRevenue: fmtIDR(totalRevIDR),
          totalProfit: fmtIDR(totalProfitIDR),
          activeMissions: activeMissions.length,
          currentRates: {
            EGP: ratesStore.rates.EGP,
            SAR: ratesStore.rates.SAR,
            USD: ratesStore.rates.USD,
          },
          topAgent: topAgentEntry
            ? { name: memberNameById.get(topAgentEntry[0]) ?? "Agen", points: topAgentEntry[1] }
            : null,
        };

        return {
          result: JSON.stringify(summary),
          displayData: { type: "dashboard_summary", ...summary },
          success: true,
        };
      }

      case "get_clients": {
        const { search, limit = 10 } = args as { search?: string; limit?: number };
        const all = await listClients();
        const filtered = search
          ? all.filter(
              (c) =>
                c.name.toLowerCase().includes(search.toLowerCase()) ||
                c.phone.includes(search),
            )
          : all;
        const results = filtered.slice(0, limit).map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          email: c.email ?? null,
          gender: c.gender ?? null,
          passportNumber: c.passportNumber ?? null,
        }));
        return {
          result: JSON.stringify({ total: filtered.length, clients: results }),
          displayData: { type: "clients_list", total: filtered.length, clients: results },
          success: true,
        };
      }

      case "get_orders": {
        const { type, status, limit = 10 } = args as {
          type?: string;
          status?: string;
          limit?: number;
        };
        const all = await listOrders();
        const filtered = all.filter((o) => {
          if (type && o.type !== type) return false;
          if (status && o.status !== status) return false;
          return true;
        });
        const results = filtered.slice(0, limit).map((o) => ({
          id: o.id,
          type: o.type,
          status: o.status,
          title: o.title,
          totalPrice: o.totalPrice,
          currency: o.currency,
          clientId: o.clientId,
          createdAt: o.createdAt,
        }));
        return {
          result: JSON.stringify({ total: filtered.length, orders: results }),
          displayData: { type: "orders_list", total: filtered.length, orders: results },
          success: true,
        };
      }

      case "create_itinerary": {
        const { text } = args as { text: string };
        if (!text?.trim()) throw new Error("Teks itinerary tidak boleh kosong");
        const { data, usedAI } = await extractItinerary(text);
        const legSummaries = data.legs.map(
          (l) =>
            `${l.fromCode ?? "?"}→${l.toCode ?? "?"} ${l.flightNumber ?? ""} ${l.departDate ?? ""} ${l.departTime ?? ""}`.trim(),
        );
        return {
          result: JSON.stringify({ ...data, usedAI }),
          displayData: {
            type: "itinerary_result",
            pnr: data.pnr,
            passengerName: data.passengerName,
            legs: legSummaries,
            totalLegs: data.legs.length,
            usedAI,
          },
          success: true,
        };
      }

      case "update_exchange_rate": {
        const { currency, rate } = args as { currency: string; rate: number };
        if (!["EGP", "SAR", "USD"].includes(currency))
          throw new Error("Mata uang tidak valid. Pilih EGP, SAR, atau USD.");
        if (!rate || rate <= 0) throw new Error("Rate harus lebih dari 0");

        ratesStore.setMode("manual");
        ratesStore.setManualRate(currency as "EGP" | "SAR" | "USD", rate);

        return {
          result: JSON.stringify({ currency, rate, mode: "manual" }),
          displayData: {
            type: "rate_updated",
            currency,
            rate: `Rp ${rate.toLocaleString("id-ID")}`,
            message: `Kurs ${currency} berhasil diupdate ke Rp ${rate.toLocaleString("id-ID")}/${currency}`,
          },
          success: true,
        };
      }

      case "create_daily_mission": {
        const { title, description, rewardPoints = 10, deadline } = args as {
          title: string;
          description: string;
          rewardPoints: number;
          deadline: string;
        };
        if (!title?.trim()) throw new Error("Judul misi tidak boleh kosong");
        if (!agencyId) throw new Error("Agency ID tidak ditemukan — pastikan sudah login");

        const mission = await createMission(
          agencyId,
          { title, description, rewardPoints, deadline },
          userId,
        );
        if (!mission) throw new Error("Gagal membuat misi — cek koneksi Supabase");

        return {
          result: JSON.stringify(mission),
          displayData: {
            type: "mission_created",
            title: mission.title,
            rewardPoints: mission.rewardPoints,
            deadline: new Date(mission.deadline).toLocaleString("id-ID"),
          },
          success: true,
        };
      }

      case "calculate_profit": {
        const {
          sellingPrice,
          costPrice,
          currency = "IDR",
        } = args as {
          sellingPrice: number;
          costPrice: number;
          currency?: string;
        };
        const profit = sellingPrice - costPrice;
        const marginPct =
          sellingPrice > 0 ? ((profit / sellingPrice) * 100).toFixed(1) : "0.0";

        const toIDR = (v: number) => {
          if (currency === "EGP") return v * egpRate;
          if (currency === "SAR") return v * (ratesStore.rates.SAR ?? 4250);
          if (currency === "USD") return v * (ratesStore.rates.USD ?? 16000);
          return v;
        };

        const profitIDRVal = toIDR(profit);
        const revenueIDRVal = toIDR(sellingPrice);

        const fmt = (v: number) =>
          currency === "IDR"
            ? fmtIDR(v)
            : `${currency} ${v.toLocaleString("id-ID")}`;

        return {
          result: JSON.stringify({ sellingPrice, costPrice, profit, marginPct, currency }),
          displayData: {
            type: "profit_calc",
            hargaJual: fmt(sellingPrice),
            hargaModal: fmt(costPrice),
            profit: fmt(profit),
            profitIDR: fmtIDR(profitIDRVal),
            revenueIDR: fmtIDR(revenueIDRVal),
            marginPct: `${marginPct}%`,
            currency,
          },
          success: true,
        };
      }

      case "get_agent_performance": {
        const [orders, agentPoints, members] = await Promise.all([
          listOrders(),
          listAgentPoints(),
          useAuthStore.getState().listMembers(),
        ]);
        const memberNameById = new Map(members.map((m) => [m.userId, m.displayName]));
        const pointMap = sumPointsByAgent(agentPoints);
        const ordersByAgent = new Map<string, number>();
        for (const o of orders) {
          if (o.createdByAgent) {
            ordersByAgent.set(
              o.createdByAgent,
              (ordersByAgent.get(o.createdByAgent) ?? 0) + 1,
            );
          }
        }
        const agentList = Array.from(pointMap.entries())
          .map(([agentId, points]) => ({
            name: memberNameById.get(agentId) ?? `Agen (${agentId.slice(0, 6)})`,
            agentId,
            points,
            totalOrders: ordersByAgent.get(agentId) ?? 0,
          }))
          .sort((a, b) => b.points - a.points);

        return {
          result: JSON.stringify({ agents: agentList }),
          displayData: {
            type: "agent_performance",
            totalAgents: agentList.length,
            agents: agentList.slice(0, 5),
          },
          success: true,
        };
      }

      case "generate_invoice": {
        const { clientName, orderId, orderType } = args as {
          clientName?: string;
          orderId?: string;
          orderType?: string;
        };

        let targetOrder = null;
        let targetClient = null;

        if (orderId) {
          targetOrder = await getOrder(orderId);
        }

        if (!targetOrder) {
          const [allOrders, allClients] = await Promise.all([listOrders(), listClients()]);
          let filteredOrders = allOrders;
          if (orderType) filteredOrders = filteredOrders.filter((o) => o.type === orderType);

          if (clientName) {
            const matchedClients = allClients.filter((c) =>
              c.name.toLowerCase().includes(clientName.toLowerCase()),
            );
            if (matchedClients.length === 0) throw new Error(`Klien dengan nama "${clientName}" tidak ditemukan.`);
            targetClient = matchedClients[0];
            filteredOrders = filteredOrders.filter((o) => o.clientId === targetClient!.id);
          }

          if (filteredOrders.length === 0) throw new Error("Tidak ada order yang ditemukan. Coba dengan nama klien atau ID order yang lebih spesifik.");
          targetOrder = filteredOrders[0];

          if (!targetClient && targetOrder.clientId) {
            const allClients2 = await listClients();
            targetClient = allClients2.find((c) => c.id === targetOrder!.clientId) ?? null;
          }
        } else if (!targetClient && targetOrder?.clientId) {
          const allClients2 = await listClients();
          targetClient = allClients2.find((c) => c.id === targetOrder.clientId) ?? null;
        }

        if (!targetOrder) throw new Error("Order tidak ditemukan.");

        const settings = loadIghAdminSettings();
        const { templateDataUrl } = useInvoiceStore.getState();
        const invoiceNumber = nextInvoiceNumber();

        const pdfBytes = await generateInvoicePdfRemote({
          invoiceNumber,
          invoiceDate: todayString(),
          order: targetOrder,
          client: targetClient,
          agencyName: "Temantiket",
          agencyPhone: settings.adminWhatsapp,
          agencyInstagram: settings.adminInstagram,
          templateDataUrl,
        });

        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        const label = `${invoiceNumber} · ${targetClient?.name ?? targetOrder.title ?? targetOrder.id.slice(0, 8)}`;
        useInvoiceStore.getState().setLastInvoice(dataUrl, label);

        return {
          result: JSON.stringify({
            success: true,
            invoiceNumber,
            clientName: targetClient?.name ?? null,
            orderTitle: targetOrder.title,
            total: targetOrder.totalPrice,
            currency: targetOrder.currency,
          }),
          displayData: {
            type: "invoice_ready",
            invoiceNumber,
            clientName: targetClient?.name ?? "—",
            orderTitle: targetOrder.title ?? targetOrder.type,
            total: targetOrder.currency === "EGP"
              ? `EGP ${Number(targetOrder.totalPrice).toLocaleString("id-ID")}`
              : new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(Number(targetOrder.totalPrice)),
            label,
            dataUrl,
          },
          success: true,
        };
      }

      case "get_bc_templates": {
        const { search, category, limit = 10 } = args as {
          search?: string;
          category?: string;
          limit?: number;
        };
        const all = await listTemplates();
        const filtered = all.filter((t) => {
          if (category && t.category !== category) return false;
          if (search) {
            const q = search.toLowerCase();
            return t.title.toLowerCase().includes(q) || t.body.toLowerCase().includes(q);
          }
          return true;
        });
        const results = filtered.slice(0, limit).map((t) => ({
          id: t.id,
          title: t.title,
          category: t.category,
          bodyPreview: t.body.slice(0, 200),
          variables: (t.body.match(/\{\{[A-Z_]+\}\}/g) ?? []).join(", "),
        }));
        return {
          result: JSON.stringify({ total: filtered.length, templates: results }),
          displayData: { type: "bc_templates_list", total: filtered.length, templates: results },
          success: true,
        };
      }

      case "get_order_detail": {
        const { orderId, clientName, orderType } = args as {
          orderId?: string;
          clientName?: string;
          orderType?: string;
        };
        let targetOrder = null;
        let targetClient = null;

        if (orderId) {
          targetOrder = await getOrder(orderId);
        }
        if (!targetOrder) {
          const [allOrders, allClients] = await Promise.all([listOrders(), listClients()]);
          let filtered = allOrders;
          if (orderType) filtered = filtered.filter((o) => o.type === orderType);
          if (clientName) {
            const matched = allClients.filter((c) => c.name.toLowerCase().includes(clientName.toLowerCase()));
            if (matched.length > 0) {
              targetClient = matched[0];
              filtered = filtered.filter((o) => o.clientId === targetClient!.id);
            }
          }
          if (filtered.length === 0) throw new Error("Order tidak ditemukan — coba dengan nama klien atau ID order yang lebih spesifik.");
          targetOrder = filtered[0];
        }
        if (!targetOrder) throw new Error("Order tidak ditemukan.");
        if (!targetClient && targetOrder.clientId) {
          const allClients2 = await listClients();
          targetClient = allClients2.find((c) => c.id === targetOrder!.clientId) ?? null;
        }
        const detail = {
          id: targetOrder.id,
          type: targetOrder.type,
          title: targetOrder.title,
          status: targetOrder.status,
          totalPrice: targetOrder.totalPrice,
          costPrice: targetOrder.costPrice,
          currency: targetOrder.currency,
          notes: targetOrder.notes ?? null,
          createdAt: targetOrder.createdAt,
          client: targetClient ? { name: targetClient.name, phone: targetClient.phone, passportNumber: targetClient.passportNumber ?? null } : null,
        };
        return {
          result: JSON.stringify(detail),
          displayData: { type: "order_detail", ...detail },
          success: true,
        };
      }

      case "get_client_detail": {
        const { search } = args as { search: string };
        if (!search?.trim()) throw new Error("Nama atau nomor HP klien tidak boleh kosong");
        const [allClients, allOrders] = await Promise.all([listClients(), listOrders()]);
        const matched = allClients.filter((c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search),
        );
        if (matched.length === 0) throw new Error(`Klien "${search}" tidak ditemukan di sistem.`);
        const client = matched[0];
        const clientOrders = allOrders
          .filter((o) => o.clientId === client.id)
          .map((o) => ({
            id: o.id,
            type: o.type,
            status: o.status,
            title: o.title,
            totalPrice: o.totalPrice,
            currency: o.currency,
            createdAt: o.createdAt,
          }));
        const detail = {
          id: client.id,
          name: client.name,
          phone: client.phone,
          email: client.email ?? null,
          gender: client.gender ?? null,
          birthDate: client.birthDate ?? null,
          birthPlace: client.birthPlace ?? null,
          passportNumber: client.passportNumber ?? null,
          passportExpiry: client.passportExpiry ?? null,
          notes: client.notes ?? null,
          totalOrders: clientOrders.length,
          orders: clientOrders,
        };
        return {
          result: JSON.stringify(detail),
          displayData: { type: "client_detail", ...detail },
          success: true,
        };
      }

      case "get_agents": {
        const { search } = args as { search?: string };
        const [members, orders, agentPoints] = await Promise.all([
          useAuthStore.getState().listMembers(),
          listOrders(),
          listAgentPoints(),
        ]);
        const agents = members.filter((m) => m.role === "agent");
        const pointMap = sumPointsByAgent(agentPoints);
        const ordersByAgent = new Map<string, number>();
        const completedByAgent = new Map<string, number>();
        const revenueByAgent = new Map<string, number>();
        for (const o of orders) {
          if (o.createdByAgent) {
            ordersByAgent.set(o.createdByAgent, (ordersByAgent.get(o.createdByAgent) ?? 0) + 1);
            if (o.status === "Completed" || o.status === "Paid") {
              completedByAgent.set(o.createdByAgent, (completedByAgent.get(o.createdByAgent) ?? 0) + 1);
              revenueByAgent.set(o.createdByAgent, (revenueByAgent.get(o.createdByAgent) ?? 0) + revenueIDR(o, egpRate));
            }
          }
        }
        let filteredAgents = agents;
        if (search) {
          const q = search.toLowerCase();
          filteredAgents = agents.filter((a) =>
            a.displayName.toLowerCase().includes(q) || a.email.toLowerCase().includes(q),
          );
        }
        const agentList = filteredAgents.map((a) => {
          const txs = listWalletTxs(a.userId);
          const bal = walletBalance(txs);
          return {
            userId: a.userId,
            name: a.displayName,
            email: a.email,
            commissionPct: a.commissionPct,
            totalOrders: ordersByAgent.get(a.userId) ?? 0,
            completedOrders: completedByAgent.get(a.userId) ?? 0,
            totalRevenue: fmtIDR(revenueByAgent.get(a.userId) ?? 0),
            totalPoints: pointMap.get(a.userId) ?? 0,
            walletCreditIDR: fmtIDR(bal.totalCreditIDR),
            walletNetIDR: fmtIDR(bal.netIDR),
            profileLink: `/agents/${a.userId}`,
          };
        }).sort((a, b) => b.totalPoints - a.totalPoints);

        if (agentList.length === 0) {
          return {
            result: JSON.stringify({ total: 0, agents: [] }),
            displayData: { type: "agents_list", total: 0, agents: [], message: search ? `Agen dengan nama "${search}" tidak ditemukan.` : "Belum ada agen terdaftar di agency ini." },
            success: true,
          };
        }
        return {
          result: JSON.stringify({ total: agentList.length, agents: agentList }),
          displayData: { type: "agents_list", total: agentList.length, agents: agentList },
          success: true,
        };
      }

      case "get_financial_report": {
        const { range = "all" } = args as { range?: string };
        const [orders, allClients, members] = await Promise.all([
          listOrders(),
          listClients(),
          useAuthStore.getState().listMembers(),
        ]);
        const egpRateVal = ratesStore.rates.EGP ?? 515;
        const sarRateVal = ratesStore.rates.SAR ?? 4250;

        const now = new Date();
        const y = now.getFullYear();
        const mo = now.getMonth();
        let fromDate: Date | null = null;
        let toDate: Date | null = null;
        if (range === "this_month") { fromDate = new Date(y, mo, 1); toDate = new Date(y, mo + 1, 1); }
        else if (range === "last_month") { fromDate = new Date(y, mo - 1, 1); toDate = new Date(y, mo, 1); }
        else if (range === "this_year") { fromDate = new Date(y, 0, 1); toDate = new Date(y + 1, 0, 1); }

        const paidOrders = orders.filter((o) => {
          if (o.status !== "Paid" && o.status !== "Completed") return false;
          if (fromDate || toDate) {
            const d = new Date((o.metadata as Record<string,unknown>)?.paidAt as string ?? o.updatedAt ?? o.createdAt);
            if (fromDate && d < fromDate) return false;
            if (toDate && d >= toDate) return false;
          }
          return true;
        });

        const clientNameById = new Map(allClients.map((c) => [c.id, c.name]));
        const memberById = new Map(members.map((m) => [m.userId, { role: m.role, displayName: m.displayName, commissionPct: m.commissionPct }]));
        const productComm = loadProductCommissions();
        const entries = buildLedgerEntries(paidOrders, clientNameById, egpRateVal, sarRateVal, memberById, productComm);
        const stats = ledgerSummary(entries);

        // Per-agent commission breakdown
        const agentCommissions: Array<{ name: string; commission: string }> = [];
        const agentCommMap = new Map<string, number>();
        for (const e of entries) {
          if (e.isCommission && e.agentId) {
            agentCommMap.set(e.agentId, (agentCommMap.get(e.agentId) ?? 0) + Math.abs(e.profitIDR));
          }
        }
        for (const [id, amount] of agentCommMap.entries()) {
          const name = memberById.get(id)?.displayName ?? `Agen (${id.slice(0, 6)})`;
          agentCommissions.push({ name, commission: fmtIDR(amount) });
        }

        const rangeLabel: Record<string, string> = { this_month: "Bulan Ini", last_month: "Bulan Lalu", this_year: "Tahun Ini", all: "Semua Waktu" };

        // Generate narrative analysis
        const revenueThisRange = stats.totalRevenue ?? 0;
        const profitThisRange  = stats.netProfit ?? 0;
        const cancelledOrders  = orders.filter((o) => o.status === "Cancelled").length;
        const draftOrders      = orders.filter((o) => o.status === "Draft").length;
        const confirmedOrders  = orders.filter((o) => o.status === "Confirmed").length;
        const marginPct        = revenueThisRange > 0 ? ((profitThisRange / revenueThisRange) * 100).toFixed(1) : "0.0";

        const narrative = [
          `📊 **Ringkasan Keuangan — ${rangeLabel[range] ?? "Semua Waktu"}**`,
          `Total revenue: ${fmtIDR(revenueThisRange)} | Net profit: ${fmtIDR(profitThisRange)}`,
          profitThisRange > 0
            ? `✅ Bisnis dalam kondisi profit dengan margin ${marginPct}%`
            : `⚠️ Perlu perhatian — profit masih negatif`,
          ``,
          `📌 **Kondisi Pipeline**`,
          `- ${draftOrders} order masih Draft (belum dikonfirmasi)`,
          `- ${confirmedOrders} order Confirmed (menunggu pembayaran)`,
          cancelledOrders > 0
            ? `- ⚠️ ${cancelledOrders} order Cancelled — cek penyebabnya`
            : `- Tidak ada order Cancelled`,
          ``,
          draftOrders > 3
            ? `💡 **Rekomendasi:** Ada ${draftOrders} order Draft yang perlu di-follow up. Prioritaskan konversi ke Confirmed untuk meningkatkan cash flow.`
            : `💡 Pipeline sehat. Fokus ke akuisisi klien baru.`,
        ].join("\n");

        return {
          result: JSON.stringify({ range, rangeLabel: rangeLabel[range], stats, agentCommissions, narrative }),
          displayData: {
            type: "financial_report",
            rangeLabel: rangeLabel[range] ?? "Semua Waktu",
            transactionCount: stats.count,
            totalRevenue: fmtIDR(stats.totalRevenue),
            totalGrossProfit: fmtIDR(stats.totalProfit),
            totalCommission: fmtIDR(stats.totalCommission),
            totalVoaOpex: fmtIDR(stats.totalVoaOpex),
            totalKurirOpex: fmtIDR(stats.totalKurirOpex),
            totalPelaksana: fmtIDR(stats.totalPelaksana),
            netProfit: fmtIDR(stats.netProfit),
            avgMarginPct: `${stats.avgMargin.toFixed(1)}%`,
            agentCommissions,
            narrative,
          },
          success: true,
        };
      }

      case "edit_content": {
        const { proposedContent, editSummary, targetType } = args as {
          proposedContent: string;
          editSummary: string;
          targetType: string;
        };
        if (!proposedContent?.trim()) throw new Error("Konten yang diedit tidak boleh kosong");

        return {
          result: JSON.stringify({ proposedContent, editSummary, targetType, status: "preview_ready" }),
          displayData: {
            type: "edit_preview",
            proposedContent,
            editSummary,
            targetType,
          },
          success: true,
        };
      }

      case "create_client": {
        const { addClient } = useClientsStore.getState();
        const clientData = {
          name: args.name as string,
          phone: (args.phone as string) || null,
          email: (args.email as string) || null,
          gender: (args.gender as "L" | "P") || null,
          birthDate: (args.birthDate as string) || null,
          birthPlace: (args.birthPlace as string) || null,
          passportNumber: (args.passportNumber as string) || null,
          passportExpiry: (args.passportExpiry as string) || null,
          notes: (args.notes as string) || null,
        };
        const newClient = await addClient(clientData);
        return {
          result: JSON.stringify({ success: true, clientId: newClient?.id, name: clientData.name }),
          displayData: { type: "create_client", client: clientData, id: newClient?.id },
          success: true,
        };
      }

      case "create_order": {
        const { addOrder } = useOrdersStore.getState();
        const agencyId = useAuthStore.getState().user?.agencyId;
        const userId = useAuthStore.getState().user?.id;
        const orderData = {
          clientId: args.clientId as string,
          type: args.type as string,
          title: args.title as string,
          totalPrice: args.totalPrice as number,
          costPrice: (args.costPrice as number) || 0,
          currency: (args.currency as string) || "IDR",
          status: (args.status as string) || "Draft",
          notes: (args.notes as string) || null,
          departureDateStr: (args.departureDateStr as string) || null,
          agencyId,
          createdByAgent: userId,
          metadata: {
            ...(args.pelaksanaId ? { pelaksanaId: args.pelaksanaId, pelaksanaFee: args.pelaksanaFee ?? 200000 } : {}),
            ...(args.voaFieldAgentId ? {
              voaFieldAgentId: args.voaFieldAgentId,
              voaAgentFee: args.voaAgentFee ?? 0,
              voaTransportFee: args.voaTransportFee ?? 0,
            } : {}),
          },
          paidAmount: (args.paidAmount as number) ?? (args.totalPrice as number),
          paymentStatus: (args.paymentStatus as string) ?? "PAID",
        };
        const newOrder = await addOrder(orderData);
        return {
          result: JSON.stringify({ success: true, orderId: newOrder?.id, title: orderData.title }),
          displayData: { type: "create_order", order: orderData, id: newOrder?.id },
          success: true,
        };
      }

      case "update_order_status": {
        const { patchOrder } = useOrdersStore.getState();
        await patchOrder(args.orderId as string, {
          status: args.status as string,
          ...(args.notes ? { notes: args.notes as string } : {}),
        });
        return {
          result: JSON.stringify({ success: true, orderId: args.orderId, newStatus: args.status }),
          displayData: { type: "update_order_status", orderId: args.orderId, status: args.status },
          success: true,
        };
      }

      case "update_client": {
        const { patchClient } = useClientsStore.getState();
        const { clientId, ...rest } = args as Record<string, string>;
        const patch = Object.fromEntries(
          Object.entries(rest).filter(([, v]) => v !== undefined && v !== null && v !== "")
        );
        await patchClient(clientId, patch);
        return {
          result: JSON.stringify({ success: true, clientId, updated: Object.keys(patch) }),
          displayData: { type: "update_client", clientId, updated: patch },
          success: true,
        };
      }

      case "confirm_action": {
        return {
          result: JSON.stringify({
            status: "awaiting_confirmation",
            actionType: args.actionType,
            summary: args.summary,
            data: args.data,
          }),
          displayData: {
            type: "confirm_action",
            actionType: args.actionType,
            summary: args.summary as string,
            data: args.data,
          },
          success: true,
        };
      }

      case "generate_marketing_caption": {
        const packagesStore = usePackagesStore.getState();
        if (packagesStore.items.length === 0) await packagesStore.refresh();
        const packages = usePackagesStore.getState().items;

        let targetPackage = args.packageId
          ? packages.find((p) => p.id === args.packageId)
          : packages.filter((p) => p.status === "Confirmed" || p.status === "Calculated" || p.status === "Draft")[0];

        if (!targetPackage) targetPackage = packages[0];
        if (!targetPackage) {
          return {
            result: JSON.stringify({ error: "Tidak ada paket aktif di database" }),
            displayData: { type: "error", message: "Buat paket dulu di halaman Paket & Trip" },
            success: false,
          };
        }

        const platform = (args.platform as string) ?? "both";
        const tone = (args.tone as string) ?? "casual";

        const packageInfo = {
          name: targetPackage.name,
          price: targetPackage.totalIDR,
          currency: "IDR",
          destination: targetPackage.destination,
          duration: targetPackage.days,
          quota: targetPackage.people,
          departDate: targetPackage.departureDate ?? null,
        };

        const captionRes = await callAI({
          model: "openai/gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `Kamu adalah copywriter marketing travel umrah/haji profesional Indonesia.
Buat caption yang menarik, authentic, dan menggunakan data nyata dari paket.
Tone: ${tone}. Platform: ${platform}.
Format output JSON: { "instagram": "...", "whatsapp": "..." }
Untuk Instagram: gunakan emoji, hashtag relevan, max 2200 karakter.
Untuk WhatsApp: format broadcast yang personal, tanpa hashtag, max 500 karakter.
Jika platform=instagram, isi whatsapp dengan string kosong. Jika platform=whatsapp, sebaliknya.`,
            },
            {
              role: "user",
              content: `Buatkan caption marketing untuk paket ini:\n${JSON.stringify(packageInfo, null, 2)}`,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.8,
          max_tokens: 1000,
        });

        const captionData = await captionRes.json() as { choices?: Array<{ message?: { content?: string } }> };
        const captions = JSON.parse(captionData.choices?.[0]?.message?.content ?? "{}") as { instagram?: string; whatsapp?: string };

        return {
          result: JSON.stringify({ success: true, package: packageInfo, captions }),
          displayData: {
            type: "marketing_caption",
            packageName: targetPackage.name,
            instagram: captions.instagram ?? "",
            whatsapp: captions.whatsapp ?? "",
            platform,
          },
          success: true,
        };
      }

      case "auto_assign_missions": {
        const agencyId = useAuthStore.getState().user?.agencyId ?? "";
        const createdBy = useAuthStore.getState().user?.id ?? "";
        const minOrders = (args.minOrders as number) ?? 3;
        const rewardPts = (args.rewardPoints as number) ?? 15;

        const [members, allOrdersForMission] = await Promise.all([
          useAuthStore.getState().listMembers(),
          listOrders(),
        ]);
        const agents = members.filter((m) => m.role === "agent");

        const thisMonthStr = new Date().toISOString().slice(0, 7);
        const thisMonthOrders = allOrdersForMission.filter((o) => (o.createdAt ?? "").startsWith(thisMonthStr));

        const underperformers = agents.filter((agent) => {
          const agentOrders = thisMonthOrders.filter((o) => o.createdByAgent === agent.userId);
          return agentOrders.length < minOrders;
        });

        if (underperformers.length === 0) {
          return {
            result: JSON.stringify({ success: true, message: "Semua agen sudah memenuhi target!", assigned: 0 }),
            displayData: { type: "auto_missions", assigned: 0, message: "Semua agen sudah on track! 🎉" },
            success: true,
          };
        }

        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 7);
        deadline.setHours(23, 59, 0, 0);

        const missionTitle = (args.missionTitle as string) || `Target ${minOrders} Order Bulan Ini 🎯`;
        const missionDesc = (args.missionDescription as string) ||
          `Kamu perlu mencapai minimal ${minOrders} order bulan ini. Setiap order yang berhasil closed akan mendekatkanmu ke target. Yuk gas! 💪`;

        const missionResults = await Promise.allSettled(
          underperformers.map(() =>
            createMission(agencyId, {
              title: missionTitle,
              description: missionDesc,
              rewardPoints: rewardPts,
              deadline: deadline.toISOString(),
            }, createdBy)
          )
        );

        const successCount = missionResults.filter((r) => r.status === "fulfilled").length;

        return {
          result: JSON.stringify({
            success: true,
            assigned: successCount,
            agents: underperformers.map((a) => a.displayName),
            missionTitle,
            rewardPoints: rewardPts,
          }),
          displayData: {
            type: "auto_missions",
            assigned: successCount,
            agents: underperformers.map((a) => a.displayName),
            missionTitle,
            rewardPoints: rewardPts,
          },
          success: true,
        };
      }

      case "predict_cashflow": {
        const allOrders = await listOrders();
        const egpRateLocal = ratesStore.rates.EGP ?? 515;

        const draftOrdersList     = allOrders.filter((o) => o.status === "Draft");
        const confirmedOrdersList  = allOrders.filter((o) => o.status === "Confirmed");

        const draftPotential     = draftOrdersList.reduce((sum, o) => sum + revenueIDR(o, egpRateLocal), 0);
        const confirmedPotential = confirmedOrdersList.reduce((sum, o) => sum + revenueIDR(o, egpRateLocal), 0);

        const estimatedRevenue = (draftPotential * 0.4) + (confirmedPotential * 0.8);

        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        const lastMonthStr = lastMonth.toISOString().slice(0, 7);
        const lastMonthRevenue = allOrders
          .filter((o) => o.status === "Completed" || o.status === "Paid")
          .filter((o) => (o.createdAt ?? "").startsWith(lastMonthStr))
          .reduce((sum, o) => sum + revenueIDR(o, egpRateLocal), 0);

        const trend = lastMonthRevenue > 0
          ? ((estimatedRevenue - lastMonthRevenue) / lastMonthRevenue * 100).toFixed(1)
          : null;

        const warnings: string[] = [];
        if (draftOrdersList.length === 0 && confirmedOrdersList.length === 0) {
          warnings.push("⚠️ KRITIS: Pipeline kosong! Tidak ada order aktif sama sekali.");
        } else if (estimatedRevenue < lastMonthRevenue * 0.5) {
          warnings.push("⚠️ Pipeline sangat tipis — estimasi revenue bulan depan turun >50% dari bulan lalu.");
        } else if (draftOrdersList.length > confirmedOrdersList.length * 2) {
          warnings.push("💡 Banyak order masih Draft — perlu follow up aktif untuk konversi ke Confirmed.");
        }

        const cashflowResult = {
          draftOrders: draftOrdersList.length,
          confirmedOrders: confirmedOrdersList.length,
          draftPotential,
          confirmedPotential,
          estimatedRevenue,
          lastMonthRevenue,
          trend,
          warnings,
          breakdown: [
            { label: "Order Draft (estimasi 40% convert)", value: draftPotential * 0.4, count: draftOrdersList.length },
            { label: "Order Confirmed (estimasi 80% lunas)", value: confirmedPotential * 0.8, count: confirmedOrdersList.length },
          ],
        };

        return {
          result: JSON.stringify(cashflowResult),
          displayData: { type: "cashflow_prediction", ...cashflowResult },
          success: true,
        };
      }

      case "extract_and_attach_itinerary": {
        const { patchOrder: patchOrd, orders: allFlightOrders } = useOrdersStore.getState();

        const itinerary = await extractItinerary(args.rawText as string);
        if (!itinerary || itinerary.legs.length === 0) {
          return {
            result: JSON.stringify({ error: "Tidak bisa mengekstrak data penerbangan dari teks ini" }),
            displayData: { type: "error", message: "Ekstraksi PNR gagal — pastikan format teks benar" },
            success: false,
          };
        }

        let targetOrderId = args.orderId as string | undefined;

        if (!targetOrderId) {
          const flightOrders = allFlightOrders.filter((o: { type: string }) => o.type === "flight");
          if (args.clientName) {
            const clients = await listClients();
            const matched = clients.find((c) =>
              c.name.toLowerCase().includes((args.clientName as string).toLowerCase())
            );
            if (matched) {
              const clientOrder = flightOrders.find((o: { clientId: string }) => o.clientId === matched.id);
              if (clientOrder) targetOrderId = (clientOrder as { id: string }).id;
            }
          }
          if (!targetOrderId && itinerary.passengerName) {
            const clients = await listClients();
            const matched = clients.find((c) =>
              c.name.toLowerCase().includes(itinerary.passengerName!.toLowerCase().split(" ")[0])
            );
            if (matched) {
              const clientOrder = flightOrders.find((o: { clientId: string }) => o.clientId === matched.id);
              if (clientOrder) targetOrderId = (clientOrder as { id: string }).id;
            }
          }
        }

        const summary = {
          pnr: itinerary.pnr,
          passenger: itinerary.passengerName,
          legs: itinerary.legs.map((l) => `${l.flightNumber} ${l.fromCode}→${l.toCode} ${l.departDate} ${l.departTime}`),
          totalPrice: itinerary.totalPrice,
          currency: itinerary.priceCurrency,
        };

        if (targetOrderId) {
          await patchOrd(targetOrderId, {
            ...(itinerary.totalPrice ? { totalPrice: itinerary.totalPrice } : {}),
          });
        }

        return {
          result: JSON.stringify({ success: true, orderId: targetOrderId, itinerary: summary }),
          displayData: { type: "itinerary_extracted", itinerary: summary, orderId: targetOrderId, attached: !!targetOrderId },
          success: true,
        };
      }

      case "delete_client": {
        const { removeClient } = useClientsStore.getState();
        await removeClient(args.clientId as string);
        return {
          result: JSON.stringify({ success: true, clientId: args.clientId, deleted: true }),
          displayData: {
            type: "delete_client",
            clientId: args.clientId,
            clientName: args.clientName ?? "Klien",
            message: `Klien "${args.clientName ?? args.clientId}" berhasil dihapus.`,
          },
          success: true,
        };
      }

      case "delete_order": {
        const { removeOrder } = useOrdersStore.getState();
        await removeOrder(args.orderId as string);
        return {
          result: JSON.stringify({ success: true, orderId: args.orderId, deleted: true }),
          displayData: {
            type: "delete_order",
            orderId: args.orderId,
            orderTitle: args.orderTitle ?? "Order",
            message: `Order "${args.orderTitle ?? args.orderId}" berhasil dihapus.`,
          },
          success: true,
        };
      }

      case "get_members": {
        const { search, role } = args as { search?: string; role?: string };
        const members = await useAuthStore.getState().listMembers();
        let filtered = members;
        if (role && role !== "all") {
          filtered = filtered.filter((m) => m.role === role);
        }
        if (search) {
          const q = search.toLowerCase();
          filtered = filtered.filter((m) =>
            m.displayName.toLowerCase().includes(q) ||
            m.email.toLowerCase().includes(q)
          );
        }
        const list = filtered.map((m) => ({
          userId: m.userId,
          name: m.displayName,
          email: m.email,
          role: m.role,
        }));
        return {
          result: JSON.stringify({ members: list, total: list.length }),
          displayData: { type: "members_list", members: list },
          success: true,
        };
      }

      default:
        throw new Error(`Tool tidak dikenal: ${toolName}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Terjadi error tidak dikenal";
    return {
      result: JSON.stringify({ error: msg }),
      displayData: { type: "error", message: msg },
      success: false,
    };
  }
}

// ── Main chat function ────────────────────────────────────────────────────────

export async function sendAIMessage(
  messages: ChatMessage[],
  pageContext?: PageContext,
): Promise<AIChatResponse> {
  const auth = useAuthStore.getState();
  const userRole = auth.user?.role ?? "owner";
  const ctx: PageContext | undefined = pageContext
    ? { ...pageContext, userRole }
    : undefined;

  const fullMessages = [
    { role: "system", content: buildSystemPrompt(ctx) },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const toolResults: ToolResult[] = [];

  const MAX_ITERATIONS = 8;
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const response = await callAIAssistant({
      model: "gpt-4o-mini",
      messages: fullMessages,
      tools: TOOLS,
      tool_choice: "auto",
      temperature: 0.5,
      max_tokens: 2500,
    });

    const data = await response.json();
    const choice = data.choices?.[0];
    const assistantMsg = choice?.message;

    if (!assistantMsg) throw new Error("Respons AI kosong");

    fullMessages.push(assistantMsg);

    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      return {
        message: assistantMsg.content ?? "",
        toolResults,
      };
    }

    const toolCallResults = await Promise.all(
      assistantMsg.tool_calls.map(
        async (tc: { id: string; function: { name: string; arguments: string } }) => {
          const args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
          const result = await executeTool(tc.function.name, args);
          toolResults.push({
            toolName: tc.function.name,
            displayData: result.displayData,
            success: result.success,
          });
          return {
            role: "tool" as const,
            tool_call_id: tc.id,
            content: result.result,
          };
        },
      ),
    );

    fullMessages.push(...toolCallResults);
  }

  return { message: "Maaf, gue butuh terlalu banyak langkah buat ini. Coba pecah jadi beberapa perintah ya.", toolResults };
}
