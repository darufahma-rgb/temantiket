/**
 * BrandLogo — Komponen logo resmi yang dipakai di semua halaman publik.
 *
 * Menggunakan brand.ts sebagai single source of truth untuk:
 *   - logo icon path (SVG vektor, tajam di retina/HiDPI)
 *   - brand name
 *   - brand color
 *
 * Fallback "T" jika gambar gagal load.
 *
 * Penggunaan:
 *   <Link to="/"><BrandLogo /></Link>
 *   <Link to="/"><BrandLogo subtitle="Harga Tiket" /></Link>
 *   <BrandLogo iconSize={24} />
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { getBrand } from "@/config/brand";

interface BrandLogoProps {
  /** Ukuran icon dalam px (lebar & tinggi). Default: 28 */
  iconSize?: number;
  /** Ukuran teks brand name dalam px. Default: 15 */
  textSize?: number;
  /** Subtitle opsional di bawah brand name (contoh: "Harga Tiket Penerbangan") */
  subtitle?: string;
  /** Warna teks brand name. Default: text-slate-900 */
  textColorClass?: string;
  /** Gap antara icon dan teks. Default: gap-2 */
  gapClass?: string;
  /** Kelas tambahan untuk wrapper div */
  className?: string;
  /** Force PNG icon (retina-safe fallback for environments without SVG support) */
  forcePng?: boolean;
}

export function BrandLogo({
  iconSize    = 28,
  textSize    = 15,
  subtitle,
  textColorClass = "text-slate-900",
  gapClass    = "gap-2",
  className,
  forcePng    = false,
}: BrandLogoProps) {
  const [imgError, setImgError] = useState(false);
  const brand = getBrand();
  const iconSrc = forcePng ? "/temantiket-icon.png" : brand.logoIcon;

  return (
    <div className={cn("flex items-center shrink-0", gapClass, className)}>
      {/* Icon mark — SVG vektor, tajam di retina, fallback teks jika gagal */}
      {imgError ? (
        <span
          className="shrink-0 font-black select-none leading-none"
          style={{
            fontSize: iconSize * 0.75,
            color: brand.brandColor,
            width: iconSize,
            height: iconSize,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-hidden="true"
        >
          {brand.name.charAt(0)}
        </span>
      ) : (
        <img
          src={iconSrc}
          alt=""
          aria-hidden="true"
          width={iconSize}
          height={iconSize}
          loading="eager"
          decoding="async"
          className="shrink-0 object-contain"
          style={{ width: iconSize, height: iconSize }}
          onError={() => setImgError(true)}
        />
      )}

      {/* Brand name + optional subtitle */}
      <div className="flex flex-col min-w-0 leading-none">
        <span
          className={cn("font-black tracking-[-0.03em] leading-none select-none", textColorClass)}
          style={{ fontSize: textSize }}
        >
          {brand.name}
        </span>
        {subtitle && (
          <span className="text-[10px] text-slate-400 mt-[3px] leading-none select-none whitespace-nowrap">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}
