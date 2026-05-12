import { cn } from "@/lib/utils";

type Tone = "blue" | "green" | "yellow" | "red" | "gray" | "purple";

const TONE_CLASSES: Record<Tone, string> = {
  blue:   "bg-blue-100 text-blue-700 border-blue-200",
  green:  "bg-emerald-100 text-emerald-700 border-emerald-200",
  yellow: "bg-amber-100 text-amber-700 border-amber-200",
  red:    "bg-red-100 text-red-700 border-red-200",
  gray:   "bg-gray-100 text-gray-600 border-gray-200",
  purple: "bg-purple-100 text-purple-700 border-purple-200",
};

type TravelStatusPillProps = {
  label: string;
  tone?: Tone;
  className?: string;
};

export function TravelStatusPill({ label, tone = "gray", className }: TravelStatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
