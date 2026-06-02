---
name: Meta redesign token map
description: Mapping warna navy lama ke Meta cobalt yang sudah diterapkan ke seluruh codebase Temantiket.
---

## Perubahan yang sudah diterapkan

### Warna lama → warna baru (Meta)
| Lama | Baru | Keterangan |
|---|---|---|
| `#1a44d4` | `#0064E0` | Primary cobalt (Meta) |
| `#123499` | `#0064E0` | Caribbean blue → cobalt |
| `#0a2472` | `#0457cb` | Navy → cobalt deep |
| `#051650` | `#0a1317` | Dark navy → ink-deep |
| `#00072d` | `#0a1317` | Rich black → ink-deep |

### File yang diubah
- `tailwind.config.ts` — sky palette (navy→cobalt), borderRadius (Meta scale), ink/canvas/hairline colors
- `src/index.css` — `:root` CSS variables (light+dark), btn-primary/btn-glow, glow-pulse keyframe
- `src/pages/Login.tsx` — Full rewrite: white card, hairline inputs, cobalt pill button
- `src/components/AppSidebar.tsx` — ACCENT `#0064E0`, AI feature card gradient
- `src/pages/Dashboard.tsx` — Hero gradient, dialog button color
- 20+ komponen lainnya via `sed` bulk replace

### CSS Variables (light mode)
- `--primary: 216 100% 44%` = `#0064E0` cobalt
- `--background: 0 0% 100%` = canvas white
- `--foreground: 198 51% 7%` = `#0a1317` ink-deep
- `--border: 213 19% 89%` = `#dee3e9` hairline-soft
- `--radius: 0.5rem` = 8px (Meta lg)

**Why:** User minta redesign seluruh tampilan mengikuti DESIGN.md (Meta-inspired).

**How to apply:** Gunakan `--primary`, `bg-sky-500`, dll. Jangan hardcode warna navy lama. Untuk elemen baru gunakan kelas Tailwind `rounded-full` (pill=100px), `rounded-2xl` (24px), `rounded-3xl` (32px).
