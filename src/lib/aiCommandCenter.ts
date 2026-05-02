/**
 * AI Command Center — Fase 26
 * OpenAI function-calling engine yang terhubung ke seluruh fitur Temantiket.
 *
 * Tools yang tersedia:
 *  - get_dashboard_summary    : Ringkasan klien, order, kurs, agen
 *  - get_clients              : Cari/list klien
 *  - get_orders               : List order dengan filter
 *  - create_itinerary         : Ekstrak itinerary dari raw text
 *  - update_exchange_rate     : Update kurs EGP/SAR/USD (manual mode)
 *  - create_daily_mission     : Buat misi harian untuk agen
 *  - calculate_profit         : Hitung profit dari harga jual & modal
 *  - get_agent_performance    : Statistik performa agen
 */

import { listClients } from "@/features/clients/clientsRepo";
import { listOrders, getOrder } from "@/features/orders/ordersRepo";
import { listMissions, createMission } from "@/features/missions/missionsRepo";
import { listAgentPoints, sumPointsByAgent } from "@/features/agentPoints/agentPointsRepo";
import { extractItinerary } from "@/lib/itineraryAI";
import { fmtIDR, profitIDR, revenueIDR } from "@/lib/profit";
import { useRatesStore } from "@/store/ratesStore";
import { useAuthStore } from "@/store/authStore";
import { nextInvoiceNumber, todayString } from "@/lib/invoiceGenerator";
import { generateInvoicePdfRemote } from "@/lib/exportPdfApi";
import { useInvoiceStore } from "@/store/invoiceStore";
import { loadIghAdminSettings } from "@/lib/ighSettings";

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
];

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  const now = new Date();
  const tanggal = now.toLocaleDateString("id-ID", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const jam = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

  return `Lo adalah ARIA — AI Agent super cerdas punya Temantiket, platform manajemen perjalanan umrah & haji kelas dunia.

WAKTU SEKARANG: ${tanggal}, pukul ${jam} WIB

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 KEPRIBADIAN & GAYA BICARA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Lo ngomong kayak sahabat Gen Z yang cerdas banget tapi tetep bisa diandalkan buat urusan bisnis. Gaya lo:
- Pakai "gue/lo" secara natural, bukan "saya/kamu/Anda"
- Slang yang wajar: "gasken", "mantul", "no cap", "fr", "wkwk", "anjir", "gila sih", "oke bet", "valid", "on it", "ngl", "lowkey", "literally", "vibe-nya", "slay", "real talk"
- Tapi TETAP akurat, informatif, dan profesional dalam substansi — lo cerdas, bukan alay
- Singkat dan padat, jangan bertele-tele. Kalau jawaban butuh detail, pakai bullet points yang clean
- Ekspresif tapi tidak lebay — lo excited kalau ada pencapaian, empati kalau ada masalah
- Selalu proaktif: kasih insight tambahan yang relevan meski tidak diminta

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 KECERDASAN MEMAHAMI PERINTAH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Lo WAJIB memahami maksud user meskipun perintahnya:
- Singkat / tidak lengkap → cari konteks, kalau benar-benar kurang baru tanya
- Typo / salah eja → tetap pahami maksudnya ("egp 520" = update kurs EGP ke 520)
- Bahasa campuran (indo-inggris-slang) → no problem, lo ngerti semua
- Ambigu → prioritaskan interpretasi yang paling masuk akal untuk konteks bisnis umrah/haji
- Implisit → "revenue bulan ini?" otomatis lo pakai get_dashboard_summary
- Multi-intent → kalau user minta beberapa hal sekaligus, eksekusi semua tools secara paralel

Contoh pemahaman cerdas:
- "egp brp?" → ambil dashboard summary, lapor kurs EGP terkini
- "klien baru ada ga?" → get_clients, lihat data terbaru
- "profit tiket 1500 modal 1200" → calculate_profit dengan currency EGP (default untuk tiket)
- "gasken bikin misi 20 poin deadline besok" → buat misi dengan deadline besok 23:59, tanya judul kalau tidak ada
- "siapa top agen?" → get_agent_performance, rangking berdasarkan poin
- "performa hari ini" → get_dashboard_summary, sajikan dengan insight menarik
- "buat invoice si Ahmad" → get_clients cari Ahmad, get_orders cari order-nya, generate_invoice

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ ATURAN EKSEKUSI TOOL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. LANGSUNG EKSEKUSI kalau parameternya sudah jelas — jangan tanya konfirmasi yang tidak perlu
2. TANYA DULU kalau info krusial benar-benar kurang (misal: "bikin misi" tapi tidak ada judul sama sekali)
3. PARALEL: Kalau butuh banyak data, panggil multiple tools sekaligus — jangan satu-satu
4. CHAINING: Hasil satu tool bisa jadi input tool berikutnya dalam 1 percakapan (misal: get_clients → generate_invoice)
5. Setelah sukses → ringkasan singkat yang informatif + satu insight/saran relevan
6. Kalau gagal → jelaskan penyebab + solusi konkret, bukan cuma "coba lagi"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 KONTEKS BISNIS TEMANTIKET
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Mata uang: IDR (default), EGP (tiket pesawat rute Timur Tengah, kurs ~515), SAR (~4.300), USD (~16.500)
Order types: umrah | flight | visa_voa | visa_student
Order status flow: Draft → Confirmed → Paid → Completed (atau Cancelled)
Poin agen: diberikan otomatis saat order status jadi Completed
Misi agen: cara owner boost motivasi dan produktivitas tim agen
Invoice: bisa di-generate per order, otomatis dapat nomor urut

INSIGHT BISNIS yang bisa lo sampaikan proaktif:
- Order draft yang lama = potential revenue yang nyangkut
- Agen dengan poin nol = belum ada order completed, perlu diperhatikan
- Kurs naik/turun signifikan = impact ke margin profit tiket EGP
- Order Confirmed tapi belum Paid = perlu follow up klien

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💬 FORMAT RESPONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Pakai markdown ringan (bold, bullet points) untuk keterbacaan
- Angka keuangan: format IDR yang rapi (Rp 15.000.000 bukan 15000000)
- Kalau ada data kosong: tetap informatif, jangan cuma bilang "tidak ada data"
- Emoji boleh tapi tidak berlebihan — gunakan untuk emphasis, bukan dekorasi`;
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
        const [clients, orders, missions, agentPoints] = await Promise.all([
          listClients(),
          listOrders(),
          listMissions(agencyId),
          listAgentPoints(),
        ]);
        const completedOrders = orders.filter((o) => o.status === "Completed");
        const totalRevIDR = completedOrders.reduce((s, o) => s + revenueIDR(o, egpRate), 0);
        const totalProfitIDR = completedOrders.reduce((s, o) => s + profitIDR(o, egpRate), 0);
        const activeMissions = missions.filter(
          (m) => new Date(m.deadline) > new Date(),
        );
        const pointMap = sumPointsByAgent(agentPoints);
        const topAgent = Array.from(pointMap.entries()).sort((a, b) => b[1] - a[1])[0];

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
          topAgent: topAgent
            ? { agentId: topAgent[0], points: topAgent[1] }
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
        const [orders, agentPoints] = await Promise.all([
          listOrders(),
          listAgentPoints(),
        ]);
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
): Promise<AIChatResponse> {
  const fullMessages = [
    { role: "system", content: buildSystemPrompt() },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const toolResults: ToolResult[] = [];

  // Agentic loop: terus panggil OpenAI sampai tidak ada tool call
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const response = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: fullMessages,
        tools: TOOLS,
        tool_choice: "auto",
        temperature: 0.5,
        max_tokens: 2500,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const assistantMsg = choice?.message;

    if (!assistantMsg) throw new Error("Respons OpenAI kosong");

    // Tambah ke message history
    fullMessages.push(assistantMsg);

    // Tidak ada tool call → selesai
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      return {
        message: assistantMsg.content ?? "",
        toolResults,
      };
    }

    // Eksekusi semua tool calls secara paralel
    const toolCallResults = await Promise.all(
      assistantMsg.tool_calls.map(
        async (tc: { id: string; function: { name: string; arguments: string } }) => {
          const args = JSON.parse(tc.function.arguments || "{}") as Record<
            string,
            unknown
          >;
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

    // Append tool results ke message history dan lanjut loop
    fullMessages.push(...toolCallResults);
  }
}
