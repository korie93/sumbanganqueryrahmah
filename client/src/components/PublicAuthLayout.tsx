import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";

type PublicAuthLayoutProps = {
  badge: string;
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
  showBackButton?: boolean;
  backLabel?: string;
  onBackClick?: () => void;
};

export function PublicAuthLayout({
  badge,
  title,
  description,
  icon,
  children,
  showBackButton = true,
  backLabel = "Kembali ke landing page",
  onBackClick,
}: PublicAuthLayoutProps) {
  return (
    <div className="relative viewport-min-height overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDNhNTUiIGZpbGwtb3BhY2l0eT0iMC40Ij48Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSIxLjUiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-30" />
      <div className="absolute left-20 top-20 h-56 w-56 rounded-full bg-blue-500/15 blur-3xl" />
      <div className="absolute bottom-20 right-20 h-72 w-72 rounded-full bg-purple-500/15 blur-3xl" />
      <div className="absolute left-1/2 top-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-400/8 blur-3xl" />

      <div className="relative z-10 flex viewport-min-height items-center justify-center px-4 py-8">
        <div className="w-full max-w-xl">
          {showBackButton ? (
            <button
              type="button"
              onClick={() => {
                if (onBackClick) {
                  onBackClick();
                  return;
                }
                window.location.href = "/";
              }}
              className="mb-4 inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </button>
          ) : null}

          <div className="pointer-events-none absolute -inset-4 rounded-[2rem] bg-blue-400/12 blur-2xl" />

          <div className="relative overflow-hidden rounded-[2rem] border border-white/12 bg-slate-950/75 px-8 py-8 text-white shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="mb-8 flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
                <BrandLogo decorative priority className="h-8 w-8" imageClassName="h-full w-full" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-100/80">
                  {badge}
                </p>
                <p className="mt-1 text-sm text-white/70">
                  Platform operasi dalaman Sumbangan Query Rahmah
                </p>
              </div>
            </div>

            <div className="mb-6 flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-white/10 shadow-xl">
                {icon}
              </div>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white">{title}</h1>
              <p className="mt-3 max-w-lg text-sm leading-7 text-white/75">{description}</p>
            </div>

            <div className="space-y-4">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
