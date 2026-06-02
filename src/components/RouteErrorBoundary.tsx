/**
 * RouteErrorBoundary — error boundary level route.
 * Menangkap crash pada satu halaman tanpa mematikan seluruh app.
 * Menampilkan pesan ramah + tombol "Coba Lagi" + tombol "Ke Beranda".
 */
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Nama halaman untuk pesan error yang lebih spesifik (opsional). */
  pageName?: string;
}

interface State {
  error: Error | null;
  errorKey: number;
}

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[RouteErrorBoundary] Crash di ${this.props.pageName ?? "halaman"}:`,
      error,
      info.componentStack,
    );
    fetch("/api/log-client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        pageName: this.props.pageName,
        url: typeof window !== "undefined" ? window.location.href : "",
      }),
    }).catch(() => {});
  }

  private retry = () => {
    this.setState((s) => ({ error: null, errorKey: s.errorKey + 1 }));
  };

  render() {
    if (this.state.error) {
      return (
        <ErrorFallback
          error={this.state.error}
          pageName={this.props.pageName}
          onRetry={this.retry}
        />
      );
    }
    return (
      <ErrorKeyWrapper key={this.state.errorKey}>
        {this.props.children}
      </ErrorKeyWrapper>
    );
  }
}

function ErrorKeyWrapper({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function ErrorFallback({
  error,
  pageName,
  onRetry,
}: {
  error: Error;
  pageName?: string;
  onRetry: () => void;
}) {
  const isDev = import.meta.env.DEV;

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center px-6 py-12 text-center"
      style={{ background: "hsl(var(--background))" }}
      role="alert"
    >
      {/* Icon */}
      <div
        className="h-16 w-16 rounded-2xl flex items-center justify-center text-3xl mb-4 shadow-sm"
        style={{ background: "linear-gradient(135deg,#fee2e2,#fca5a5)" }}
      >
        ⚠️
      </div>

      <h2 className="text-[17px] font-bold text-[hsl(var(--foreground))] mb-1 leading-tight">
        {pageName ? `Halaman "${pageName}" error` : "Halaman tidak dapat dimuat"}
      </h2>
      <p className="text-[12.5px] text-[hsl(var(--muted-foreground))] leading-relaxed max-w-xs mb-1">
        Terjadi kesalahan tak terduga. Coba muat ulang halaman ini.
      </p>

      {isDev && (
        <details open className="mt-2 mb-4 text-left w-full max-w-sm">
          <summary className="text-[11px] font-semibold text-red-500 cursor-pointer select-none">
            Detail error (dev)
          </summary>
          <pre className="mt-1 text-[10px] bg-red-50 border border-red-200 rounded-xl p-3 overflow-auto whitespace-pre-wrap break-words text-red-700 max-h-48">
            {error.message}
            {"\n\n"}
            {error.stack?.split("\n").slice(0, 8).join("\n")}
          </pre>
        </details>
      )}

      <div className="flex gap-2 mt-4">
        <button
          onClick={onRetry}
          className="h-10 px-5 rounded-xl text-[13px] font-bold text-white shadow-sm active:scale-95 transition-transform"
          style={{ background: "linear-gradient(135deg,#0064E0,#0457cb)" }}
        >
          Coba Lagi
        </button>
        <button
          onClick={() => (window.location.href = "/")}
          className="h-10 px-5 rounded-xl text-[13px] font-semibold bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] active:scale-95 transition-transform"
        >
          Ke Beranda
        </button>
      </div>
    </div>
  );
}
