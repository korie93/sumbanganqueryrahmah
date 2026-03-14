import { useState } from "react";
import { ArrowLeft, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requestPasswordReset } from "@/lib/api";
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
        setError("Enter your username or email.");
        return;
      }

      await requestPasswordReset({ identifier: identifier.trim() });
      setSubmitted(true);
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, "Failed to submit reset request."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 p-4">
      <div className="mx-auto flex min-h-screen max-w-xl items-center justify-center">
        <Card className="w-full border-white/10 bg-slate-950/70 text-white shadow-2xl backdrop-blur">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-white/10">
                <LifeBuoy className="h-7 w-7" />
              </div>
            </div>
            <CardTitle className="text-center text-2xl">Request Password Reset</CardTitle>
            <p className="text-center text-sm text-slate-300">
              Submit your username or email. The request will be reviewed by the superuser, and an approved reset link will be sent to your email.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {submitted ? (
              <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                If the account exists, the reset request has been submitted for review.
              </div>
            ) : (
              <>
                <Input
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="Username or email"
                  className="border-white/10 bg-white/95 text-slate-950"
                />
                {error ? (
                  <div className="rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">
                    {error}
                  </div>
                ) : null}
                <Button
                  className="w-full"
                  onClick={() => void handleSubmit()}
                  disabled={loading}
                >
                  {loading ? "Submitting..." : "Submit Request"}
                </Button>
              </>
            )}

            <Button
              type="button"
              variant="ghost"
              className="w-full text-slate-200 hover:text-white"
              onClick={() => {
                window.location.href = "/";
              }}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
