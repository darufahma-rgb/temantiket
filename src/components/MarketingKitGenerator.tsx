import { useState } from "react";
import {
  Wand2, Copy, CheckCheck, FileText,
  Plane, BookOpen, Megaphone, Moon, Sparkles, AlignLeft,
  RefreshCw, MessageCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/* ─── Kategori ─────────────────────────────────────────── */
const CATEGORIES = [
  { key: "umrah",   label: "Promo Umrah",   Icon: Moon,       prompt: "paket umrah hemat" },
  { key: "haji",    label: "Paket Haji",    Icon: Sparkles,   prompt: "paket haji plus / furoda" },
  { key: "flight",  label: "Tiket Pesawat", Icon: Plane,      prompt: "tiket pesawat murah" },
  { key: "visa",    label: "Layanan Visa",  Icon: BookOpen,   prompt: "layanan visa cepat" },
  { key: "general", label: "Promo Umum",    Icon: Megaphone,  prompt: "layanan travel umrah & haji" },
];

/* ─── Tone ──────────────────────────────────────────────── */
const TONES = [
  { key: "santai",   label: "Santai",       desc: "Friendly, casual, akrab"      },
  { key: "formal",   label: "Formal",       desc: "Profesional & terpercaya"     },
  { key: "hardsell", label: "Hard Selling", desc: "FOMO, urgent, ajak action"    },
  { key: "story",    label: "Storytelling", desc: "Emosional, cerita perjalanan" },
];

/* ─── Template captions ─────────────────────────────────── */
const TEMPLATES: Record<string, Record<string, string>> = {
  umrah: {
    santai: `✈️ Halo Sahabat Temantiket! 🌙

Lagi mikirin berangkat Umrah tapi bingung mulai dari mana? Tenang aja, kita siap bantu kamu dari A sampai Z!

Paket Umrah kami udah lengkap banget — dari dokumen, visa, tiket, hotel, sampai bimbingan ibadah. Semua udah beres, kamu tinggal fokus niat dan persiapan spiritual aja 🤲

Kenapa pilih kami?
✅ Harga transparan, no hidden cost
✅ Hotel nyaman, dekat Masjidil Haram
✅ Pembimbing ibadah berpengalaman
✅ Berangkat bareng jamaah solid & suportif
✅ Proses dokumen cepat & mudah

Yuk, wujudkan impian ke Baitullah! Slot terbatas, jangan sampai ketinggalan ya 😊`,

    formal: `🕌 Assalamu'alaikum Warahmatullahi Wabarakatuh

Temantiket dengan bangga menghadirkan layanan perjalanan Umrah yang terpercaya dan berpengalaman.

Kami memahami bahwa perjalanan ibadah adalah momen paling berharga dalam hidup Anda. Oleh karena itu, kami berkomitmen untuk memberikan pelayanan terbaik — mulai dari pengurusan dokumen, akomodasi berkualitas, hingga bimbingan ibadah yang komprehensif.

Keunggulan layanan kami:
✔️ Legalitas resmi & terdaftar Kemenag
✔️ Hotel berbintang, lokasi strategis
✔️ Pembimbing ibadah bersertifikat
✔️ Laporan perjalanan real-time kepada keluarga
✔️ Layanan purna jual yang responsif

Percayakan perjalanan ibadah Anda kepada kami. Bersama Temantiket, setiap langkah menuju Baitullah terasa lebih tenang dan bermakna.

Informasi & pendaftaran, silakan hubungi kami.`,

    hardsell: `🚨 PERHATIAN! Slot Umrah Hampir Habis! 🚨

Jangan tunda lagi — ini saatnya kamu berangkat! ✈️🕌

⏰ KUOTA TERBATAS — tidak akan kami tambah!
💸 Harga SPESIAL berlaku sampai akhir bulan ini saja
🔥 Sudah ratusan jamaah berangkat bersama kami

Daftar sekarang dan HEMAT lebih banyak! Setiap hari yang kamu tunda = kesempatan yang hilang.

❌ Jangan sampai menyesal karena telat daftar
❌ Jangan biarkan impian ke Baitullah tertunda lagi
✅ AMBIL KEPUTUSAN SEKARANG!

📲 Hubungi kami SEGERA — tim kami siap membantu 24 jam!
👇 Klik sekarang sebelum slot habis!`,

    story: `✨ Ada yang bilang, hidup baru terasa lengkap setelah menginjakkan kaki di Tanah Suci...

Saya pernah mendengar seorang jamaah bercerita — saat pertama kali melihat Ka'bah, air mata langsung mengalir tanpa bisa ditahan. Bukan karena lelah perjalanan, tapi karena hati yang selama ini penuh kerinduan akhirnya bertemu dengan tujuannya 🤲

Setiap doa yang dipanjatkan di sana terasa lebih dekat. Setiap langkah terasa lebih ringan. Dan setiap momen, menjadi kenangan yang tak akan pernah terlupakan seumur hidup.

Kamu juga bisa merasakan itu semua. 🕌

Bersama Temantiket, kami akan menemani perjalananmu — dari persiapan pertama hingga kamu pulang membawa cerita dan keberkahan.

Karena setiap jiwa berhak merasakan indahnya berdiri di depan Ka'bah. ✈️🌙`,
  },

  haji: {
    santai: `🕋 Niat haji udah lama? Yuk kita wujudkan bareng! 😊

Temantiket hadir dengan paket Haji Plus & Furoda yang bisa bikin perjalanan ibadah terpenting dalam hidupmu jadi lebih nyaman dan berkesan.

Kenapa haji bareng kami?
✅ Proses pendaftaran mudah & cepat
✅ Akomodasi premium, dekat Masjidil Haram
✅ Tim pembimbing ibadah siap mendampingi
✅ Kuota resmi, tidak ada kekhawatiran
✅ Transparansi biaya dari awal

Info lengkap? Langsung kontak kami ya! Jangan sampe nyesel karena kelamaan nunggu 🤲`,

    formal: `🕋 Assalamu'alaikum Warahmatullahi Wabarakatuh

Temantiket membuka pendaftaran Haji Plus dan Haji Furoda dengan layanan premium yang telah dipercaya oleh ribuan jamaah.

Haji adalah rukun Islam kelima — panggilan suci yang selayaknya disambut dengan persiapan terbaik. Kami hadir untuk memastikan setiap aspek perjalanan ibadah Anda tertangani dengan profesional.

Layanan unggulan kami:
✔️ Kuota resmi & terjamin
✔️ Akomodasi bintang 5, ring 1 Masjidil Haram
✔️ Muthawwif & pembimbing ibadah berpengalaman
✔️ Manasik haji komprehensif sebelum keberangkatan
✔️ Pendampingan penuh selama di Tanah Suci

Daftarkan diri Anda sekarang untuk informasi ketersediaan kuota dan biaya perjalanan.`,

    hardsell: `🚨 KUOTA HAJI PLUS TERSISA SANGAT TERBATAS! 🚨

Ini bukan sekadar perjalanan biasa — ini adalah panggilan Allah SWT! 🕋

⚡ Antrian haji reguler puluhan tahun — kami punya SOLUSINYA
💺 Seat Haji Plus & Furoda sangat terbatas!
⏰ Jangan tunggu tahun depan — daftar SEKARANG!

Yang sudah daftar lebih dulu:
✅ Dapat harga terbaik
✅ Pilihan kamar hotel lebih leluasa
✅ Proses dokumen lebih awal & tenang

📲 HUBUNGI KAMI SEKARANG — tim kami siap membantu!
Slot habis = harus tunggu tahun depan. Jangan sampai itu terjadi padamu!`,

    story: `🕋 Labbaik Allahumma Labbaik...

Kalimat talbiyah itu sederhana, namun siapa yang pernah mengucapkannya di Tanah Suci tahu betapa beratnya haru yang mengiringi setiap kata.

Haji bukan hanya tentang perjalanan fisik. Ia adalah perjalanan jiwa — melepaskan semua kesibukan dunia, berdiri di Arafah, melempar jumrah, dan merasakan betapa kecilnya kita di hadapan Allah SWT 🤲

Ribuan jamaah yang telah berangkat bersama Temantiket membawa pulang bukan hanya gelar "Haji" — mereka membawa pulang ketenangan hati yang tak ternilai.

Mungkin tahun ini, giliran kamu? 🌙

Kami siap mendampingi setiap langkah perjalanan ibadah terbesarmu. ✈️`,
  },

  flight: {
    santai: `✈️ Nyari tiket pesawat murah? Kita ada solusinya! 😊

Temantiket nggak cuma ngurusin Umrah & Haji — kami juga bantu kamu dapetin tiket penerbangan dengan harga terbaik ke mana aja!

Keuntungan pesan tiket lewat kami:
✅ Harga bersaing, transparan
✅ Pilihan maskapai lengkap
✅ Proses cepat, konfirmasi instan
✅ Bantuan pengurusan bagasi & seat
✅ Customer service responsif

Mau berangkat ke mana? Tinggal chat kami, kami bantu cariin harga terbaik buat kamu! 🎯`,

    formal: `✈️ Layanan Pemesanan Tiket Penerbangan Terpercaya

Temantiket menyediakan layanan pemesanan tiket penerbangan untuk berbagai rute domestik dan internasional dengan harga kompetitif dan proses yang transparan.

Kami bermitra dengan berbagai maskapai terkemuka untuk memastikan Anda mendapatkan pilihan penerbangan terbaik sesuai kebutuhan dan anggaran perjalanan.

Keunggulan layanan tiket kami:
✔️ Harga kompetitif & tanpa biaya tersembunyi
✔️ Pilihan maskapai internasional & domestik
✔️ Konfirmasi tiket cepat & terpercaya
✔️ Bantuan dalam pengurusan dokumen perjalanan
✔️ Dukungan pelanggan yang profesional

Untuk informasi harga dan ketersediaan, silakan hubungi tim kami.`,

    hardsell: `🔥 TIKET PROMO TERBATAS — JANGAN SAMPAI KEHABISAN! ✈️

Harga tiket lagi MURAH banget sekarang, tapi tidak akan bertahan lama!

⚡ Penerbangan ke berbagai tujuan — HARGA TERBAIK!
⏰ Promo berlaku TERBATAS — stok seat sangat terbatas!
💸 Hemat ratusan ribu vs beli sendiri!

Mau ke mana?
🛫 Rute Internasional — tersedia!
🛫 Rute Domestik — tersedia!
🛫 Penerbangan Charter — tersedia!

📲 Chat kami SEKARANG sebelum seat habis!
Jangan tunda — tiket murah tidak menunggu siapa pun! 🏃‍♂️`,

    story: `✈️ Ada sesuatu yang ajaib terjadi setiap kali pesawat mulai mengudara...

Di ketinggian 30.000 kaki, semua masalah di bawah sana terasa begitu kecil. Awan-awan berarak tenang, dan entah kenapa, hati pun ikut terasa lebih lega.

Perjalanan selalu mengajarkan kita sesuatu. Tentang dunia yang begitu luas. Tentang orang-orang baru yang menginspirasi. Tentang perspektif baru yang memperkaya hidup.

Dan setiap perjalanan besar selalu dimulai dari satu langkah pertama — memesan tiket. 🎫

Bersama Temantiket, urusan tiket beres dengan mudah. Kamu tinggal fokus pada pengalaman yang menanti di ujung penerbangan. 🌍`,
  },

  visa: {
    santai: `📋 Urusan visa bikin pusing? Tenang, kami yang handle! 😊

Temantiket punya layanan pengurusan visa yang cepat, mudah, dan terpercaya. Kamu nggak perlu repot-repot ngurus sendiri!

Visa apa aja yang kami urus:
✅ Visa Umrah & Ziarah
✅ Visa Schengen (Eropa)
✅ Visa berbagai negara lainnya

Proses sama kami:
🔹 Konsultasi gratis
🔹 Checklist dokumen lengkap dari kami
🔹 Submit & tracking proses
🔹 Visa jadi, langsung dikirim!

Yuk, konsultasi dulu — gratis! 📲`,

    formal: `📋 Layanan Pengurusan Visa Profesional & Terpercaya

Temantiket menyediakan layanan pengurusan visa dengan standar profesional untuk berbagai jenis dan tujuan perjalanan internasional.

Dengan pengalaman dan jaringan yang luas, kami memastikan proses pengajuan visa Anda berjalan lancar, tepat waktu, dan sesuai dengan persyaratan yang berlaku.

Layanan visa kami meliputi:
✔️ Visa Umrah & Haji
✔️ Visa Ziarah & Wisata Religi
✔️ Konsultasi persyaratan dokumen
✔️ Submit aplikasi & pemantauan proses
✔️ Notifikasi status visa secara berkala

Percayakan kebutuhan visa Anda kepada tim berpengalaman kami. Hubungi kami untuk konsultasi tanpa biaya.`,

    hardsell: `⚠️ VISA CEPAT & ANTI RIBET — URUSIN SEKARANG! 📋

Jangan sampai rencana perjalananmu GAGAL gara-gara visa bermasalah!

❌ Ngurus visa sendiri = ribet, buang waktu, bisa ditolak
✅ Pakai Temantiket = cepat, profesional, berhasil!

Kami handle SEMUA:
🔹 Checklist dokumen lengkap
🔹 Submit tepat waktu
🔹 Tracking status real-time
🔹 Garansi proses sesuai SLA

⏰ Jangan tunggu mepet tanggal berangkat!
📲 Hubungi kami SEKARANG — konsultasi GRATIS!
Slot pengurusan terbatas, prioritaskan yang daftar lebih awal! 🏃`,

    story: `📋 Pernah nggak, kamu terhenti di depan antrian imigrasi karena dokumen bermasalah?

Rasanya seperti semua rencana yang sudah disusun berbulan-bulan tiba-tiba runtuh dalam satu momen.

Kami pernah menyaksikan hal itu terjadi. Dan itulah kenapa kami berkomitmen untuk memastikan setiap jamaah dan traveler yang berangkat bersama Temantiket memiliki dokumen yang sempurna — jauh sebelum hari keberangkatan.

Karena perjalanan terbaik adalah perjalanan yang dimulai dengan ketenangan hati. Tanpa kekhawatiran soal dokumen. Tanpa drama di bandara. 🤲

Percayakan urusan visa kamu kepada kami. Biar kamu fokus pada hal yang lebih penting — menikmati setiap momen perjalananmu. ✈️`,
  },

  general: {
    santai: `🌟 Halo Sahabat Temantiket! 👋

Temantiket hadir untuk membantu semua kebutuhan perjalanan ibadah dan wisata kamu — dari A sampai Z, semua ada di sini!

Apa yang bisa kami bantu?
✈️ Paket Umrah lengkap
🕋 Haji Plus & Furoda
🎫 Tiket pesawat berbagai rute
📋 Pengurusan visa cepat
🌍 Paket wisata religi & umum

Tim kami siap bantu kamu pilih paket terbaik sesuai budget dan kebutuhan. Nggak perlu bingung, cukup chat kami!

Yuk, rencanakan perjalananmu sekarang — bareng Temantiket! 😊`,

    formal: `🌟 Temantiket — Mitra Terpercaya Perjalanan Ibadah & Wisata Anda

Dengan pengalaman melayani ribuan jamaah dan wisatawan, Temantiket berkomitmen untuk memberikan layanan perjalanan terbaik yang memenuhi standar kualitas dan keamanan tertinggi.

Kami hadir sebagai solusi lengkap untuk semua kebutuhan perjalanan Anda:

🕌 Paket Umrah — beragam pilihan sesuai kebutuhan
🕋 Haji Plus & Furoda — dengan layanan premium
✈️ Tiket penerbangan — domestik & internasional
📋 Pengurusan visa — cepat & profesional
🌍 Paket wisata religi — pengalaman bermakna

Kepercayaan Anda adalah prioritas utama kami. Hubungi tim profesional kami untuk konsultasi perjalanan tanpa biaya.`,

    hardsell: `🔥 TEMANTIKET — SEMUA KEBUTUHAN PERJALANANMU ADA DI SINI! 🔥

Mau Umrah? ✅ ADA!
Mau Haji Plus? ✅ ADA!
Butuh tiket pesawat murah? ✅ ADA!
Perlu urus visa cepat? ✅ ADA!

Ratusan jamaah sudah berangkat dan PUAS bareng kami!

⚡ PROMO TERBATAS — harga spesial tidak bertahan lama!
⏰ Slot kosong makin sedikit setiap harinya
💯 Terpercaya, berpengalaman, profesional

📲 Hubungi kami SEKARANG dan dapatkan penawaran TERBAIK!
Jangan tunda — setiap hari yang kamu tunggu adalah kesempatan yang hilang! 🏃‍♂️`,

    story: `🌙 Ada momen-momen dalam hidup yang benar-benar mengubah segalanya...

Seorang ayah yang akhirnya bisa membawa ibu tuanya ke Tanah Suci setelah bertahun-tahun menabung. Seorang pemuda yang untuk pertama kalinya melihat Ka'bah dan menyadari betapa besarnya rasa syukur itu. Sepasang suami istri yang menunaikan haji bersama setelah puluhan tahun menikah.

Kisah-kisah seperti ini adalah alasan kami ada. 🤲

Temantiket bukan sekadar travel agent. Kami adalah teman perjalananmu — yang memahami bahwa setiap perjalanan ibadah menyimpan doa, harapan, dan cerita yang sangat berharga.

Karena yang terpenting bagi kami bukan hanya mengantarkanmu ke sana — tapi memastikan perjalananmu menjadi kenangan indah seumur hidup. ✈️🕌`,
  },
};

/* ─── Template builder ──────────────────────────────────── */
function buildCaption(params: {
  categoryKey: string;
  tone: string;
  packageDetail?: string;
  waNumber?: string;
}): string {
  const { categoryKey, tone, packageDetail, waNumber } = params;
  let base = TEMPLATES[categoryKey]?.[tone] ?? TEMPLATES.general.santai;

  if (packageDetail?.trim()) {
    base += `\n\n📌 Info Paket:\n${packageDetail.trim()}`;
  }

  if (waNumber?.trim()) {
    base += `\n\n📲 Hubungi kami via WA: wa.me/${waNumber.trim().replace(/\D/g, "")}`;
  }

  return base;
}

/* ─── Section wrapper ───────────────────────────────────── */
function Section({ label, icon: Icon, children }: {
  label: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-white p-4 md:p-5 shadow-none">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        <h3 className="text-[13.5px] font-semibold text-foreground">{label}</h3>
      </div>
      {children}
    </div>
  );
}

/* ─── Main Component ────────────────────────────────────── */
export function CaptionGenerator() {
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].key);
  const [activeTone, setActiveTone]         = useState(TONES[0].key);
  const [packageDetail, setPackageDetail]   = useState("");
  const [waNumber, setWaNumber]             = useState("");
  const [result, setResult]                 = useState<string>("");
  const [copied, setCopied]                 = useState(false);

  const handleGenerate = () => {
    const caption = buildCaption({
      categoryKey: activeCategory,
      tone: activeTone,
      packageDetail,
      waNumber,
    });
    setResult(caption);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    toast.success("Caption disalin!");
    setTimeout(() => setCopied(false), 2000);
  };

  const charLen = result.length;
  const charInRange = charLen >= 600 && charLen <= 1000;
  const charTooShort = charLen > 0 && charLen < 600;
  const charColor = charInRange
    ? "text-emerald-600"
    : charTooShort
    ? "text-amber-500"
    : charLen > 1000
    ? "text-rose-500"
    : "text-muted-foreground";

  return (
    <div className="space-y-3 pb-10">

      {/* Kategori */}
      <Section label="Kategori" icon={Wand2}>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
          {CATEGORIES.map(({ key, label, Icon }) => {
            const isActive = key === activeCategory;
            return (
              <button
                key={key}
                onClick={() => setActiveCategory(key)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border py-3.5 px-2 transition-all text-center",
                  isActive
                    ? "border-[#1a44d4] bg-[#1a44d4] text-white shadow-sm"
                    : "border-border/70 bg-white text-foreground hover:border-[#1a44d4]/40 hover:bg-blue-50/40",
                )}
              >
                <Icon className={cn("h-5 w-5", isActive ? "text-white" : "text-muted-foreground")} strokeWidth={1.5} />
                <span className={cn("text-[11px] font-medium leading-tight", isActive ? "text-white" : "text-foreground")}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      {/* Detail Paket */}
      <Section label="Detail Paket (opsional)" icon={AlignLeft}>
        <textarea
          value={packageDetail}
          onChange={(e) => setPackageDetail(e.target.value)}
          placeholder={
            "Contoh:\nPaket Umrah 12 hari, berangkat 15 Maret 2025\n" +
            "Hotel bintang 4, Makkah & Madinah walking distance\n" +
            "Harga mulai Rp 28 juta/orang, kuota terbatas 40 seat"
          }
          rows={4}
          className="w-full rounded-xl border border-border/70 bg-gray-50/60 px-3.5 py-3 text-[13px] text-foreground placeholder-muted-foreground/60 resize-none focus:outline-none focus:ring-2 focus:ring-[#1a44d4]/40 focus:border-[#1a44d4]/50 transition-all"
        />
        <p className="text-[10.5px] text-muted-foreground mt-1.5">
          Jika diisi, detail paket akan ditambahkan di akhir caption secara otomatis.
        </p>
      </Section>

      {/* Tone */}
      <Section label="Gaya Penulisan" icon={FileText}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {TONES.map(({ key, label, desc }) => {
            const isActive = key === activeTone;
            return (
              <button
                key={key}
                onClick={() => setActiveTone(key)}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-left transition-all",
                  isActive
                    ? "border-[#1a44d4] bg-[#1a44d4] text-white"
                    : "border-border/70 bg-white hover:border-[#1a44d4]/40 hover:bg-blue-50/40",
                )}
              >
                <div className={cn("text-[12.5px] font-semibold", isActive ? "text-white" : "text-foreground")}>
                  {label}
                </div>
                <div className={cn("text-[10.5px] mt-0.5 leading-snug", isActive ? "text-white/75" : "text-muted-foreground")}>
                  {desc}
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      {/* Nomor WhatsApp */}
      <Section label="Nomor WhatsApp Temantiket" icon={MessageCircle}>
        <div className="flex items-center gap-2">
          <span className="shrink-0 rounded-lg border border-border/70 bg-gray-50 px-3 py-2.5 text-[13px] text-muted-foreground font-medium select-none">
            wa.me/
          </span>
          <input
            type="tel"
            value={waNumber}
            onChange={(e) => setWaNumber(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="628xxxxxxxxxx"
            className="flex-1 rounded-xl border border-border/70 bg-gray-50/60 px-3.5 py-2.5 text-[13px] text-foreground placeholder-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-[#1a44d4]/40 focus:border-[#1a44d4]/50 transition-all"
          />
        </div>
        {waNumber.trim() ? (
          <p className="text-[10.5px] text-[#1a44d4] mt-1.5">
            Akan ditambahkan: 📲 Hubungi kami via WA: wa.me/{waNumber.trim()}
          </p>
        ) : (
          <p className="text-[10.5px] text-muted-foreground mt-1.5">
            Opsional — jika diisi, link WA otomatis ditambahkan di akhir caption.
          </p>
        )}
      </Section>

      {/* Generate Button */}
      <Button
        onClick={handleGenerate}
        className="w-full h-11 text-[13.5px] font-semibold bg-[#1a44d4] text-white hover:bg-[#1535b0] transition-all rounded-xl"
      >
        <AnimatePresence mode="wait">
          {result ? (
            <motion.span key="regen" className="flex items-center gap-2"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
              Generate Ulang
            </motion.span>
          ) : (
            <motion.span key="idle" className="flex items-center gap-2"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Wand2 className="h-4 w-4" strokeWidth={1.5} />
              Generate Caption
            </motion.span>
          )}
        </AnimatePresence>
      </Button>

      {/* Result */}
      <AnimatePresence>
        {result && (
          <motion.div key="result"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-2 py-1 mb-2">
              <div className="h-px flex-1 bg-border/60" />
              <span className="text-[11px] text-muted-foreground tracking-wide">
                Temantiket Brand Voice
              </span>
              <div className="h-px flex-1 bg-border/60" />
            </div>

            <div className="rounded-xl border border-border/70 bg-white p-4 md:p-5 hover:border-foreground/25 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <span className={cn("text-[10.5px] font-medium", charColor)}>
                  {charLen} karakter
                  {charInRange && " · panjang ideal ✓"}
                  {charTooShort && " · idealnya 600+ kar"}
                  {charLen > 1000 && " · idealnya ≤1000 kar"}
                </span>
                <button
                  onClick={() => void handleCopy()}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition-all border shrink-0",
                    copied
                      ? "border-[#1a44d4]/30 bg-[#1a44d4] text-white"
                      : "border-border/70 text-muted-foreground hover:border-[#1a44d4]/40 hover:text-[#1a44d4]",
                  )}
                >
                  {copied
                    ? <><CheckCheck className="h-3.5 w-3.5" strokeWidth={1.5} /> Disalin</>
                    : <><Copy className="h-3.5 w-3.5" strokeWidth={1.5} /> Salin Caption</>
                  }
                </button>
              </div>
              <p className="text-[13px] leading-relaxed text-foreground whitespace-pre-wrap">
                {result}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

export { CaptionGenerator as MarketingKitGenerator };
