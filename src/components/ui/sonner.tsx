import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  // Di mobile/PWA: top-center supaya nggak ketutup bottom-nav setinggi ~60px,
  // dan jaga jarak dari notch/Dynamic Island lewat safe-area-inset-top.
  // Di desktop: tetap bottom-right (default Sonner).
  const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position={isMobile ? "top-center" : "bottom-right"}
      offset={
        isMobile
          ? "calc(env(safe-area-inset-top, 0px) + 12px)"
          : undefined
      }
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
