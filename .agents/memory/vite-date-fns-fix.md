---
name: Vite date-fns fix
description: How to fix date-fns v3 resolution failure in Vite 5 dep optimizer
---

## Rule
Add `esbuildOptions: { conditions: ["browser", "module", "import", "default"] }` to `optimizeDeps` in `vite.config.ts`.

**Why:** Vite 5's dep scanner fails to resolve `date-fns` v3 exports map without explicit ESM conditions, throwing "Failed to resolve entry for package date-fns". The fix is to declare browser/module conditions for esbuild's resolver, not to add an alias.

**How to apply:** Any time date-fns (v3.x) is used with Vite 5. Do NOT alias date-fns to index.js — that breaks sub-path imports like `date-fns/locale`.
