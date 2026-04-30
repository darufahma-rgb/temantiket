import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { CalendarIcon, X } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const DISPLAY_FMT = "dd MMMM yyyy";

function formatRange(range: DateRange | undefined): string {
  if (!range?.from) return "";
  const from = format(range.from, DISPLAY_FMT, { locale: idLocale });
  if (!range.to) return from;
  const to = format(range.to, DISPLAY_FMT, { locale: idLocale });
  return `${from} - ${to}`;
}

function parseRange(value: string): DateRange | undefined {
  if (!value?.trim()) return undefined;
  const parts = value.split(/\s*(?:-|–|s\/d|sd|sampai)\s*/i);
  const tryParse = (raw: string): Date | undefined => {
    if (!raw) return undefined;
    for (const fmt of [DISPLAY_FMT, "dd MMM yyyy", "d MMMM yyyy", "d MMM yyyy", "yyyy-MM-dd", "dd/MM/yyyy"]) {
      const d = parse(raw.trim(), fmt, new Date(), { locale: idLocale });
      if (isValid(d)) return d;
    }
    const d = new Date(raw);
    return isValid(d) ? d : undefined;
  };
  const from = tryParse(parts[0]);
  if (!from) return undefined;
  const to = tryParse(parts[1] ?? "");
  return { from, to };
}

export interface DateRangePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  align?: "start" | "center" | "end";
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = "Pilih periode tanggal",
  className,
  disabled,
  align = "start",
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const range = React.useMemo(() => parseRange(value), [value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "h-8 w-full px-2 rounded-lg border border-slate-200 bg-white text-[12px] font-semibold text-left",
            "flex items-center gap-1.5 focus:outline-none focus:ring-1 focus:ring-orange-400",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            !value && "text-slate-400 font-normal",
            className,
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-orange-500" />
          <span className="truncate flex-1">{value || placeholder}</span>
          {value && !disabled && (
            <X
              className="h-3.5 w-3.5 shrink-0 text-slate-400 hover:text-red-500"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <Calendar
          mode="range"
          numberOfMonths={2}
          selected={range}
          onSelect={(r) => {
            onChange(formatRange(r));
            if (r?.from && r?.to) setOpen(false);
          }}
          locale={idLocale}
          defaultMonth={range?.from}
          initialFocus
        />
        <div className="flex items-center justify-between border-t p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-[11px]"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            Reset
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 text-[11px] bg-orange-500 hover:bg-orange-600"
            onClick={() => setOpen(false)}
          >
            Tutup
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Single-date picker variant (for fields like "Tanggal Berangkat"). */
export interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  align?: "start" | "center" | "end";
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pilih tanggal",
  className,
  disabled,
  align = "start",
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const date = React.useMemo(() => {
    if (!value) return undefined;
    const d = parse(value, "yyyy-MM-dd", new Date());
    if (isValid(d)) return d;
    const d2 = new Date(value);
    return isValid(d2) ? d2 : undefined;
  }, [value]);

  const display = date ? format(date, DISPLAY_FMT, { locale: idLocale }) : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "h-8 w-full px-2 rounded-lg border border-slate-200 bg-white text-[12px] font-semibold text-left",
            "flex items-center gap-1.5 focus:outline-none focus:ring-1 focus:ring-orange-400",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            !display && "text-slate-400 font-normal",
            className,
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-orange-500" />
          <span className="truncate flex-1">{display || placeholder}</span>
          {display && !disabled && (
            <X
              className="h-3.5 w-3.5 shrink-0 text-slate-400 hover:text-red-500"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            onChange(d ? format(d, "yyyy-MM-dd") : "");
            if (d) setOpen(false);
          }}
          locale={idLocale}
          defaultMonth={date}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
