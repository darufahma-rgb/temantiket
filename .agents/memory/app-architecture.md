---
name: Temantiket app architecture
description: Key constraints and decisions about the Temantiket app architecture
---

## Rule
Supabase is the core BaaS for this app — auth (JWT), PostgreSQL with RLS policies, Realtime, and Storage are deeply integrated throughout the frontend and backend. It must NOT be replaced with Replit Postgres or Replit Auth.

**Why:** RLS policies use security-definer helpers (`public.is_member()`, `public.is_owner()`, `public.is_agent()`), and the auth system is Supabase JWT throughout the entire frontend (authStore, all API calls). Replacing it would require a full rewrite.

**How to apply:**
- Keep `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in Replit Secrets.
- Service-role operations stay in Express (`server/index.cjs`) — never expose service role key to frontend.
- AI calls (OpenRouter) proxy through Express — `OPENROUTER_API_KEY` stays server-side only.
- Schema changes go through Supabase SQL Editor using `supabase/schema.sql` as source of truth.
- Do NOT modify `supabase/schema.sql`, `supabase/migrations/`, `supabase/functions/`, or `public/templates/promo/`.
