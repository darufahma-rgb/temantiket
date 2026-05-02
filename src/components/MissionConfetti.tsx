import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Particle {
  id: number;
  x: number;
  color: string;
  size: number;
  delay: number;
  rotate: number;
}

const COLORS = [
  "#0ea5e9", "#f97316", "#10b981", "#f59e0b",
  "#8b5cf6", "#ec4899", "#14b8a6", "#ef4444",
];

function generateParticles(count = 40): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    size: Math.random() * 8 + 4,
    delay: Math.random() * 0.4,
    rotate: Math.random() * 360,
  }));
}

interface Props {
  show: boolean;
  onDone?: () => void;
}

export function MissionConfetti({ show, onDone }: Props) {
  const [particles] = useState(() => generateParticles(48));

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => onDone?.(), 2600);
    return () => clearTimeout(t);
  }, [show, onDone]);

  return (
    <AnimatePresence>
      {show && (
        <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden">
          {particles.map((p) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 1, y: -20, x: `${p.x}vw`, rotate: 0, scale: 1 }}
              animate={{
                opacity: [1, 1, 0],
                y: ["0vh", "60vh", "100vh"],
                rotate: p.rotate,
                scale: [1, 0.8, 0.4],
              }}
              transition={{
                duration: 2.2,
                delay: p.delay,
                ease: "easeIn",
              }}
              style={{
                position: "absolute",
                top: 0,
                width: p.size,
                height: p.size,
                borderRadius: Math.random() > 0.5 ? "50%" : "2px",
                backgroundColor: p.color,
              }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}
