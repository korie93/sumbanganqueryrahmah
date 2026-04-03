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
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
            Fungsi Teras
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-white">
            Fungsi utama dipersembahkan secara padat dan mudah diimbas.
          </h2>
          <p className="max-w-3xl text-sm leading-7 text-slate-300">
            Halaman awam ini hanya memaparkan gambaran ringkas tentang keupayaan sistem. Fokus
            sebenar kekal pada pengalaman kerja selepas pengguna log masuk.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {featureHighlights.map((item) => (
            <article
              key={item.title}
              className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-200">
                <item.icon className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-white">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        id="security"
        className="landing-deferred-section mt-12 rounded-3xl border border-emerald-400/15 bg-emerald-400/5 p-6"
      >
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
          <div>
            <div className="flex items-center gap-2 text-emerald-200">
              <ShieldCheck className="h-5 w-5" />
              <h2 className="text-lg font-semibold text-white">Gambaran Keselamatan</h2>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              Asas keselamatan sistem ini memberi tumpuan kepada perlindungan akses, pengesahan
              sesi, dan kebolehkesanan tindakan penting supaya penggunaan harian kekal terkawal
              dan selamat.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200/80">
              Akses Sistem
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-200">
              Halaman awam hanya memberikan penerangan ringkas. Semua fungsi operasi sebenar
              memerlukan log masuk mengikut peranan pengguna.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {securityPoints.map((point) => (
            <div
              key={point}
              className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/35 p-4"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              <p className="text-sm leading-6 text-slate-200">{point}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="landing-deferred-section border-t border-white/10 pt-6 text-sm text-slate-400">
        <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="font-medium text-slate-200">
              SQR dibina untuk operasi dalaman yang fokus, ringkas, dan terkawal.
            </p>
            <p>
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
