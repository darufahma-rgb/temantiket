import { describe, it, expect } from "vitest";

/**
 * Route path extraction logic — mirrors extractPathSegments() in api/[...path].js.
 *
 * Vercel catch-all (api/[...path].js) normally populates req.query.path, but
 * when cleanUrls:true or certain rewrite configs are active it can be
 * undefined/empty. Parsing req.url is the reliable fallback.
 */
function extractPathSegments(req: {
  url: string;
  query?: { path?: string | string[] };
}): string[] {
  const qp = req.query?.path;
  if (Array.isArray(qp) && qp.length > 0 && qp[0]) return qp;
  if (typeof qp === "string" && qp) return qp.split("/").filter(Boolean);

  try {
    const base = new URL(req.url, "http://x");
    const after = base.pathname.replace(/^\/api(\/|$)/, "");
    const parts = after.split("/").filter(Boolean);
    if (parts.length > 0) return parts;
  } catch {
    /* ignore malformed URLs */
  }

  return [];
}

// ── agency_members column contract ───────────────────────────────────────────
// Mirrors the SELECT used in handleAgencyMembersGet. Only these columns exist
// in the Supabase agency_members table. phone_wa / agent_notes / agent_status
// are NOT present — they must be returned as safe null defaults.
const AGENCY_MEMBERS_COLUMNS = [
  "user_id",
  "role",
  "commission_pct",
  "created_at",
  "card_back_image_url",
] as const;

type AgencyMemberRow = { [K in (typeof AGENCY_MEMBERS_COLUMNS)[number]]: unknown };

// Simulates buildMemberResult() — the mapping logic in handleAgencyMembersGet
function buildMemberResult(
  m: AgencyMemberRow,
  profile: { email?: string | null; full_name?: string | null; photo_url?: string | null } | undefined,
  authMeta: { first_name?: string | null; last_name?: string | null; avatar_url?: string | null; full_name?: string | null } = {},
) {
  const email = profile?.email ?? null;
  const rawFullName = profile?.full_name ?? authMeta.full_name ?? "";
  const fullName = rawFullName.trim();
  const photoUrl = profile?.photo_url ?? authMeta.avatar_url ?? null;

  return {
    user_id: m.user_id,
    role: m.role,
    commission_pct: m.commission_pct ?? 0,
    created_at: m.created_at,
    card_back_image_url: m.card_back_image_url ?? null,
    email,
    first_name: authMeta.first_name ?? fullName.split(" ")[0] ?? null,
    last_name: authMeta.last_name ?? fullName.split(" ").slice(1).join(" ") ?? null,
    profile_image_url: photoUrl,
    phone_wa: null,
    agent_notes: null,
    agent_status: null,
  };
}

describe("extractPathSegments (Vercel catch-all route parser)", () => {
  describe("via req.query.path (primary — standard Vercel routing)", () => {
    it("agency-members — array form", () => {
      const req = { url: "/api/agency-members", query: { path: ["agency-members"] } };
      expect(extractPathSegments(req)).toEqual(["agency-members"]);
    });

    it("auth/user — array form", () => {
      const req = { url: "/api/auth/user", query: { path: ["auth", "user"] } };
      expect(extractPathSegments(req)).toEqual(["auth", "user"]);
    });

    it("health-check — array form", () => {
      const req = { url: "/api/health-check", query: { path: ["health-check"] } };
      expect(extractPathSegments(req)).toEqual(["health-check"]);
    });

    it("agency-members/:id — array form", () => {
      const req = { url: "/api/agency-members/abc-123", query: { path: ["agency-members", "abc-123"] } };
      expect(extractPathSegments(req)).toEqual(["agency-members", "abc-123"]);
    });

    it("string form (single segment)", () => {
      const req = { url: "/api/agency-members", query: { path: "agency-members" } };
      expect(extractPathSegments(req)).toEqual(["agency-members"]);
    });
  });

  describe("via req.url fallback (when req.query.path is missing/empty)", () => {
    it("GET /api/agency-members — no query.path", () => {
      expect(extractPathSegments({ url: "/api/agency-members" })).toEqual(["agency-members"]);
    });

    it("GET /api/agency-members?agencyId=abc — query string stripped", () => {
      expect(extractPathSegments({ url: "/api/agency-members?agencyId=abc" })).toEqual(["agency-members"]);
    });

    it("GET /api/auth/user — nested path", () => {
      expect(extractPathSegments({ url: "/api/auth/user" })).toEqual(["auth", "user"]);
    });

    it("GET /api/health-check", () => {
      expect(extractPathSegments({ url: "/api/health-check" })).toEqual(["health-check"]);
    });

    it("GET /api/agency-members/abc-123 — with subId", () => {
      expect(extractPathSegments({ url: "/api/agency-members/abc-123" })).toEqual(["agency-members", "abc-123"]);
    });

    it("empty query.path array falls through to url parser", () => {
      const req = { url: "/api/agency-members", query: { path: [] as string[] } };
      expect(extractPathSegments(req)).toEqual(["agency-members"]);
    });

    it("empty query.path string falls through to url parser", () => {
      const req = { url: "/api/health-check", query: { path: "" } };
      expect(extractPathSegments(req)).toEqual(["health-check"]);
    });

    it("query.path undefined falls through to url parser", () => {
      const req = { url: "/api/invite-member", query: { path: undefined } };
      expect(extractPathSegments(req)).toEqual(["invite-member"]);
    });
  });

  describe("destructuring [resource, subId]", () => {
    it("agency-members → resource='agency-members', subId=undefined", () => {
      const [resource, subId] = extractPathSegments({ url: "/api/agency-members" });
      expect(resource).toBe("agency-members");
      expect(subId).toBeUndefined();
    });

    it("auth/user → resource='auth', subId='user'", () => {
      const [resource, subId] = extractPathSegments({ url: "/api/auth/user" });
      expect(resource).toBe("auth");
      expect(subId).toBe("user");
    });

    it("agency-members/abc-123 → resource='agency-members', subId='abc-123'", () => {
      const [resource, subId] = extractPathSegments({ url: "/api/agency-members/abc-123" });
      expect(resource).toBe("agency-members");
      expect(subId).toBe("abc-123");
    });
  });
});

