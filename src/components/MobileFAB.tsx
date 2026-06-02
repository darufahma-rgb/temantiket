import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import { useState, useEffect } from "react";

export interface FABAction {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

interface MobileFABProps {
  onClick?: () => void;
  icon?: React.ReactNode;
  label?: string;
  actions?: FABAction[];
}

const FAB_BOTTOM = "calc(78px + env(safe-area-inset-bottom, 0px))";

const GRADIENT = "linear-gradient(135deg, #0866FF, #0654D6)";
const SHADOW   = "0 8px 24px -4px rgba(8,102,255,0.48)";

function useKeyboardOpen() {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const vp = window.visualViewport;
    if (!vp) return;
    const check = () => setKeyboardOpen(window.innerHeight - vp.height > 150);
    vp.addEventListener("resize", check);
    vp.addEventListener("scroll", check);
    return () => { vp.removeEventListener("resize", check); vp.removeEventListener("scroll", check); };
  }, []);
  return keyboardOpen;
}

export function MobileFAB({ onClick, icon, label, actions }: MobileFABProps) {
  const [open, setOpen] = useState(false);
  const keyboardOpen = useKeyboardOpen();
  const hasActions = actions && actions.length > 0;

  if (hasActions) {
    return (
      <div
        className="md:hidden fixed z-40 right-4"
        style={{
          bottom: FAB_BOTTOM,
          transform: keyboardOpen ? "translateY(200%)" : "translateY(0)",
          transition: "transform 300ms cubic-bezier(0.16, 1, 0.3, 1)",
          pointerEvents: keyboardOpen ? "none" : undefined,
          willChange: "transform",
        }}
      >
        <AnimatePresence>
          {open && (
            <motion.div
              key="speed-dial"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-[68px] right-0 flex flex-col gap-2.5 items-end"
            >
              {actions.map((action, i) => (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, y: 16, scale: 0.82 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.88 }}
                  transition={{ type: "spring", stiffness: 420, damping: 28, delay: i * 0.055 }}
                  onClick={() => { action.onClick(); setOpen(false); }}
                  className="flex items-center gap-2 h-10 pl-3 pr-4 rounded-full text-white text-[12.5px] font-semibold active:scale-95 transition-transform"
                  style={{ background: GRADIENT, boxShadow: "0 4px 14px rgba(8,102,255,0.38)" }}
                >
                  <span className="flex items-center justify-center h-5 w-5">{action.icon}</span>
                  {action.label}
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {open && (
          <div
            className="fixed inset-0 z-[-1]"
            onClick={() => setOpen(false)}
            aria-hidden
          />
        )}

        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 340, damping: 24, delay: 0.1 }}
          whileTap={{ scale: 0.88 }}
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Tutup menu" : "Buka menu aksi"}
          className="h-14 w-14 rounded-full flex items-center justify-center text-white"
          style={{ background: GRADIENT, boxShadow: SHADOW }}
        >
          <motion.span
            animate={{ rotate: open ? 45 : 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="flex"
          >
            <Plus className="h-6 w-6" />
          </motion.span>
        </motion.button>
      </div>
    );
  }

  return (
    <motion.button
      className="md:hidden fixed z-40 right-4 h-14 rounded-full flex items-center gap-2 px-5 text-white text-[13px] font-bold"
      style={{
        bottom: FAB_BOTTOM,
        background: GRADIENT,
        boxShadow: SHADOW,
        transform: keyboardOpen ? "translateY(200%)" : undefined,
        transition: "transform 300ms cubic-bezier(0.16, 1, 0.3, 1)",
        pointerEvents: keyboardOpen ? "none" : undefined,
        willChange: "transform",
      }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 340, damping: 24, delay: 0.12 }}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      aria-label={label ?? "Tambah"}
    >
      <span className="flex items-center justify-center">{icon ?? <Plus className="h-5 w-5" />}</span>
      {label && <span>{label}</span>}
    </motion.button>
  );
}
