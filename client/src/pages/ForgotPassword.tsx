import { useState } from "react";
import { ArrowLeft, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicAuthLayout } from "@/components/PublicAuthLayout";
import { Input } from "@/components/ui/input";
import { requestPasswordReset } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api-errors";

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    setError("");
    setLoading(true);

    try {
      if (!identifier.trim()) {
        setError("Sila masukkan username atau emel anda.");
        return;
      }

      await requestPasswordReset({ identifier: identifier.trim() });
      setSubmitted(true);
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, "Permintaan tetapan semula gagal dihantar."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicAuthLayout
      badge="Pemulihan Akses"
      title="Permintaan Tetapan Semula Kata Laluan"
      description="Masukkan username atau emel anda untuk menghantar permintaan tetapan semula. Permintaan ini akan disemak oleh superuser sebelum pautan selamat dihantar kepada akaun yang berkaitan."
      icon={<LifeBuoy className="h-7 w-7" />}
    >
      {submitted ? (
        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm leading-7 text-emerald-100">
          Jika akaun wujud, permintaan tetapan semula telah dihantar untuk semakan.
        </div>
      ) : (
        <>
          <Input
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="Username atau emel"
            className="border-white/10 bg-white/95 text-slate-950"
          />
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-white/75">
            Demi keselamatan, sistem hanya memaparkan status umum dan tidak mendedahkan sama ada
            sesuatu akaun benar-benar wujud.
          </div>
          {error ? (
            <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}
          <Button
            className="h-11 w-full rounded-xl bg-blue-600 text-white hover:bg-blue-500"
            onClick={() => void handleSubmit()}
            disabled={loading}
          >
            {loading ? "Sedang menghantar..." : "Hantar Permintaan"}
          </Button>
        </>
      )}

      <Button
        type="button"
        variant="ghost"
        className="w-full rounded-xl text-slate-200 hover:bg-white/5 hover:text-white"
        onClick={() => {
          window.location.href = "/";
        }}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Kembali ke log masuk
      </Button>
    </PublicAuthLayout>
  );
}
