import { ShieldX, Ban, Lock, AlertOctagon, RefreshCw } from "lucide-react";
import { clearAuthenticatedUserStorage, setBannedSessionFlag } from "@/lib/auth-session";

export default function Banned() {
  const handleRetry = () => {
    setBannedSessionFlag(false);
    clearAuthenticatedUserStorage();
    window.location.href = "/";
  };
  return (
    <div className="viewport-min-height bg-gradient-to-br from-slate-950 via-red-950/30 to-slate-950 flex items-center justify-center p-4 overflow-hidden relative">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiM1NTFhMWEiIGZpbGwtb3BhY2l0eT0iMC4zIj48Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSIxLjUiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-40" />
      
      <div className="absolute top-20 left-20 w-72 h-72 bg-red-500/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full bg-red-900/20 blur-3xl animate-pulse [animation-delay:1s]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-red-800/10 rounded-full blur-3xl" />

      <div className="relative z-10 max-w-lg w-full">
        <div className="absolute -inset-4 rounded-[2rem] bg-red-500/10 blur-2xl pointer-events-none" />
        
        <div className="relative backdrop-blur-xl bg-gradient-to-b from-slate-900/90 to-slate-950/95 border border-red-500/20 rounded-3xl p-10 shadow-2xl shadow-red-900/20">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="relative">
              <div className="absolute inset-0 bg-red-500 rounded-full blur-xl opacity-50 animate-pulse" />
              <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center border-4 border-red-500/30 shadow-xl">
                <ShieldX className="w-12 h-12 text-white" />
              </div>
            </div>
          </div>

          <div className="mt-10 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/20 border border-red-500/30 mb-6">
              <Ban className="w-4 h-4 text-red-400" />
              <span className="text-sm font-medium text-red-400">AKAUN DISEKAT</span>
            </div>

            <h1 className="text-3xl font-bold text-white mb-4 tracking-tight">
              Akaun Anda Telah Disekat Oleh Pentadbir
            </h1>

            <p className="text-slate-400 text-lg mb-8 leading-relaxed">
              Akses ke sistem telah ditarik balik oleh pentadbir sistem. Anda tidak boleh
              menggunakan sistem ini sehingga akaun dipulihkan semula.
            </p>

            <div className="grid grid-cols-3 gap-3 mb-8">
              <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <Lock className="w-6 h-6 text-red-400" />
                <span className="text-xs text-slate-500">Log In Disekat</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <Ban className="w-6 h-6 text-red-400" />
                <span className="text-xs text-slate-500">Akses Ditolak</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <AlertOctagon className="w-6 h-6 text-red-400" />
                <span className="text-xs text-slate-500">Aktiviti Direkodkan</span>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-slate-800/60 border border-slate-700/50 backdrop-blur-sm">
              <p className="text-sm text-slate-400 mb-2">
                Jika anda percaya ini berlaku secara tidak sengaja, sila hubungi:
              </p>
              <p className="text-lg font-semibold text-white">
                Pentadbir SQR System
              </p>
            </div>

            <button
              onClick={handleRetry}
              type="button"
              className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-600 bg-transparent px-4 text-sm font-medium text-slate-300 transition-colors hover:border-slate-500 hover:bg-slate-800/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
              data-testid="button-retry-login"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Cuba Log In Semula
            </button>

            <div className="mt-8 pt-6 border-t border-slate-800">
              <p className="text-xs text-slate-600">
                Sumbangan Query Rahmah
              </p>
              <p className="text-xs text-slate-700 mt-1">
                Hak cipta terpelihara.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
