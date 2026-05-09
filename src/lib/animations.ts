import type { Variants } from "framer-motion";

/** Fade up — gunakan sebagai variants pada motion.div */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] },
  }),
};

/** Fade in tanpa y-offset */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: (i: number = 0) => ({
    opacity: 1,
    transition: { duration: 0.22, delay: i * 0.04, ease: "easeOut" },
  }),
};

/** Scale masuk — bagus untuk modal / card pop */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.24, ease: [0.16, 1, 0.3, 1] },
  },
};

/** Slide dari kiri */
export const slideFromLeft: Variants = {
  hidden: { opacity: 0, x: -12 },
  visible: (i: number = 0) => ({
    opacity: 1,
    x: 0,
    transition: { duration: 0.28, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] },
  }),
};

/** Container stagger — bungkus children yang punya variants */
export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.05, delayChildren: 0.04 },
  },
};

/** Stagger lebih cepat untuk list panjang */
export const staggerFast: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.035, delayChildren: 0.03 },
  },
};

/** whileHover preset — angkat kartu */
export const cardHover = {
  y: -3,
  boxShadow: "0 10px 28px -8px rgba(0,0,0,0.12)",
  transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] },
};

/** whileHover preset — angkat tipis */
export const cardHoverSubtle = {
  y: -2,
  boxShadow: "0 6px 18px -6px rgba(0,0,0,0.09)",
  transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] },
};

/** whileTap preset — tekan tombol */
export const tapScale = { scale: 0.97, transition: { duration: 0.1 } };

/** whileTap ringan */
export const tapScaleLight = { scale: 0.985, transition: { duration: 0.1 } };
