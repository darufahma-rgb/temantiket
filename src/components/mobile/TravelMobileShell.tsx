import { cn } from "@/lib/utils";

type TravelMobileShellProps = {
  children: React.ReactNode;
  className?: string;
};

export function TravelMobileShell({ children, className }: TravelMobileShellProps) {
  return (
    <div
      className={cn(
        "min-h-screen bg-[#F5F7FB] overflow-x-hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}
