import { ArrowLeft, Home, ShieldAlert } from "lucide-react";

export default function Forbidden() {
  return (
    <div className="app-shell-min-height bg-background px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <section className="glass-wrapper rounded-3xl border border-red-500/35 bg-gradient-to-br from-background via-background to-red-950/10 p-8 text-center sm:p-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-red-500/25 bg-red-500/10">
              <ShieldAlert className="h-8 w-8 text-red-400" />
            </div>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-red-300">
              Akses Ditolak
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-foreground">403 Forbidden</h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
              Anda tidak mempunyai kebenaran untuk mengakses bahagian ini. Jika anda percaya ini
              berlaku secara tidak sengaja, sila semak peranan akaun anda atau hubungi pentadbir
              sistem.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-4 text-left">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Sebab Lazim
                </p>
                <p className="mt-2 text-sm leading-6 text-foreground/85">
                  Halaman ini biasanya dilindungi oleh kawalan peranan atau memerlukan tahap akses
                  yang lebih tinggi.
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-4 text-left">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Tindakan Disyorkan
                </p>
                <p className="mt-2 text-sm leading-6 text-foreground/85">
                  Kembali ke halaman sebelumnya atau ke halaman utama untuk meneruskan tugasan lain
                  yang dibenarkan.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  if (window.history.length > 1) {
                    window.history.back();
                    return;
                  }
                  window.location.href = "/";
                }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Kembali
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70"
                onClick={() => {
                  window.location.href = "/";
                }}
              >
                <Home className="mr-2 h-4 w-4" />
                Ke Halaman Utama
              </button>
            </div>
        </section>
      </div>
    </div>
  );
}

