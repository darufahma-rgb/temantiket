import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

type TravelSearchBarProps = {
  placeholder: string;
  onClick?: () => void;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
};

export function TravelSearchBar({
  placeholder,
  onClick,
  value,
  onChange,
  className,
}: TravelSearchBarProps) {
  const isStatic = !!onClick && onChange === undefined;

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 h-11 px-3.5 rounded-2xl bg-white border border-[#E5EAF3] shadow-[0_4px_14px_rgba(10,31,68,0.06)]",
        className,
      )}
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <Search className="h-4 w-4 text-[#667085] shrink-0" strokeWidth={2} />
      {isStatic ? (
        <button
          onClick={onClick}
          className="flex-1 text-left text-[12.5px] text-[#667085] bg-transparent outline-none truncate"
        >
          {placeholder}
        </button>
      ) : (
        <input
          type="text"
          placeholder={placeholder}
          value={value ?? ""}
          onChange={(e) => onChange?.(e.target.value)}
          className="flex-1 text-[12.5px] text-[#071133] placeholder:text-[#667085] bg-transparent outline-none min-w-0"
        />
      )}
    </div>
  );
}