describe("agency_members column contract", () => {
  it("selected columns do not include phone_wa", () => {
    expect(AGENCY_MEMBERS_COLUMNS).not.toContain("phone_wa");
  });

  it("selected columns do not include agent_notes", () => {
    expect(AGENCY_MEMBERS_COLUMNS).not.toContain("agent_notes");
  });

  it("selected columns do not include agent_status", () => {
    expect(AGENCY_MEMBERS_COLUMNS).not.toContain("agent_status");
  });

  it("selected columns include the confirmed real columns", () => {
    expect(AGENCY_MEMBERS_COLUMNS).toContain("user_id");
    expect(AGENCY_MEMBERS_COLUMNS).toContain("role");
    expect(AGENCY_MEMBERS_COLUMNS).toContain("commission_pct");
    expect(AGENCY_MEMBERS_COLUMNS).toContain("created_at");
    expect(AGENCY_MEMBERS_COLUMNS).toContain("card_back_image_url");
  });
});

describe("handleAgencyMembersGet — member result shape", () => {
  const baseRow: AgencyMemberRow = {
    user_id: "uid-001",
    role: "owner",
    commission_pct: 0,
    created_at: "2024-01-01T00:00:00Z",
    card_back_image_url: null,
  };

  it("phone_wa is always null (not from agency_members)", () => {
    const result = buildMemberResult(baseRow, undefined);
    expect(result.phone_wa).toBeNull();
  });

  it("agent_notes is always null (not from agency_members)", () => {
    const result = buildMemberResult(baseRow, undefined);
    expect(result.agent_notes).toBeNull();
  });

  it("agent_status is always null (not from agency_members)", () => {
    const result = buildMemberResult(baseRow, undefined);
    expect(result.agent_status).toBeNull();
  });

  it("email comes from profiles table when available", () => {
    const result = buildMemberResult(baseRow, { email: "budi@agency.com" });
    expect(result.email).toBe("budi@agency.com");
  });

  it("email is null when profiles has no data", () => {
    const result = buildMemberResult(baseRow, undefined);
    expect(result.email).toBeNull();
  });

  it("full_name from profiles is split into first_name/last_name", () => {
    const result = buildMemberResult(baseRow, { full_name: "Budi Santoso" });
    expect(result.first_name).toBe("Budi");
    expect(result.last_name).toBe("Santoso");
  });

  it("profile_image_url comes from profiles.photo_url", () => {
    const result = buildMemberResult(baseRow, { photo_url: "https://cdn.example.com/photo.jpg" });
    expect(result.profile_image_url).toBe("https://cdn.example.com/photo.jpg");
  });

  it("profile_image_url falls back to auth meta avatar_url", () => {
    const result = buildMemberResult(baseRow, undefined, { avatar_url: "https://cdn.example.com/avatar.jpg" });
    expect(result.profile_image_url).toBe("https://cdn.example.com/avatar.jpg");
  });

  it("all required fields present even with no profile data", () => {
    const result = buildMemberResult(baseRow, undefined);
    expect(result).toMatchObject({
      user_id: "uid-001",
      role: "owner",
      commission_pct: 0,
      phone_wa: null,
      agent_notes: null,
      agent_status: null,
    });
  });

  it("commission_pct defaults to 0 when null", () => {
    const row = { ...baseRow, commission_pct: null };
    const result = buildMemberResult(row, undefined);
    expect(result.commission_pct).toBe(0);
  });
});
