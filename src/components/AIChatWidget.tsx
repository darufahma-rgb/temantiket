/**
 * AIChatWidget — Fase 26: AI Command Center
 * Floating chat bubble di pojok kanan bawah dashboard.
 * Mendukung OpenAI function calling untuk kontrol penuh Temantiket.
 * Context-aware: chip suggestion berubah sesuai halaman aktif.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot, Send, Loader2, Sparkles,
  TrendingUp, Users, ShoppingBag, Zap, RefreshCw,
  CheckCircle2, AlertCircle, Target, Calculator, ChevronDown,
  FileDown,
} from "lucide-react";
import { sendAIMessage, type ChatMessage, type ToolResult } from "@/lib/aiCommandCenter";
import { useAIChatStore } from "@/store/aiChatStore";
import { cn } from "@/lib/utils";

// ── Page-aware fallback suggestions ─────────────────────────────────────────

interface PageSuggestions {
  match: (p: string) => boolean;
  chips: string[];
}

const PAGE_SUGGESTIONS: PageSuggestions[] = [
  {
    match: (p) => p === "/" || p === "/dashboard",
    chips: [
      "Performa bisnis hari ini gimana?",
      "Siapa top agen bulan ini?",
      "Gasken bikin misi harian buat agen",
      "Order yang masih Draft ada berapa?",
      "Total revenue sekarang berapa?",
      "Kasih gue 5 order terbaru",
    ],
  },
  {
    match: (p) => p.startsWith("/clients"),
    chips: [
      "Cari klien Ahmad",
      "List 10 klien terbaru dong",
      "Total klien gue berapa sekarang?",
      "Cari klien HP 081",
      "Klien mana yang belum punya order?",
      "Tampilkan semua klien",
    ],
  },
  {
    match: (p) => p.startsWith("/orders"),
    chips: [
      "Order flight yang Confirmed ada ga?",
      "Ada order umrah masih Draft?",
      "Total revenue dari order Completed?",
      "5 order terbaru gasken",
      "Order visa apa aja yang aktif?",
      "Hitung profit semua order dong",
    ],
  },
  {
    match: (p) => p.startsWith("/itinerary"),
    chips: [
      'Ekstrak PNR: "1 QR978 Y 15MAR CGK DOH HK1 2355 0430"',
      'Ekstrak: "EK317 CAI-DXB 20MAY 0310 0755"',
      "Bikin itinerary CGK-DOH-JED Qatar",
      "Cari order flight terbaru",
      "Profit tiket EGP 1200 modal 950 berapa?",
      "Update kurs EGP ke 520",
    ],
  },
  {
    match: (p) => p.startsWith("/calculator"),
    chips: [
      "Profit tiket EGP 1500 modal 1200 berapa?",
      "Hitung profit IDR 15jt modal 12jt",
      "Set kurs EGP ke 520",
      "Update SAR ke 4300",
      "Kurs USD sekarang berapa?",
      "Margin 20% dari EGP 2000 itu berapa IDR?",
    ],
  },
  {
    match: (p) => p.startsWith("/reports"),
    chips: [
      "Total revenue & profit kita berapa?",
      "Performa bisnis hari ini gimana?",
      "Agen dengan order terbanyak siapa?",
      "Order Completed bulan ini ada berapa?",
      "Breakdown profit semua order dong",
      "Ranking agen berdasarkan performa",
    ],
  },
  {
    match: (p) => p.startsWith("/agent-center"),
    chips: [
      "Bikin misi: share promo umrah, 20 poin, deadline besok",
      "Siapa agen paling banyak poin?",
      "Ranking performa semua agen dong",
      "Bikin misi: follow up klien, 15 poin",
      "Berapa total agen yang aktif?",
      "Agen mana yang poinnya masih nol?",
    ],
  },
  {
    match: (p) => p.startsWith("/ticket-prices"),
    chips: [
      "Order flight terbaru ada ga?",
      "Update kurs EGP ke 520 gasken",
      "Profit tiket EGP 1200 modal 950?",
      "Klien yang punya order flight siapa aja?",
      "Total revenue dari order flight berapa?",
      "Set SAR ke 4300",
    ],
  },
  {
    match: (p) => p.startsWith("/settings"),
    chips: [
      "Update EGP ke 520",
      "Set SAR ke 4300",
      "Update USD ke 16500",
      "Ringkasan bisnis hari ini dong",
      "Total klien & order sekarang berapa?",
      "Performa agen gimana?",
    ],
  },
  {
    match: (p) => p.startsWith("/packages"),
    chips: [
      "Profit paket EGP 2500 modal 2000?",
      "Klien yang order umrah siapa aja?",
      "Bikin misi promosi paket umrah",
      "Total order umrah ada berapa?",
      "Performa bisnis hari ini?",
      "5 klien terbaru gasken",
    ],
  },
  {
    match: (p) => p.startsWith("/bc-templates"),
    chips: [
      "List semua klien buat bahan broadcast",
      "Berapa total klien aktif gue?",
      "Ringkasan bisnis buat bahan BC",
      "Cari klien nama Ahmad",
      "Order terbaru yang perlu di-follow up?",
      "Revenue bulan ini berapa?",
    ],
  },
  {
    match: (p) => p.startsWith("/notes"),
    chips: [
      "Ringkasan bisnis buat gue catat",
      "Total revenue & profit sekarang?",
      "Order yang baru Completed apa aja?",
      "Status performa agen gimana?",
      "Update kurs EGP ke 520",
      "5 klien terbaru",
    ],
  },
];

const DEFAULT_SUGGESTIONS = [
  "Performa bisnis hari ini gimana?",
  "5 klien terbaru gasken",
  "Update kurs EGP ke 520",
  "Gasken bikin misi buat agen",
  "Profit tiket EGP 1500 modal 1200?",
  "Siapa top agen bulan ini?",
];

function getPageSuggestions(pathname: string): string[] {
  return PAGE_SUGGESTIONS.find((p) => p.match(pathname))?.chips ?? DEFAULT_SUGGESTIONS;
}

// ── Tool result display ──────────────────────────────────────────────────────

function ToolResultCard({ result }: { result: ToolResult }) {
  const d = result.displayData;
  const type = d.type as string;

  if (!result.success) {
    return (
      <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-700">
        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>{String(d.message ?? "Error tidak diketahui")}</span>
      </div>
    );
  }

  if (type === "dashboard_summary") {
    return (
      <div className="p-3 rounded-xl bg-gradient-to-br from-sky-50 to-blue-50 border border-sky-100 text-xs space-y-2">
        <div className="flex items-center gap-1.5 font-semibold text-sky-700">
          <TrendingUp className="w-3.5 h-3.5" /> Ringkasan Bisnis
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <Stat label="Klien" value={String(d.totalClients)} />
          <Stat label="Order" value={String(d.totalOrders)} />
          <Stat label="Revenue" value={String(d.totalRevenue)} />
          <Stat label="Profit" value={String(d.totalProfit)} />
        </div>
        {d.currentRates && (
          <div className="pt-1 border-t border-sky-100 text-sky-600 space-y-0.5">
            <div className="font-medium mb-0.5">Kurs Aktif</div>
            {Object.entries(d.currentRates as Record<string, number>).map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span>{k}</span>
                <span className="font-medium">Rp {v.toLocaleString("id-ID")}</span>
              </div>
            ))}
          </div>
        )}
        {d.activeMissions !== undefined && (
          <div className="text-sky-600">
            Misi aktif: <span className="font-semibold">{String(d.activeMissions)}</span>
          </div>
        )}
      </div>
    );
  }

  if (type === "clients_list") {
    const clients = d.clients as Array<{ name: string; phone: string }>;
    return (
      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-xs space-y-2">
        <div className="flex items-center gap-1.5 font-semibold text-emerald-700">
          <Users className="w-3.5 h-3.5" /> {String(d.total)} Klien Ditemukan
        </div>
        {clients.slice(0, 5).map((c, i) => (
          <div key={i} className="flex justify-between text-emerald-800">
            <span className="font-medium">{c.name}</span>
            <span className="text-emerald-600">{c.phone}</span>
          </div>
        ))}
        {(d.total as number) > 5 && (
          <div className="text-emerald-500">+{(d.total as number) - 5} lainnya…</div>
        )}
      </div>
    );
  }

  if (type === "orders_list") {
    const orders = d.orders as Array<{ type: string; status: string; title: string | null; totalPrice: number; currency: string }>;
    return (
      <div className="p-3 rounded-xl bg-violet-50 border border-violet-100 text-xs space-y-2">
        <div className="flex items-center gap-1.5 font-semibold text-violet-700">
          <ShoppingBag className="w-3.5 h-3.5" /> {String(d.total)} Order
        </div>
        {orders.slice(0, 5).map((o, i) => (
          <div key={i} className="flex items-center justify-between text-violet-800">
            <span className="font-medium truncate max-w-[110px]">{o.title ?? o.type}</span>
            <span className={cn("px-1.5 py-0.5 rounded-full text-[10px]",
              o.status === "Completed" ? "bg-emerald-100 text-emerald-700" :
              o.status === "Paid" ? "bg-blue-100 text-blue-700" :
              o.status === "Confirmed" ? "bg-amber-100 text-amber-700" :
              "bg-gray-100 text-gray-600"
            )}>{o.status}</span>
          </div>
        ))}
      </div>
    );
  }

  if (type === "itinerary_result") {
    const legs = d.legs as string[];
    return (
      <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-xs space-y-2">
        <div className="flex items-center gap-1.5 font-semibold text-amber-700">
          <Sparkles className="w-3.5 h-3.5" /> Itinerary Diekstrak
          {d.usedAI && <span className="ml-auto bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full text-[10px]">AI</span>}
        </div>
        {d.pnr && <div className="text-amber-800">PNR: <span className="font-mono font-semibold">{String(d.pnr)}</span></div>}
        {d.passengerName && <div className="text-amber-800">Penumpang: <span className="font-semibold">{String(d.passengerName)}</span></div>}
        <div className="space-y-1">
          {legs.map((leg, i) => (
            <div key={i} className="font-mono text-[11px] text-amber-700 bg-amber-100/60 px-2 py-1 rounded-lg">
              {leg}
            </div>
          ))}
        </div>
        <div className="text-amber-500 text-[10px]">Buka halaman Itinerary untuk menyimpan &amp; share via WhatsApp</div>
      </div>
    );
  }

  if (type === "rate_updated") {
    return (
      <div className="flex items-start gap-2 p-3 rounded-xl bg-sky-50 border border-sky-100 text-xs text-sky-700">
        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-500" />
        <span>{String(d.message)}</span>
      </div>
    );
  }

  if (type === "mission_created") {
    return (
      <div className="p-3 rounded-xl bg-orange-50 border border-orange-100 text-xs space-y-1.5">
        <div className="flex items-center gap-1.5 font-semibold text-orange-700">
          <Target className="w-3.5 h-3.5" /> Misi Dibuat
        </div>
        <div className="text-orange-800 font-medium">{String(d.title)}</div>
        <div className="flex gap-3 text-orange-600">
          <span>🎯 {String(d.rewardPoints)} poin</span>
          <span>⏰ {String(d.deadline)}</span>
        </div>
      </div>
    );
  }

  if (type === "profit_calc") {
    return (
      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-xs space-y-1.5">
        <div className="flex items-center gap-1.5 font-semibold text-emerald-700">
          <Calculator className="w-3.5 h-3.5" /> Kalkulasi Profit
        </div>
        <div className="space-y-1 text-emerald-800">
          <div className="flex justify-between"><span>Harga Jual</span><span className="font-medium">{String(d.hargaJual)}</span></div>
          <div className="flex justify-between"><span>Harga Modal</span><span className="font-medium">{String(d.hargaModal)}</span></div>
          <div className="border-t border-emerald-200 pt-1 flex justify-between font-semibold text-emerald-700">
            <span>Profit</span><span>{String(d.profit)}</span>
          </div>
          {d.currency !== "IDR" && (
            <div className="flex justify-between text-emerald-600 text-[11px]">
              <span>≈ IDR</span><span>{String(d.profitIDR)}</span>
            </div>
          )}
          <div className="text-center text-emerald-600 font-semibold text-sm pt-0.5">
            Margin {String(d.marginPct)}
          </div>
        </div>
      </div>
    );
  }

  if (type === "agent_performance") {
    const agents = d.agents as Array<{ agentId: string; points: number; totalOrders: number }>;
    return (
      <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-xs space-y-2">
        <div className="flex items-center gap-1.5 font-semibold text-indigo-700">
          <Zap className="w-3.5 h-3.5" /> Performa Agen ({String(d.totalAgents)} agen)
        </div>
        {agents.map((a, i) => (
          <div key={i} className="flex items-center justify-between text-indigo-800">
            <span className="flex items-center gap-1">
              <span className={cn("w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold",
                i === 0 ? "bg-amber-400 text-white" :
                i === 1 ? "bg-gray-300 text-gray-700" :
                i === 2 ? "bg-orange-400 text-white" : "bg-indigo-100 text-indigo-500"
              )}>{i + 1}</span>
              <span className="font-mono text-[10px] truncate max-w-[80px]">{a.agentId.slice(0, 8)}…</span>
            </span>
            <span className="text-indigo-600">{a.points} poin · {a.totalOrders} order</span>
          </div>
        ))}
      </div>
    );
  }

  if (type === "invoice_ready") {
    const handleDownload = () => {
      const a = document.createElement("a");
      a.href     = String(d.dataUrl);
      a.download = `${String(d.invoiceNumber)}_${String(d.clientName).replace(/\s+/g, "_")}.pdf`;
      a.click();
    };
    return (
      <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 text-xs space-y-2.5">
        <div className="flex items-center gap-1.5 font-semibold text-emerald-700">
          <FileDown className="w-3.5 h-3.5" /> Invoice Siap Download
        </div>
        <div className="space-y-1 text-emerald-800">
          <div className="flex justify-between">
            <span className="text-emerald-600">No. Invoice</span>
            <span className="font-mono font-semibold">{String(d.invoiceNumber)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-emerald-600">Klien</span>
            <span className="font-semibold">{String(d.clientName)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-emerald-600">Order</span>
            <span className="font-medium truncate max-w-[120px]">{String(d.orderTitle)}</span>
          </div>
          <div className="flex justify-between border-t border-emerald-200 pt-1">
            <span className="text-emerald-600 font-medium">Total</span>
            <span className="font-bold text-emerald-700">{String(d.total)}</span>
          </div>
        </div>
        <button
          onClick={handleDownload}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors"
        >
          <FileDown className="w-3.5 h-3.5" />
          Download PDF
        </button>
      </div>
    );
  }

  return null;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/70 rounded-lg px-2 py-1.5">
      <div className="text-sky-500 text-[10px]">{label}</div>
      <div className="font-semibold text-sky-800 truncate">{value}</div>
    </div>
  );
}

// ── Message bubble ───────────────────────────────────────────────────────────

interface StoredMessage {
  msg: ChatMessage;
  toolResults?: ToolResult[];
}

function MessageBubble({ msg, toolResults }: { msg: ChatMessage; toolResults?: ToolResult[] }) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex flex-col gap-1.5", isUser ? "items-end" : "items-start")}>
      {!isUser && (
        <div className="flex items-center gap-1.5 px-1">
          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center overflow-hidden">
            <img src="/chatgpt-icon.png" alt="AITEM" className="w-3.5 h-3.5 object-contain" />
          </div>
          <span className="text-[10px] text-muted-foreground font-medium">AITEM</span>
        </div>
      )}

      {toolResults && toolResults.length > 0 && (
        <div className="w-full space-y-1.5 px-1">
          {toolResults.map((r, i) => (
            <ToolResultCard key={i} result={r} />
          ))}
        </div>
      )}

      {msg.content && (
        <div className={cn(
          "max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed",
          isUser
            ? "bg-gradient-to-br from-sky-500 to-blue-600 text-white rounded-br-sm"
            : "bg-white border border-border/60 text-foreground rounded-bl-sm shadow-sm",
        )}>
          {isUser ? (
            msg.content
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => (
                  <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-foreground">{children}</strong>
                ),
                em: ({ children }) => (
                  <em className="italic opacity-90">{children}</em>
                ),
                ul: ({ children }) => (
                  <ul className="mb-2 last:mb-0 space-y-1 pl-1">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="mb-2 last:mb-0 space-y-1 pl-1 list-decimal list-inside">{children}</ol>
                ),
                li: ({ children }) => (
                  <li className="flex items-start gap-1.5 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-sky-400 shrink-0" />
                    <span>{children}</span>
                  </li>
                ),
                h1: ({ children }) => (
                  <h1 className="text-base font-bold mb-1.5 mt-2 first:mt-0">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-sm font-bold mb-1 mt-2 first:mt-0">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-sm font-semibold mb-1 mt-1.5 first:mt-0">{children}</h3>
                ),
                code: ({ children, className }) => {
                  const isBlock = className?.includes("language-");
                  return isBlock ? (
                    <code className="block bg-slate-100 rounded-lg px-3 py-2 text-xs font-mono my-2 overflow-x-auto text-slate-800">
                      {children}
                    </code>
                  ) : (
                    <code className="bg-slate-100 rounded px-1.5 py-0.5 text-xs font-mono text-slate-800">
                      {children}
                    </code>
                  );
                },
                pre: ({ children }) => (
                  <pre className="bg-slate-100 rounded-lg my-2 overflow-x-auto">{children}</pre>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-sky-300 pl-3 my-2 text-muted-foreground italic">
                    {children}
                  </blockquote>
                ),
                hr: () => <hr className="my-2 border-border/40" />,
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer"
                    className="text-sky-600 underline underline-offset-2 hover:text-sky-700">
                    {children}
                  </a>
                ),
              }}
            >
              {msg.content}
            </ReactMarkdown>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main widget ──────────────────────────────────────────────────────────────

export function AIChatWidget() {
  const { pathname } = useLocation();
  const { isOpen, pendingText, open, close, clearPendingText } = useAIChatStore();

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<StoredMessage[]>([]);
  const [apiMessages, setApiMessages] = useState<ChatMessage[]>([]);
  const [hasUnread, setHasUnread] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const suggestions = getPageSuggestions(pathname);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (isOpen) {
      setHasUnread(false);
      setTimeout(scrollToBottom, 100);
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen, scrollToBottom]);

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [history, loading, isOpen, scrollToBottom]);

  // Handle pending text from external (AIContextualBar chips)
  useEffect(() => {
    if (pendingText && isOpen) {
      setInput(pendingText);
      clearPendingText();
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [pendingText, isOpen, clearPendingText]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const nextApiMessages = [...apiMessages, userMsg];

    setHistory((h) => [...h, { msg: userMsg }]);
    setApiMessages(nextApiMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await sendAIMessage(nextApiMessages);
      const assistantMsg: ChatMessage = { role: "assistant", content: response.message };
      setHistory((h) => [...h, { msg: assistantMsg, toolResults: response.toolResults }]);
      setApiMessages((prev) => [...prev, assistantMsg]);
      if (!isOpen) setHasUnread(true);
    } catch (err) {
      const errMsg: ChatMessage = {
        role: "assistant",
        content: `Maaf, terjadi error: ${err instanceof Error ? err.message : "Unknown error"}. Coba lagi ya.`,
      };
      setHistory((h) => [...h, { msg: errMsg }]);
      setApiMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  }, [apiMessages, loading, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  const isEmpty = history.length === 0;

  return (
    <>
      {/* Floating button */}
      <div className="fixed bottom-24 right-4 z-50 md:bottom-6 md:right-6">
        <AnimatePresence>
          {!isOpen && (
            <motion.button
              key="fab"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              whileTap={{ scale: 0.92 }}
              onClick={open}
              className="relative w-14 h-14 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 shadow-lg shadow-sky-500/30 flex items-center justify-center text-white hover:shadow-xl hover:shadow-sky-500/40 transition-shadow"
            >
              <motion.img
                src="/chatgpt-icon.png"
                alt="AI"
                className="w-7 h-7 object-contain"
                animate={loading ? { rotate: 360 } : { rotate: 0 }}
                transition={loading
                  ? { duration: 1.8, repeat: Infinity, ease: "linear" }
                  : { duration: 0.4, ease: "easeOut" }
                }
              />
              {hasUnread && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full border-2 border-white" />
              )}
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Chat dialog */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="chat"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed bottom-24 right-4 z-50 md:bottom-6 md:right-6 w-[calc(100vw-2rem)] max-w-sm flex flex-col bg-white rounded-2xl shadow-2xl shadow-sky-500/10 border border-border/60 overflow-hidden"
            style={{ maxHeight: "min(600px, calc(100svh - 8rem))" }}
          >
            {/* Header */}
            <div
              className="flex items-center gap-3 px-4 py-3 shrink-0"
              style={{ background: "linear-gradient(135deg, #1a44d4 0%, #0a2472 100%)" }}
            >
              <div className="w-9 h-9 rounded-2xl bg-white/15 flex items-center justify-center shrink-0 border border-white/20">
                <motion.img
                  src="/chatgpt-icon.png"
                  alt="AITEM"
                  className="w-5 h-5 object-contain"
                  animate={loading ? { rotate: 360 } : { rotate: 0 }}
                  transition={loading
                    ? { duration: 1.8, repeat: Infinity, ease: "linear" }
                    : { duration: 0.4, ease: "easeOut" }
                  }
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[15px] text-white leading-tight tracking-tight">AITEM</div>
                <div className="text-[10.5px] text-white/65 flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block shrink-0" />
                  Siap membantu • gpt-4o-mini
                </div>
              </div>
              <button
                onClick={close}
                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 flex items-center justify-center transition-colors shrink-0"
              >
                <ChevronDown className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50/50">
              {isEmpty && (
                <div className="space-y-4">
                  <div className="text-center pt-5 pb-1">
                    <div
                      className="w-[60px] h-[60px] rounded-[20px] flex items-center justify-center mx-auto mb-3 shadow-lg"
                      style={{ background: "linear-gradient(135deg, #1a44d4 0%, #0a2472 100%)" }}
                    >
                      <img src="/chatgpt-icon.png" alt="AITEM" className="w-8 h-8 object-contain" />
                    </div>
                    <p className="font-bold text-[15px] text-foreground tracking-tight">Halo! Saya AITEM</p>
                    <p className="text-[12px] text-muted-foreground mt-1.5 px-5 leading-relaxed">
                      Kontrol seluruh bisnis Temantiket hanya lewat chat.
                      Coba salah satu perintah di bawah 👇
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => void sendMessage(s)}
                        className="text-left text-[11.5px] px-3 py-2.5 rounded-xl bg-white border border-border/60 hover:border-blue-200 hover:bg-blue-50/60 text-foreground/80 hover:text-blue-700 transition-all leading-snug shadow-sm"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {history.map((item, i) => (
                <MessageBubble key={i} msg={item.msg} toolResults={item.toolResults} />
              ))}

              {loading && (
                <div className="flex items-start gap-1.5">
                  <div className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center shrink-0 mt-0.5" style={{ background: "linear-gradient(135deg, #1a44d4, #0a2472)" }}>
                    <img src="/chatgpt-icon.png" alt="AITEM" className="w-3.5 h-3.5 object-contain" />
                  </div>
                  <div className="bg-white border border-border/60 rounded-2xl rounded-bl-sm px-3 py-2.5 shadow-sm">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "#1a44d4" }} />
                      <span>AITEM sedang memproses…</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Clear button */}
            {!isEmpty && (
              <div className="px-3 py-1 border-t border-border/30 bg-white/80 shrink-0">
                <button
                  onClick={() => { setHistory([]); setApiMessages([]); }}
                  className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className="w-2.5 h-2.5" /> Reset percakapan
                </button>
              </div>
            )}

            {/* Input */}
            <div className="p-3 border-t border-border/40 bg-white shrink-0">
              <div className="flex items-end gap-2 bg-slate-50 rounded-2xl border border-slate-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all px-3.5 py-2.5">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ketik perintah… (Enter untuk kirim)"
                  rows={1}
                  disabled={loading}
                  className="flex-1 resize-none bg-transparent text-[13px] placeholder:text-slate-400 focus:outline-none disabled:opacity-50 max-h-24 leading-relaxed"
                  style={{ minHeight: "20px" }}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = `${el.scrollHeight}px`;
                  }}
                />
                <button
                  onClick={() => void sendMessage(input)}
                  disabled={!input.trim() || loading}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-white disabled:opacity-35 disabled:cursor-not-allowed transition-all shrink-0 mb-0.5"
                  style={{ background: "linear-gradient(135deg, #1a44d4, #0a2472)" }}
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="text-[10px] text-slate-400 mt-1.5 text-center">
                Shift+Enter untuk baris baru · Didukung OpenAI
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
