/**
 * MarkdownContent — shared premium markdown renderer
 * Uses react-markdown + remark-gfm (already installed).
 * Safe, XSS-free (no dangerouslySetInnerHTML).
 *
 * Props:
 *   content   — raw markdown string
 *   size      — "xs" | "sm" | "md"  (controls font sizes)
 *   prose     — true = add extra vertical spacing between blocks (article feel)
 *   className — wrapper class overrides
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
    h1: "text-[13px] font-extrabold",
    h2: "text-[12px] font-bold",
    h3: "text-[11.5px] font-semibold",
    h4: "text-[11px] font-semibold",
    p:  "text-[11.5px]",
    li: "text-[11.5px]",
    code: "text-[10.5px]",
    blockquote: "text-[11px]",
  },
  sm: {
    h1: "text-[15px] font-extrabold",
    h2: "text-[13.5px] font-bold",
    h3: "text-[12.5px] font-semibold",
    h4: "text-[12px] font-semibold",
    p:  "text-[12.5px]",
    li: "text-[12.5px]",
    code: "text-[11px]",
    blockquote: "text-[12px]",
  },
  md: {
    h1: "text-[18px] font-extrabold",
    h2: "text-[15.5px] font-bold",
    h3: "text-[13.5px] font-semibold",
    h4: "text-[13px] font-semibold",
    p:  "text-[13.5px]",
    li: "text-[13.5px]",
    code: "text-[12px]",
    blockquote: "text-[13px]",
  },
};

export function MarkdownContent({
  content,
  size = "sm",
  prose = false,
  className,
}: MarkdownContentProps) {
  const s = SIZE[size];
  const gap = prose ? "space-y-3" : "space-y-1.5";

  return (
    <div className={cn("min-w-0 break-words", gap, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          /* ── Headings ─────────────────────────────────────── */
          h1: ({ children }) => (
            <h1 className={cn(s.h1, "text-foreground leading-snug mt-4 mb-1 first:mt-0 border-b border-border pb-1")}>
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className={cn(s.h2, "text-foreground leading-snug mt-3.5 mb-1 first:mt-0")}>
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className={cn(s.h3, "text-foreground/90 leading-snug mt-3 mb-0.5 first:mt-0")}>
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className={cn(s.h4, "text-foreground/80 leading-snug mt-2 mb-0.5 first:mt-0")}>
              {children}
            </h4>
          ),

          /* ── Paragraph ────────────────────────────────────── */
          p: ({ children }) => (
            <p className={cn(s.p, "leading-relaxed text-foreground/85 last:mb-0")}>
              {children}
            </p>
          ),

          /* ── Lists ────────────────────────────────────────── */
          ul: ({ children }) => (
            <ul className="pl-1 space-y-0.5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="pl-4 list-decimal space-y-0.5 marker:text-muted-foreground">{children}</ol>
          ),
          li: ({ children, ...props }) => {
            const isOrdered = (props as Record<string, unknown>).ordered === true
              || (props as Record<string, unknown>).node
                ? false
                : false;
            return (
              <li className={cn(
                s.li, "leading-relaxed text-foreground/85",
                !isOrdered && "flex gap-2 items-start list-none",
              )}>
                {!isOrdered && (
                  <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-primary/40 shrink-0" />
                )}
                <span className="flex-1 min-w-0">{children}</span>
              </li>
            );
          },

          /* ── Inline ───────────────────────────────────────── */
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-foreground/70">{children}</em>
          ),
          del: ({ children }) => (
            <del className="line-through text-muted-foreground">{children}</del>
          ),

          /* ── Blockquote ───────────────────────────────────── */
          blockquote: ({ children }) => (
            <blockquote className={cn(
              s.blockquote,
              "border-l-[3px] border-primary/30 pl-3 italic text-muted-foreground my-1 rounded-r-sm bg-muted/20 py-1",
            )}>
              {children}
            </blockquote>
          ),

          /* ── Code ─────────────────────────────────────────── */
          code: ({ children, className: cls }) => {
            const isBlock = cls?.includes("language-");
            if (isBlock) {
              return (
                <pre className="bg-muted/50 border border-border rounded-lg px-3 py-2.5 overflow-x-auto my-1.5">
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

          /* ── HR ───────────────────────────────────────────── */
          hr: () => <hr className="border-border/60 my-2" />,

          /* ── Table (GFM) ──────────────────────────────────── */
          table: ({ children }) => (
            <div className="overflow-x-auto my-1.5 rounded-lg border border-border">
              <table className="w-full text-[11.5px] border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/40 text-foreground/70 font-semibold">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left border-b border-border font-semibold">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-1.5 border-b border-border/40 text-foreground/80">{children}</td>
          ),

          /* ── Links ────────────────────────────────────────── */
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

          /* ── Images ───────────────────────────────────────── */
          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt}
              className="rounded-lg max-w-full h-auto border border-border/40 my-1"
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
