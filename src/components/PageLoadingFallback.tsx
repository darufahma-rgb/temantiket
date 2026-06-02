/**
 * PageLoadingFallback — ditampilkan saat React.lazy() sedang memuat chunk halaman.
 * Desain mirip DashboardLayout agar transisi tidak "melompat".
 */
export function PageLoadingFallback() {
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ background: "hsl(var(--background))" }}
      aria-busy
      aria-label="Memuat halaman…"
    >
      {/* Mobile placeholder header */}
      <div
        className="md:hidden fixed z-50"
        style={{
          top: "calc(8px + env(safe-area-inset-top, 0px))",
          left: 8,
          right: 8,
          height: 48,
          borderRadius: 16,
          background: "color-mix(in srgb, hsl(var(--card)) 97%, transparent)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
        }}
      />

      {/* Content skeleton */}
      <div
        className="layout-safe-inset px-4 md:px-10 space-y-3 pt-20 md:pt-8"
      >
        {/* Page title bar */}
        <div className="flex items-center justify-between mb-4">
          <div className="h-6 skeleton-shimmer rounded-xl w-36" />
          <div className="h-8 skeleton-shimmer rounded-xl w-20" />
        </div>

        {/* Stat row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-2xl border border-[hsl(var(--border))] p-4 space-y-2">
              <div className="h-2.5 skeleton-shimmer rounded-full w-2/3" />
              <div className="h-7 skeleton-shimmer rounded-lg w-3/4" />
              <div className="h-2 skeleton-shimmer rounded-full w-1/2" />
            </div>
          ))}
        </div>

        {/* Card list */}
        <div className="space-y-2.5 mt-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-[hsl(var(--border))] p-3.5 flex items-center gap-3"
            >
              <div className="h-10 w-10 rounded-xl skeleton-shimmer shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="h-3 skeleton-shimmer rounded-full w-3/4" />
                <div className="h-2.5 skeleton-shimmer rounded-full w-1/2" />
              </div>
              <div className="h-5 w-14 skeleton-shimmer rounded-full shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Fallback ringan untuk halaman publik (tanpa DashboardLayout chrome).
 */
export function PublicPageLoadingFallback() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4"
      style={{ background: "hsl(var(--background))" }}
      aria-busy
    >
      <div className="h-10 w-10 rounded-full border-2 border-[#0866FF] border-t-transparent animate-spin" />
      <p className="text-[13px] text-[hsl(var(--muted-foreground))] font-medium">Memuat…</p>
    </div>
  );
}
