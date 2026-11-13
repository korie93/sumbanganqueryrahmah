import { Suspense, useMemo } from "react";
import type { User } from "@/app/types";
import { ForgotPasswordPage, LoginPage } from "@/app/lazy-pages";
import { PageSpinner } from "@/app/PageSpinner";
import { AuthV17Shell } from "@/components/auth/AuthV17Layout";
import { getPreloadedAuthForm } from "@/lib/auth-navigation-preload";

type Props = {
  page: "login" | "forgot-password";
  onBackToHome: () => void;
  onBackToLogin: () => void;
  onForgotPasswordClick: () => void;
  onBanned: () => void;
  onLoginSuccess: (user: User) => void;
};

/** One auth-family shell survives lazy form swaps without mounting protected UI. */
export default function AuthEntry({ page, onBackToHome, onBackToLogin,
  onForgotPasswordClick, onBanned, onLoginSuccess }: Props) {
  const { LoginForm, ForgotForm } = useMemo(() => ({
    LoginForm: getPreloadedAuthForm("login") ?? LoginPage,
    ForgotForm: getPreloadedAuthForm("forgot-password") ?? ForgotPasswordPage,
  }), [page]);
  return <AuthV17Shell className={page === "login" ? "auth-v17-login" : "auth-v17-forgot"}
    recoveryArtwork={page === "forgot-password"} onBackClick={onBackToHome}>
    <Suspense fallback={<PageSpinner fullscreen={false} />}>
      {page === "forgot-password" ? <ForgotForm onBackToHome={onBackToHome} onBackToLogin={onBackToLogin} />
        : <LoginForm onBanned={onBanned} onForgotPasswordClick={onForgotPasswordClick}
          onLandingClick={onBackToHome} onLoginSuccess={onLoginSuccess} />}
    </Suspense>
  </AuthV17Shell>;
}
