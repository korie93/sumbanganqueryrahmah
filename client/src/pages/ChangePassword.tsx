import { useEffect, useRef, useState } from "react";
import { KeyRound, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicAuthLayout } from "@/components/PublicAuthLayout";
import { Input } from "@/components/ui/input";
import { changeMyPassword } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-errors";
import { clearAuthenticatedUserStorage, setStoredForcePasswordChange } from "@/lib/auth-session";

type ChangePasswordPageProps = {
  username?: string;
  forced?: boolean;
};

export default function ChangePasswordPage({
  username,
  forced = false,
}: ChangePasswordPageProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const mountedRef = useRef(true);
  const changePasswordAbortControllerRef = useRef<AbortController | null>(null);
  const redirectTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      changePasswordAbortControllerRef.current?.abort();
      changePasswordAbortControllerRef.current = null;
      if (redirectTimeoutRef.current) {
        window.clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
    };
  }, []);

  const handleLogout = () => {
    changePasswordAbortControllerRef.current?.abort();
    changePasswordAbortControllerRef.current = null;
    if (redirectTimeoutRef.current) {
      window.clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }
    clearAuthenticatedUserStorage();
    window.location.href = "/";
  };

  const handleSubmit = async () => {
    if (loading || changePasswordAbortControllerRef.current) {
      return;
    }

    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      if (!currentPassword || !newPassword || !confirmPassword) {
        setError("Semua medan kata laluan wajib diisi.");
        return;
      }

      if (newPassword !== confirmPassword) {
        setError("Pengesahan kata laluan tidak sepadan.");
        return;
      }

      const controller = new AbortController();
      changePasswordAbortControllerRef.current = controller;

      const response = await changeMyPassword({
        currentPassword,
        newPassword,
      }, {
        signal: controller.signal,
      });
      if (!mountedRef.current || controller.signal.aborted) {
        return;
      }

      if (response?.forceLogout) {
        clearAuthenticatedUserStorage();
        setSuccessMessage("Kata laluan berjaya dikemas kini. Sila log masuk semula.");
        if (redirectTimeoutRef.current) {
          window.clearTimeout(redirectTimeoutRef.current);
        }
        redirectTimeoutRef.current = window.setTimeout(() => {
          redirectTimeoutRef.current = null;
          window.location.href = "/";
        }, 900);
        return;
      }

      setStoredForcePasswordChange(false);
      setSuccessMessage("Kata laluan berjaya dikemas kini.");
    } catch (submitError) {
      if (
        (submitError instanceof DOMException && submitError.name === "AbortError") ||
        !mountedRef.current
      ) {
        return;
      }
      setError(getApiErrorMessage(submitError, "Pertukaran kata laluan gagal."));
    } finally {
      changePasswordAbortControllerRef.current = null;
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  return (
    <PublicAuthLayout
      badge="Keselamatan Akaun"
      title="Tukar Kata Laluan"
      description={
        forced
          ? `Pertukaran kata laluan diwajibkan untuk ${username || "akaun ini"} sebelum sistem boleh digunakan sepenuhnya.`
          : "Kemas kini kata laluan akaun anda bagi memastikan akses kekal selamat dan terkawal."
      }
      icon={<KeyRound className="h-7 w-7" />}
      showBackButton={false}
    >
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-white/75">
        Gunakan kata laluan baharu yang sukar diteka dan pastikan pengesahan kata laluan sama
        seperti yang dimasukkan.
      </div>

      <Input
        type="password"
        value={currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
        placeholder="Kata laluan semasa"
        className="border-white/10 bg-white/95 text-slate-950"
      />
      <Input
        type="password"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        placeholder="Kata laluan baharu"
        className="border-white/10 bg-white/95 text-slate-950"
      />
      <Input
        type="password"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        placeholder="Sahkan kata laluan baharu"
        className="border-white/10 bg-white/95 text-slate-950"
      />

      {error ? (
        <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-sm leading-7 text-emerald-100">
          {successMessage}
        </div>
      ) : null}

      <Button
        className="h-11 w-full rounded-xl bg-blue-600 text-white hover:bg-blue-500"
        onClick={() => void handleSubmit()}
        disabled={loading}
      >
        {loading ? "Sedang mengemas kini..." : "Kemas Kini Kata Laluan"}
      </Button>

      <Button
        type="button"
        variant="ghost"
        className="w-full rounded-xl text-slate-200 hover:bg-white/5 hover:text-white"
        onClick={handleLogout}
      >
        <LogOut className="mr-2 h-4 w-4" />
        Log Keluar
      </Button>
    </PublicAuthLayout>
  );
}
