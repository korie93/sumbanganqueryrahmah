import {
  CheckCircle2,
  Database,
  FileText,
  LogIn,
  Search,
  ShieldCheck,
} from "lucide-react";

type LandingDeferredSectionsProps = {
  onLoginClick: () => void;
  secondaryButtonClassName: string;
};

const featureHighlights = [
  {
    title: "General Search",
    description:
      "Laksanakan carian merentas data import dengan lebih pantas untuk menyokong semakan operasi harian yang konsisten.",
    icon: Search,
  },
  {
    title: "Rekod Operasi",
    description:
      "Simpan, semak, dan rujuk semula rekod sumbangan serta resit melalui aliran kerja yang jelas dan tersusun.",
    icon: FileText,
  },
  {
    title: "Ruang Kerja Berstruktur",
    description:
      "Paparan data, ringkasan, dan laporan disusun untuk kerja dalaman yang memerlukan ketepatan dan kebolehkesanan.",
    icon: Database,
  },
];

const securityPoints = [
  "Pengesahan sesi, kawalan akses mengikut peranan, dan perlindungan ke atas laluan sistem yang sensitif.",
  "Jejak audit bagi tindakan penting untuk menyokong pemantauan dan tadbir urus dalaman.",
  "Perlindungan CSRF, rate limiting, dan semakan request boundary pada aliran sistem utama.",
];

export default function LandingDeferredSections({
  onLoginClick,
  secondaryButtonClassName,
}: LandingDeferredSectionsProps) {
  return (
    <>
      <section id="features" className="landing-deferred-section mt-12 space-y-5">
        <div className="space-y-2">
          <p className="landing-section-eyebrow text-xs font-semibold uppercase tracking-[0.24em]">
            Fungsi Teras
          </p>
          <h2 className="landing-section-title text-2xl font-semibold tracking-tight">
            Fungsi utama dipersembahkan secara padat dan mudah diimbas.
          </h2>
          <p className="landing-section-copy max-w-3xl text-sm leading-7">
            Halaman awam ini hanya memaparkan gambaran ringkas tentang keupayaan sistem. Fokus
            sebenar kekal pada pengalaman kerja selepas pengguna log masuk.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {featureHighlights.map((item) => (
            <article
              key={item.title}
              className="landing-feature-article rounded-3xl p-5 backdrop-blur"
            >
              <div className="landing-feature-icon flex h-11 w-11 items-center justify-center rounded-2xl">
                <item.icon className="h-5 w-5" />
              </div>
              <h2 className="landing-feature-title mt-4 text-lg font-semibold">{item.title}</h2>
              <p className="landing-section-copy mt-2 text-sm leading-6">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        id="security"
        className="landing-deferred-section landing-security-shell mt-12 rounded-3xl p-6"
      >
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
          <div>
            <div className="landing-security-heading flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              <h2 className="landing-security-title text-lg font-semibold">Gambaran Keselamatan</h2>
            </div>
            <p className="landing-security-copy mt-3 max-w-3xl text-sm leading-7">
              Asas keselamatan sistem ini memberi tumpuan kepada perlindungan akses, pengesahan
              sesi, dan kebolehkesanan tindakan penting supaya penggunaan harian kekal terkawal
              dan selamat.
            </p>
          </div>
          <div className="landing-security-panel rounded-2xl p-4">
            <p className="landing-security-panel-eyebrow text-xs font-semibold uppercase tracking-[0.2em]">
              Akses Sistem
            </p>
            <p className="landing-security-panel-copy mt-2 text-sm leading-6">
              Halaman awam hanya memberikan penerangan ringkas. Semua fungsi operasi sebenar
              memerlukan log masuk mengikut peranan pengguna.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {securityPoints.map((point) => (
            <div
              key={point}
              className="landing-security-point flex items-start gap-3 rounded-2xl p-4"
            >
              <CheckCircle2 className="landing-security-point-icon mt-0.5 h-4 w-4 shrink-0" />
              <p className="landing-security-point-copy text-sm leading-6">{point}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="landing-deferred-section landing-footer pt-6 text-sm">
        <div className="landing-placeholder-footer-shell flex flex-col gap-4 rounded-2xl px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="landing-footer-title font-medium">
              SQR dibina untuk operasi dalaman yang fokus, ringkas, dan terkawal.
            </p>
            <p className="landing-footer-copy">
              Halaman ini diwujudkan untuk memberi gambaran ringkas tentang fungsi utama sistem
              tanpa elemen promosi, borang pertanyaan, atau kandungan yang tidak diperlukan.
            </p>
          </div>
          <button
            type="button"
            onClick={onLoginClick}
            className={secondaryButtonClassName}
          >
            <LogIn className="mr-2 h-4 w-4" />
            Buka Login
          </button>
        </div>
      </footer>
    </>
  );
}
