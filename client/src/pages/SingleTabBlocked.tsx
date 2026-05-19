import { AlertTriangle, Clock3, MonitorCheck, RefreshCcw, ShieldCheck, XCircle } from "lucide-react";
import { PublicAuthButton } from "@/components/PublicAuthControls";
import { PublicAuthLayout } from "@/components/PublicAuthLayout";
import "./SingleTabBlocked.css";

interface SingleTabBlockedProps {
  onRetry?: () => void;
}

export default function SingleTabBlocked({ onRetry }: SingleTabBlockedProps) {
  const handleCloseTab = () => {
    window.close();
  };

  return (
    <PublicAuthLayout
      badge="Satu Sesi Aktif"
      title="Tab tambahan tidak dibenarkan"
      description="SQR mengehadkan satu tab aktif bagi setiap akaun supaya rekod, kutipan, dan perubahan status tidak bercanggah antara halaman."
      icon={<AlertTriangle className="h-7 w-7" aria-hidden="true" focusable="false" />}
      showBackButton={false}
    >
      <section className="single-tab-blocked__notice" aria-labelledby="single-tab-active-title" role="status" aria-live="polite">
        <span className="single-tab-blocked__notice-icon" aria-hidden="true">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" focusable="false" />
        </span>
        <div>
          <h2 id="single-tab-active-title" className="single-tab-blocked__notice-title">
            Akaun ini sedang aktif dalam tab lain
          </h2>
          <p className="single-tab-blocked__notice-copy">
            Kembali ke tab utama untuk terus bekerja. Jika tab utama sudah ditutup, klik Semak Semula
            selepas beberapa saat.
          </p>
        </div>
      </section>

      <div className="single-tab-blocked__steps" role="list" aria-label="Pilihan untuk meneruskan penggunaan sistem">
        <div className="single-tab-blocked__step" role="listitem">
          <MonitorCheck className="h-5 w-5" aria-hidden="true" focusable="false" />
          <div>
            <p className="single-tab-blocked__step-title">Guna tab utama</p>
            <p className="single-tab-blocked__step-copy">Semua kerja aktif kekal di tab yang mula-mula dibuka.</p>
          </div>
        </div>
        <div className="single-tab-blocked__step" role="listitem">
          <Clock3 className="h-5 w-5" aria-hidden="true" focusable="false" />
          <div>
            <p className="single-tab-blocked__step-title">Tunggu lock dilepaskan</p>
            <p className="single-tab-blocked__step-copy">Sistem akan benarkan tab ini selepas sesi lama tidak lagi aktif.</p>
          </div>
        </div>
      </div>

      <div className="single-tab-blocked__actions">
        <PublicAuthButton
          type="button"
          className="single-tab-blocked__action"
          onClick={() => {
            onRetry?.();
          }}
        >
          <RefreshCcw className="h-4 w-4" aria-hidden="true" focusable="false" />
          Semak Semula
        </PublicAuthButton>
        <PublicAuthButton
          type="button"
          variant="ghost"
          className="single-tab-blocked__action single-tab-blocked__close-action"
          onClick={handleCloseTab}
        >
          <XCircle className="h-4 w-4" aria-hidden="true" focusable="false" />
          Tutup Tab Ini
        </PublicAuthButton>
      </div>

      <p className="single-tab-blocked__helper">
        Jika browser tidak membenarkan tab ditutup secara automatik, tutup tab ini secara manual.
        Halaman utama tidak akan terjejas.
      </p>
    </PublicAuthLayout>
  );
}
