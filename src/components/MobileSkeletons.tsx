/**
 * MobileSkeletons — Reusable skeleton loading components untuk halaman mobile.
 *
 * Pakai `skeleton-shimmer` class dari index.css untuk animasi shimmer biru-navy.
 * Semua skeleton responsif: tampil di mobile, desktop fallback ke spinner biasa.
 */

import { cn } from "@/lib/utils";

// ── Generic card skeleton (list item: icon + 2 teks + badge) ─────────────────
export function MobileCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[hsl(var(--border))] p-3.5 flex items-center gap-3 overflow-hidden",
        className,
      )}
      aria-hidden
    >
      <div className="h-10 w-10 rounded-xl skeleton-shimmer shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-3 skeleton-shimmer rounded-full w-3/4" />
        <div className="h-2.5 skeleton-shimmer rounded-full w-1/2" />
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <div className="h-5 w-16 skeleton-shimmer rounded-full" />
        <div className="h-3 w-12 skeleton-shimmer rounded-full" />
      </div>
    </div>
  );
}

// ── List of card skeletons ────────────────────────────────────────────────────
export function MobileListSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("space-y-2.5", className)} aria-busy aria-label="Memuat data…">
      {Array.from({ length: count }).map((_, i) => (
        <MobileCardSkeleton key={i} />
      ))}
    </div>
  );
}

// ── Package card skeleton (cover image + body) ───────────────────────────────
export function MobilePackageCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[hsl(var(--border))] overflow-hidden",
        className,
      )}
      aria-hidden
    >
      <div className="h-[118px] skeleton-shimmer" />
      <div className="p-3.5 space-y-2.5">
        <div className="h-3.5 skeleton-shimmer rounded-full w-3/4" />
        <div className="h-2.5 skeleton-shimmer rounded-full w-1/2" />
        <div className="flex gap-2 mt-1">
          <div className="h-5 w-16 skeleton-shimmer rounded-full" />
          <div className="h-5 w-12 skeleton-shimmer rounded-full" />
        </div>
        <div className="h-1.5 skeleton-shimmer rounded-full w-full" />
      </div>
    </div>
  );
}

// ── Stat row skeleton (3-4 stat tiles in a row) ───────────────────────────────
export function MobileStatRowSkeleton({ cols = 3 }: { cols?: 2 | 3 | 4 }) {
  return (
    <div className={cn("grid gap-3", cols === 2 && "grid-cols-2", cols === 3 && "grid-cols-3", cols === 4 && "grid-cols-2 sm:grid-cols-4")}>
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-[hsl(var(--border))] p-3 space-y-2" aria-hidden>
          <div className="h-2.5 skeleton-shimmer rounded-full w-2/3" />
          <div className="h-6 skeleton-shimmer rounded-lg w-3/4" />
          <div className="h-2 skeleton-shimmer rounded-full w-1/2" />
        </div>
      ))}
    </div>
  );
}

// ── Dashboard hero card skeleton ──────────────────────────────────────────────
export function MobileDashboardSkeleton() {
  return (
    <div className="space-y-4 pb-4 px-5">
      {/* Greeting row */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl skeleton-shimmer shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-2 skeleton-shimmer rounded-full w-24" />
          <div className="h-3.5 skeleton-shimmer rounded-full w-40" />
        </div>
        <div className="h-8 w-8 skeleton-shimmer rounded-xl shrink-0" />
      </div>

      {/* Hero card */}
      <div className="h-[120px] rounded-2xl skeleton-shimmer" />

      {/* Quick action icons row */}
      <div className="flex gap-3.5 overflow-hidden">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 min-w-[48px] shrink-0">
            <div className="h-11 w-11 rounded-[13px] skeleton-shimmer" />
            <div className="h-2 skeleton-shimmer rounded-full w-8" />
          </div>
        ))}
      </div>

      {/* Two card skeletons */}
      <MobileCardSkeleton />
      <MobileCardSkeleton />
      <MobileCardSkeleton />
    </div>
  );
}

// ── Staff dashboard skeleton ──────────────────────────────────────────────────
export function MobileStaffDashboardSkeleton() {
  return (
    <div className="space-y-4 pb-4">
      {/* Header card */}
      <div className="rounded-2xl border border-[hsl(var(--border))] p-4 space-y-2">
        <div className="h-2 skeleton-shimmer rounded-full w-24" />
        <div className="h-5 skeleton-shimmer rounded-full w-48" />
        <div className="h-2.5 skeleton-shimmer rounded-full w-32" />
      </div>

      {/* Stat row */}
      <MobileStatRowSkeleton cols={3} />

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-[hsl(var(--border))] p-3 space-y-2" aria-hidden>
            <div className="h-8 w-8 skeleton-shimmer rounded-lg" />
            <div className="h-2.5 skeleton-shimmer rounded-full w-3/4" />
          </div>
        ))}
      </div>

      {/* Recent list */}
      <div className="space-y-2">
        <div className="h-3 skeleton-shimmer rounded-full w-28" />
        {[1, 2, 3].map((i) => (
          <MobileCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

// ── Generic page header skeleton (title + subtitle) ───────────────────────────
export function MobilePageHeaderSkeleton() {
  return (
    <div className="mb-4 space-y-1.5" aria-hidden>
      <div className="h-5 skeleton-shimmer rounded-full w-40" />
      <div className="h-3 skeleton-shimmer rounded-full w-56" />
    </div>
  );
}
