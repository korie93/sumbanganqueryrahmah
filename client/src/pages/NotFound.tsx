import { SystemStatusView } from "@/components/system-status/SystemStatusView";
import "@/components/system-status/SystemStatusPage.css";

type NotFoundProps = {
  onNavigateHome: () => void;
  onLoginClick: () => void;
  isAuthenticated?: boolean;
  homeLabel?: string;
};

export default function NotFound({ onNavigateHome, onLoginClick, isAuthenticated = false,
  homeLabel = "Kembali ke Dashboard" }: NotFoundProps) {
  return <SystemStatusView state="404"
    primary={isAuthenticated ? { label: homeLabel, onClick: onNavigateHome, kind: "navigate" }
      : { label: "Kembali ke Log Masuk", onClick: onLoginClick, kind: "navigate" }}
    secondary={isAuthenticated ? undefined : { label: "Halaman utama", onClick: onNavigateHome }} />;
}
