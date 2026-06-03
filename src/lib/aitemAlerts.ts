import { useOrdersStore } from "@/store/ordersStore";
import { useClientsStore } from "@/store/clientsStore";
import { useTripsStore } from "@/store/tripsStore";

export interface AitemAlert {
  id: string;
  type: "warning" | "info" | "urgent";
  title: string;
  message: string;
  action?: { label: string; prompt: string };
}

export function generateAitemAlerts(): AitemAlert[] {
  const alerts: AitemAlert[] = [];
  const orders = useOrdersStore.getState().orders;
  const clients = useClientsStore.getState().clients;
  const trips = useTripsStore.getState().trips;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7Days = new Date(today);
  in7Days.setDate(in7Days.getDate() + 7);
  const in30Days = new Date(today);
  in30Days.setDate(in30Days.getDate() + 30);

  // 1. Paspor akan expired dalam 30 hari
  const expiringPassports = clients.filter((c) => {
    if (!c.passportExpiry) return false;
    const exp = new Date(c.passportExpiry);
    return exp >= today && exp <= in30Days;
  });
  if (expiringPassports.length > 0) {
    alerts.push({
      id: "passport-expiry",
      type: "urgent",
      title: `${expiringPassports.length} Paspor Akan Expired`,
      message: `${expiringPassports.map((c) => c.name).slice(0, 3).join(", ")}${expiringPassports.length > 3 ? ` +${expiringPassports.length - 3} lainnya` : ""} — paspor habis dalam 30 hari`,
      action: {
        label: "Cek sekarang",
        prompt: "Siapa saja jamaah yang paspornya akan expired dalam 30 hari? Berikan daftarnya dan saran tindakan.",
      },
    });
  }

  // 2. Order Draft > 7 hari tidak bergerak
  const staleDrafts = orders.filter((o) => {
    if (o.status !== "Draft") return false;
    const created = new Date(o.createdAt ?? "");
    const diffDays = (today.getTime() - created.getTime()) / 86400000;
    return diffDays > 7;
  });
  if (staleDrafts.length > 0) {
    alerts.push({
      id: "stale-drafts",
      type: "warning",
      title: `${staleDrafts.length} Order Draft Stagnan`,
      message: `${staleDrafts.length} order sudah >7 hari di status Draft — perlu follow up`,
      action: {
        label: "Lihat detail",
        prompt: "Tampilkan order Draft yang sudah lebih dari 7 hari tidak bergerak. Siapa kliennya dan apa rekomendasinya?",
      },
    });
  }

  // 3. Keberangkatan dalam 7 hari
  const upcomingTrips = trips.filter((t) => {
    if (!t.startDate) return false;
    const dep = new Date(t.startDate);
    return dep >= today && dep <= in7Days;
  });
  if (upcomingTrips.length > 0) {
    alerts.push({
      id: "upcoming-departures",
      type: "info",
      title: `${upcomingTrips.length} Trip Berangkat Minggu Ini`,
      message: upcomingTrips.map((t) => `${t.name} (${t.startDate})`).join(", "),
      action: {
        label: "Siapkan broadcast",
        prompt: "Buatkan pesan broadcast WhatsApp untuk jamaah yang berangkat minggu ini. Sertakan reminder dokumen dan tips perjalanan.",
      },
    });
  }

  return alerts;
}
