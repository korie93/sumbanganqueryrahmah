import { ShieldX, Ban, Lock, AlertOctagon, RefreshCw } from "lucide-react";
import { clearAuthenticatedUserStorage, setBannedSessionFlag } from "@/lib/auth-session";
import "./Banned.css";

export default function Banned() {
  const handleRetry = () => {
    setBannedSessionFlag(false);
    clearAuthenticatedUserStorage();
    window.location.href = "/";
  };
  return (
    <main className="banned-page relative flex viewport-min-height items-center justify-center overflow-hidden p-4">
      <div className="banned-page__pattern absolute inset-0 opacity-40" />
      
      <div className="banned-page__orb banned-page__orb--top absolute left-20 top-20 h-72 w-72 blur-3xl animate-pulse" />
      <div className="banned-page__orb banned-page__orb--bottom absolute bottom-20 right-20 h-96 w-96 blur-3xl animate-pulse [animation-delay:1s]" />
      <div className="banned-page__orb banned-page__orb--center absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 blur-3xl" />

      <section className="relative z-[var(--z-public-auth-main)] max-w-lg w-full" aria-labelledby="banned-page-title">
        <div className="banned-page__halo pointer-events-none absolute -inset-4 rounded-[2rem] blur-2xl" />
        
        <div className="banned-page__card relative rounded-3xl p-10 supports-[backdrop-filter]:backdrop-blur-xl">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="relative">
              <div className="banned-page__shield-glow absolute inset-0 rounded-full blur-xl opacity-50 animate-pulse" />
              <div className="banned-page__shield-core relative flex h-24 w-24 items-center justify-center rounded-full shadow-xl">
                <ShieldX className="banned-page__shield-icon h-12 w-12" />
              </div>
            </div>
          </div>

          <div className="mt-10 text-center">
            <div className="banned-page__status mb-6 inline-flex items-center gap-2 rounded-full px-4 py-2">
              <Ban className="banned-page__status-icon h-4 w-4" />
              <span className="text-sm font-medium">AKAUN DISEKAT</span>
            </div>

            <h1 id="banned-page-title" className="banned-page__title mb-4 text-3xl font-bold tracking-tight">
              Akaun Anda Telah Disekat Oleh Pentadbir
            </h1>

            <p className="banned-page__copy mb-8 text-lg leading-relaxed">
              Akses ke sistem telah ditarik balik oleh pentadbir sistem. Anda tidak boleh
              menggunakan sistem ini sehingga akaun dipulihkan semula.
            </p>

            <div className="grid grid-cols-3 gap-3 mb-8">
              <div className="banned-page__panel flex flex-col items-center gap-2 rounded-xl p-4">
                <Lock className="banned-page__panel-icon h-6 w-6" />
                <span className="banned-page__panel-text text-xs">Log In Disekat</span>
              </div>
              <div className="banned-page__panel flex flex-col items-center gap-2 rounded-xl p-4">
                <Ban className="banned-page__panel-icon h-6 w-6" />
                <span className="banned-page__panel-text text-xs">Akses Ditolak</span>
              </div>
              <div className="banned-page__panel flex flex-col items-center gap-2 rounded-xl p-4">
                <AlertOctagon className="banned-page__panel-icon h-6 w-6" />
                <span className="banned-page__panel-text text-xs">Aktiviti Direkodkan</span>
              </div>
            </div>

            <div className="banned-page__contact rounded-2xl p-5 supports-[backdrop-filter]:backdrop-blur-sm">
              <p className="banned-page__contact-copy mb-2 text-sm">
                Jika anda percaya ini berlaku secara tidak sengaja, sila hubungi:
              </p>
              <p className="banned-page__contact-title text-lg font-semibold">
                Pentadbir SQR System
              </p>
            </div>

            <button
              onClick={handleRetry}
              type="button"
              className="banned-page__retry mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-transparent px-4 text-sm font-medium transition-colors"
              data-testid="button-retry-login"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Cuba Log In Semula
            </button>

            <div className="banned-page__footer mt-8 pt-6">
              <p className="banned-page__footer-brand text-xs">
                Sumbangan Query Rahmah
              </p>
              <p className="banned-page__footer-copy mt-1 text-xs">
                Hak cipta terpelihara.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
