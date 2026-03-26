import { ShieldX, Ban, Lock, AlertOctagon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearAuthenticatedUserStorage, setBannedSessionFlag } from "@/lib/auth-session";

export default function Banned() {
  const handleRetry = () => {
    setBannedSessionFlag(false);
    clearAuthenticatedUserStorage();
    window.location.href = "/";
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-red-950/30 to-slate-950 flex items-center justify-center p-4 overflow-hidden relative">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiM1NTFhMWEiIGZpbGwtb3BhY2l0eT0iMC4zIj48Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSIxLjUiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-40" />
      
      <div className="absolute top-20 left-20 w-72 h-72 bg-red-500/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-20 right-20 w-96 h-96 bg-red-900/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
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
              <span className="text-sm font-medium text-red-400">ACCOUNT BANNED</span>
            </div>

            <h1 className="text-3xl font-bold text-white mb-4 tracking-tight">
              Administrator Has Banned Your Account
            </h1>

            <p className="text-slate-400 text-lg mb-8 leading-relaxed">
              Access to the system has been revoked by the system administrator.
              You cannot use this system until your account is restored.
            </p>

            <div className="grid grid-cols-3 gap-3 mb-8">
              <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <Lock className="w-6 h-6 text-red-400" />
                <span className="text-xs text-slate-500">Login Blocked</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <Ban className="w-6 h-6 text-red-400" />
                <span className="text-xs text-slate-500">Access Denied</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <AlertOctagon className="w-6 h-6 text-red-400" />
                <span className="text-xs text-slate-500">Activity Logged</span>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-slate-800/60 border border-slate-700/50 backdrop-blur-sm">
              <p className="text-sm text-slate-400 mb-2">
                If you believe this is a mistake, please contact:
              </p>
              <p className="text-lg font-semibold text-white">
                SQR System Administrator
              </p>
              <p className="text-sm text-blue-400 mt-1">
                admin@sqr.gov.my
              </p>
            </div>

            <Button
              onClick={handleRetry}
              variant="outline"
              className="mt-6 w-full border-slate-600 text-slate-300"
              data-testid="button-retry-login"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry Login
            </Button>

            <div className="mt-8 pt-6 border-t border-slate-800">
              <p className="text-xs text-slate-600">
                Sumbangan Query Rahmah - Data Management System
              </p>
              <p className="text-xs text-slate-700 mt-1">
                Copyright Reserved 2025 Ministry of Madanon
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
