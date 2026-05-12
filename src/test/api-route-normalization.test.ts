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
