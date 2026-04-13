import { ArrowLeft, Home, ShieldAlert } from "lucide-react";
import "./Forbidden.css";

export default function Forbidden() {
  return (
    <main id="main-content" tabIndex={-1} className="forbidden-page app-shell-min-height px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <section className="forbidden-page__card glass-wrapper rounded-3xl p-8 text-center sm:p-10">
            <div className="forbidden-page__icon-shell mx-auto flex h-16 w-16 items-center justify-center rounded-full">
              <ShieldAlert className="forbidden-page__icon h-8 w-8" />
            </div>
            <p className="forbidden-page__kicker mt-5 text-xs font-semibold uppercase tracking-[0.24em]">
              Akses Ditolak
            </p>
            <h1 className="forbidden-page__title mt-3 text-3xl font-semibold">403 Forbidden</h1>
            <p className="forbidden-page__copy mx-auto mt-3 max-w-xl text-sm leading-7">
              Anda tidak mempunyai kebenaran untuk mengakses bahagian ini. Jika anda percaya ini
              berlaku secara tidak sengaja, sila semak peranan akaun anda atau hubungi pentadbir
              sistem.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="forbidden-page__panel rounded-2xl px-4 py-4 text-left">
                <p className="forbidden-page__panel-eyebrow text-xs font-semibold uppercase tracking-[0.2em]">
                  Sebab Lazim
                </p>
                <p className="forbidden-page__panel-copy mt-2 text-sm leading-6">
                  Halaman ini biasanya dilindungi oleh kawalan peranan atau memerlukan tahap akses
                  yang lebih tinggi.
                </p>
              </div>
              <div className="forbidden-page__panel rounded-2xl px-4 py-4 text-left">
                <p className="forbidden-page__panel-eyebrow text-xs font-semibold uppercase tracking-[0.2em]">
                  Tindakan Disyorkan
                </p>
                <p className="forbidden-page__panel-copy mt-2 text-sm leading-6">
                  Kembali ke halaman sebelumnya atau ke halaman utama untuk meneruskan tugasan lain
                  yang dibenarkan.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                className="forbidden-page__secondary-button inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-medium transition-colors"
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
                className="forbidden-page__primary-button inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-colors"
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
    </main>
  );
}

