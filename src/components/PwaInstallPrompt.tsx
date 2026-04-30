import { useState, useEffect } from "react";
import { Download, X, Share, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode(): boolean {
  return (
    ("standalone" in window.navigator && (window.navigator as any).standalone) ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

const DISMISS_KEY = "pwa-install-dismissed";
const DISMISS_DAYS = 7;

function wasDismissedRecently(): boolean {
  const ts = localStorage.getItem(DISMISS_KEY);
  if (!ts) return false;
  return Date.now() - parseInt(ts) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isInStandaloneMode() || wasDismissedRecently()) return;

    if (isIos()) {
      const timer = setTimeout(() => {
        setShowIosGuide(true);
        setVisible(true);
      }, 4000);
      return () => clearTimeout(timer);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      const timer = setTimeout(() => setVisible(true), 4000);
      return () => clearTimeout(timer);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
    }
    setDeferredPrompt(null);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="pwa-install-banner"
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
        >
          {showIosGuide ? (
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl overflow-hidden shrink-0 shadow">
                <img src="/logo-igh-tour.png" alt="IGH Tour" className="h-full w-full object-contain" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[13.5px] text-[hsl(var(--foreground))] leading-tight mb-0.5">
                  Pasang IGH Tour di Home Screen
                </p>
                <p className="text-[11.5px] text-[hsl(var(--muted-foreground))] leading-snug">
                  Ketuk{" "}
                  <span className="inline-flex items-center gap-0.5 align-middle">
                    <Share className="h-3 w-3 text-blue-500 icon-keep" />
                  </span>
                  {" "}lalu pilih{" "}
                  <span className="font-semibold text-[hsl(var(--foreground))]">
                    <Plus className="inline h-3 w-3 align-middle icon-keep" /> Add to Home Screen
                  </span>
                </p>
              </div>
              <button
                onClick={handleDismiss}
                className="h-7 w-7 flex items-center justify-center rounded-full text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] shrink-0"
              >
                <X className="h-3.5 w-3.5 icon-keep" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl overflow-hidden shrink-0 shadow">
                <img src="/logo-igh-tour.png" alt="IGH Tour" className="h-full w-full object-contain" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[13.5px] text-[hsl(var(--foreground))] leading-tight">Pasang IGH Tour</p>
                <p className="text-[11.5px] text-[hsl(var(--muted-foreground))]">Akses cepat dari layar utama</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={handleDismiss}
                  className="h-7 w-7 flex items-center justify-center rounded-full text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]"
                >
                  <X className="h-3.5 w-3.5 icon-keep" />
                </button>
                <Button
                  size="sm"
                  className="rounded-xl gradient-primary text-white h-8 text-xs font-semibold px-3"
                  onClick={handleInstall}
                >
                  <Download className="h-3.5 w-3.5 mr-1 icon-keep" />
                  Pasang
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
