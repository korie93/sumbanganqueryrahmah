import {
  ArrowRight,
  CheckCircle2,
  Database,
  FileText,
  LogIn,
  Search,
  ShieldCheck,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";

type LandingProps = {
  onLoginClick: () => void;
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

const aboutHighlights = [
  "Akses terhad kepada pengguna dalaman yang berdaftar.",
  "Carian, semakan, dan rujukan data disatukan dalam satu ruang kerja.",
  "Paparan direka ringkas supaya tugas harian dapat diselesaikan dengan lebih cepat.",
];

export default function Landing({ onLoginClick }: LandingProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-slate-900/80">
              <BrandLogo decorative priority className="h-7 w-7" imageClassName="h-full w-full" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-wide text-white">SQR System</p>
              <p className="truncate text-xs text-slate-300">Platform operasi dalaman Sumbangan Query Rahmah</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <nav className="hidden items-center gap-1 rounded-xl border border-white/10 bg-slate-900/60 p-1 md:flex">
              <a
                href="#features"
                className="rounded-lg px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
              >
                Fungsi
              </a>
              <a
                href="#security"
                className="rounded-lg px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
              >
                Keselamatan
              </a>
              <a
                href="#about"
                className="rounded-lg px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
              >
                Tentang
              </a>
            </nav>
            <Button
              type="button"
              onClick={onLoginClick}
              className="h-10 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500"
            >
              <LogIn className="mr-2 h-4 w-4" />
              Log In
            </Button>
          </div>
        </header>

        <main className="flex flex-1 flex-col justify-center py-10 sm:py-14">
          <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div className="space-y-7">
              <div className="inline-flex items-center rounded-full border border-blue-400/25 bg-blue-400/10 px-3 py-1 text-xs font-medium text-blue-100">
                Untuk kegunaan operasi dalaman berdaftar
              </div>
              <div className="space-y-4">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                  Platform kerja dalaman untuk carian, semakan, dan pengurusan rekod sumbangan.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                  SQR menyediakan ruang kerja yang tersusun untuk menjalankan general search,
                  menyemak rekod, dan merujuk data operasi secara cepat, terkawal, serta mudah
                  difahami oleh pengguna harian.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                  General Search
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                  Akses Terkawal
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                  Antara Muka Ringan
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={onLoginClick}
                  className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-500"
                >
                  Log In ke Sistem
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                  Halaman ini menerangkan fungsi teras sistem secara padat. Akses penuh tersedia
                  selepas log masuk.
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Fokus
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-200">
                    General search dan semakan rekod tanpa paparan yang berserabut.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Ketertiban
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-200">
                    Susun atur dibina untuk kerja dalaman yang berulang dan memerlukan ketepatan.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Kawalan
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-200">
                    Akses sistem dikawal melalui log masuk dan semakan keselamatan yang berkaitan.
                  </p>
                </div>
              </div>
            </div>

            <div
              id="about"
              className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur"
            >
              <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Tentang Sistem
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">
                  Ruang kerja digital untuk semakan data yang lebih teratur.
                </h2>
                <p className="mt-4 text-sm leading-7 text-slate-300">
                  Sistem ini dibangunkan untuk kegunaan operasi dalaman dengan keutamaan pada
                  kelajuan carian, kebolehbacaan data, kawalan akses, dan aliran kerja yang
                  membantu pengguna menumpukan kepada tugas sebenar tanpa gangguan yang tidak perlu.
                </p>
                <div className="mt-5 space-y-3">
                  {aboutHighlights.map((item) => (
                    <div
                      key={item}
                      className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                    >
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-200" />
                      <p className="text-sm leading-6 text-slate-200">{item}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-slate-300">
                  Akses adalah terhad kepada pengguna berdaftar dan tertakluk kepada kawalan
                  peranan serta dasar keselamatan sistem.
                </div>
              </div>
            </div>
          </section>

          <section id="features" className="mt-12 space-y-5">
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

          <section id="security" className="mt-12 rounded-3xl border border-emerald-400/15 bg-emerald-400/5 p-6">
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
        </main>

        <footer className="border-t border-white/10 pt-6 text-sm text-slate-400">
          <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="font-medium text-slate-200">SQR dibina untuk operasi dalaman yang fokus, ringkas, dan terkawal.</p>
              <p>
                Halaman ini diwujudkan untuk memberi gambaran ringkas tentang fungsi utama sistem
                tanpa elemen promosi, borang pertanyaan, atau kandungan yang tidak diperlukan.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={onLoginClick}
              className="h-10 rounded-xl border-white/15 bg-slate-900/60 px-4 text-slate-100 hover:bg-slate-800"
            >
              <LogIn className="mr-2 h-4 w-4" />
              Buka Login
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
