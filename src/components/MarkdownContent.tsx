/**
 * MarkdownContent — shared premium markdown renderer
 * Uses react-markdown + remark-gfm (already installed).
 * Safe, XSS-free (no dangerouslySetInnerHTML).
 *
 * Props:
 *   content   — raw markdown string
 *   size      — "xs" | "sm" | "md"  (controls font sizes)
 *   prose     — true = extra vertical breathing room between blocks
 *   className — wrapper class overrides
 *
 * Typography goals (Notion / Linear / ChatGPT style):
 *   - Clear heading hierarchy: H1 > H2 > H3 visually distinct
 *   - Paragraphs: font-normal (400), line-height 1.8 — never bold
 *   - Bold (**text**): truly font-bold (700), clearly heavier than body
 *   - Generous vertical rhythm between blocks
 *   - Bullet items have breathing room, not cramped
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

type MarkdownSize = "xs" | "sm" | "md";

interface MarkdownContentProps {
  content: string;
  size?: MarkdownSize;
  prose?: boolean;
  className?: string;
}

const SIZE: Record<MarkdownSize, {
  h1: string; h2: string; h3: string; h4: string;
  p: string; li: string; code: string; blockquote: string;
}> = {
  xs: {
    h1:         "text-[13px] font-bold",
    h2:         "text-[12px] font-bold",
    h3:         "text-[11.5px] font-semibold",
    h4:         "text-[11px] font-semibold",
    p:          "text-[11.5px] font-normal",
    li:         "text-[11.5px] font-normal",
    code:       "text-[10.5px]",
    blockquote: "text-[11px] font-normal",
  },
  sm: {
    h1:         "text-[16px] font-bold",
    h2:         "text-[14px] font-bold",
    h3:         "text-[12.5px] font-semibold",
    h4:         "text-[12px] font-semibold",
    p:          "text-[13px] font-normal",
    li:         "text-[13px] font-normal",
    code:       "text-[11px]",
    blockquote: "text-[12px] font-normal",
  },
  md: {
    h1:         "text-[20px] font-bold",
    h2:         "text-[17px] font-bold",
    h3:         "text-[14.5px] font-semibold",
    h4:         "text-[13.5px] font-semibold",
    p:          "text-[14px] font-normal",
    li:         "text-[14px] font-normal",
    code:       "text-[12.5px]",
    blockquote: "text-[13.5px] font-normal",
  },
};

export function MarkdownContent({
  content,
  size = "sm",
  prose = false,
  className,
}: MarkdownContentProps) {
  const s = SIZE[size];
  const gap = prose ? "space-y-5" : "space-y-3";

  return (
    <div className={cn("min-w-0 break-words font-normal", gap, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          /* ── Headings ─────────────────────────────────────────────────────
             Clear visual hierarchy: each level meaningfully smaller.
             Generous top margin separates sections, bottom margin
             keeps heading close to its content.
          ── */
          h1: ({ children }) => (
            <h1 className={cn(
              s.h1,
              "text-foreground leading-tight tracking-tight",
              "mt-8 mb-3 first:mt-0",
              "border-b border-border/40 pb-2",
            )}>
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className={cn(
              s.h2,
              "text-foreground leading-tight tracking-tight",
              "mt-7 mb-2.5 first:mt-0",
            )}>
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className={cn(
              s.h3,
              "text-foreground/90 leading-snug",
              "mt-5 mb-2 first:mt-0",
            )}>
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className={cn(
              s.h4,
              "text-foreground/80 leading-snug",
              "mt-4 mb-1.5 first:mt-0",
            )}>
              {children}
            </h4>
          ),

          /* ── Paragraph ────────────────────────────────────────────────────
             font-normal (400) + line-height 1.8 for comfortable reading.
             Must never appear bold — explicitly set font-normal.
          ── */
          p: ({ children }) => (
            <p className={cn(
              s.p,
              "leading-[1.8] text-foreground/80",
              "last:mb-0",
            )}>
              {children}
            </p>
          ),

          /* ── Lists ────────────────────────────────────────────────────────
             More vertical space between items so they breathe.
             Bullet uses a small colored dot that doesn't dominate.
          ── */
          ul: ({ children }) => (
            <ul className="pl-0.5 space-y-2.5 my-1.5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="pl-5 list-decimal space-y-2.5 my-1.5 marker:text-muted-foreground/60">{children}</ol>
          ),
          li: ({ children }) => (
            <li className={cn(
              s.li,
              "leading-[1.75] text-foreground/80",
              "flex gap-2.5 items-start list-none",
            )}>
              <span className="mt-[0.45em] h-1.5 w-1.5 rounded-full bg-primary/40 shrink-0 flex-none" />
              <span className="flex-1 min-w-0">{children}</span>
            </li>
          ),

          /* ── Inline ───────────────────────────────────────────────────────
             CRITICAL: strong must be font-bold (700), clearly heavier than
             body text (400). font-semibold (600) is not visually distinct
             enough at small sizes.
          ── */
          strong: ({ children }) => (
            <strong className="font-bold text-foreground">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-foreground/65 not-italic-reset">
              {children}
            </em>
          ),
          del: ({ children }) => (
            <del className="line-through text-muted-foreground/70">{children}</del>
          ),

          /* ── Blockquote ───────────────────────────────────────────────────
             font-normal — blockquotes should not appear heavier than body.
             Subtle left border + muted background for clear visual grouping.
          ── */
          blockquote: ({ children }) => (
            <blockquote className={cn(
              s.blockquote,
              "border-l-[3px] border-primary/35 pl-4",
              "text-foreground/65 my-4 rounded-r-md",
              "bg-muted/20 py-3 pr-3",
            )}>
              {children}
            </blockquote>
          ),

          /* ── Code ─────────────────────────────────────────────────────── */
          code: ({ children, className: cls }) => {
            const isBlock = cls?.includes("language-");
            if (isBlock) {
              return (
                <pre className="bg-muted/50 border border-border/60 rounded-lg px-4 py-3.5 overflow-x-auto my-4">
                  <code className={cn(s.code, "font-mono text-foreground/80 leading-relaxed", cls)}>
                    {children}
                  </code>
                </pre>
              );
            }
            return (
              <code className={cn(
                s.code,
                "bg-muted/60 text-foreground/80 px-1.5 py-0.5 rounded font-mono border border-border/50",
              )}>
                {children}
              </code>
            );
          },

          /* ── HR ───────────────────────────────────────────────────────── */
          hr: () => <hr className="border-border/40 my-6" />,

          /* ── Table (GFM) ─────────────────────────────────────────────── */
          table: ({ children }) => (
            <div className="overflow-x-auto my-4 rounded-lg border border-border">
              <table className="w-full text-[11.5px] border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/40 text-foreground/70">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2.5 text-left border-b border-border font-semibold text-[11px] uppercase tracking-wide">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 border-b border-border/40 text-foreground/80">{children}</td>
          ),

          /* ── Links ───────────────────────────────────────────────────── */
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:text-primary/70 transition-colors"
            >
              {children}
            </a>
          ),

          /* ── Images ──────────────────────────────────────────────────── */
          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt}
              className="rounded-lg max-w-full h-auto border border-border/40 my-3"
              loading="lazy"
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default MarkdownContent;
