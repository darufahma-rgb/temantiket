---
name: Replit migration
description: Key decisions made when migrating Temantiket from Replit Agent to Replit environment.
---

Supabase is the canonical data store for Temantiket. Do NOT attempt to replace it with Replit PostgreSQL.

**Why:** The app is a multi-tenant B2B SaaS deeply integrated with Supabase Auth (JWT sessions), Supabase Realtime (live sync across tabs/users), Supabase Storage (photos, docs, card backs), and Supabase RLS policies (is_member/is_owner/is_agent security-definer helpers). Replacing all of this would be a complete rewrite.

**How to apply:** Replit PostgreSQL (DATABASE_URL) is used only for the Express `sessions` table (connect-pg-simple). Schema is managed via `npm run db:push` (drizzle-kit). All Supabase secrets must live in Replit Secrets.

**Required secrets (all in Replit Secrets):**
- VITE_SUPABASE_URL — Supabase project URL
- VITE_SUPABASE_ANON_KEY — public anon key (used by frontend + server fallback)
- SUPABASE_SERVICE_ROLE_KEY — server-side only; bypasses RLS for invite/remove/bootstrap
- OPENROUTER_API_KEY — AI features (OCR, captions, AITEM assistant)
- DATABASE_URL, SESSION_SECRET, PG* — auto-provisioned by Replit

**Auth:** Custom email/password via Supabase Auth. Replit Auth NOT used — it would break the multi-tenant invite model (owner invites staff/agents via /api/invite-member). The `authStore.ts` uses Supabase JWT tokens.

**Server architecture:** All sensitive operations proxy through Express (server/index.cjs):
- Service-role key never reaches browser
- AI calls via /api/ocr, /api/caption, /api/ai/chat, /api/aitem
- Invite/remove member via /api/invite-member, /api/remove-member
- Bootstrap via /api/bootstrap
