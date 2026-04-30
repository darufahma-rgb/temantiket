import { useState, useEffect } from "react";
import { WifiOff, Wifi } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function OfflineBar() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showReconnected, setShowReconnected] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const goOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
      setShowReconnected(false);
    };

    const goOnline = () => {
      setIsOnline(true);
      if (wasOffline) {
        setShowReconnected(true);
        const t = setTimeout(() => setShowReconnected(false), 3000);
        return () => clearTimeout(t);
      }
    };

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [wasOffline]);

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          className="offline-bar"
          initial={{ y: "-100%" }}
          animate={{ y: 0 }}
          exit={{ y: "-100%" }}
          transition={{ type: "spring", stiffness: 360, damping: 34 }}
        >
          <span className="inline-flex items-center gap-1.5 justify-center">
            <WifiOff className="h-3.5 w-3.5 icon-keep text-white" />
            Tidak ada koneksi — mode offline aktif
          </span>
        </motion.div>
      )}
      {isOnline && showReconnected && (
        <motion.div
          className="offline-bar"
          style={{ background: "hsl(142 71% 45%)" }}
          initial={{ y: "-100%" }}
          animate={{ y: 0 }}
          exit={{ y: "-100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 360, damping: 34 }}
        >
          <span className="inline-flex items-center gap-1.5 justify-center">
            <Wifi className="h-3.5 w-3.5 icon-keep text-white" />
            Koneksi kembali
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
