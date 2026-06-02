---
name: DESIGN.md reference
description: Temantiket memiliki DESIGN.md di root project yang harus dibaca sebelum menulis UI apapun. File ini berisi design tokens Meta-inspired (warna, tipografi, spacing, komponen).
---

## Aturan

Sebelum menulis atau mengedit komponen / halaman UI apapun, baca `DESIGN.md` di root project.

**Why:** User secara eksplisit meminta agar DESIGN.md dipakai sebagai referensi wajib sebelum menulis UI.

**How to apply:**
- Buka `DESIGN.md` sebelum membuat komponen baru, halaman baru, atau redesign apapun.
- Gunakan token warna, tipografi, spacing, dan radius yang ada di file tersebut sebagai acuan.
- File berada di: `DESIGN.md` (root project, 684 baris).

## Ringkasan isi DESIGN.md

- **Inspirasi:** Meta design system (Quest, Ray-Ban Meta)
- **Font utama:** Optimistic VF (untuk heading/display) + font existing project
- **Primary color:** `#0064E0` (cobalt blue) / ink button: `#000000`
- **Canvas:** `#ffffff`, surface-soft: `#f1f4f7`
- **Border radius:** pill = `100px` (full), card = `24-32px`, button = `100px`
- **Spacing scale:** 4 / 8 / 10 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 / 80 / 120px
- **Button pattern:** pill-shaped, dual CTA (black primary + outlined secondary + cobalt blue buy CTA)
- **Card pattern:** full-bleed photo, generous rounding (24-32px), stark white bg
