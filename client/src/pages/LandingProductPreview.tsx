import { CheckCircle2, Search } from "lucide-react";

const previewMetrics = [
  {
    label: "Carian",
    value: "General Search",
    copy: "Rujukan data utama kekal cepat.",
  },
  {
    label: "Harian",
    value: "Collection Daily",
    copy: "Status dan kutipan mudah disemak.",
  },
  {
    label: "Kawalan",
    value: "Audit & Access",
    copy: "Tindakan penting boleh dijejak.",
  },
];

const previewRows = [
  { label: "Semakan rekod sumbangan", meta: "3 min lepas", status: "Selesai", tone: "ok" },
  { label: "Status harian dikemaskini", meta: "Hari ini", status: "Working", tone: "info" },
  { label: "Perhatian resit", meta: "Perlu semak", status: "Review", tone: "warn" },
] as const;

const aboutHighlights = [
  "Akses terhad kepada pengguna dalaman yang berdaftar.",
  "Carian, semakan, dan rujukan data disatukan dalam satu ruang kerja.",
  "Paparan direka ringkas supaya tugas harian dapat diselesaikan dengan lebih cepat.",
];

export function LandingProductPreview() {
  return (
    <section
      id="about"
      className="landing-secondary-pane landing-secondary-pane-shell rounded-[1.75rem] p-3 sm:p-4"
      aria-labelledby="landing-preview-title"
    >
      <div className="landing-about-shell landing-about-card rounded-[1.5rem] p-4 sm:p-5">
        <div className="landing-preview-topbar flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
          <div>
            <p className="landing-about-eyebrow text-xs font-semibold uppercase tracking-label-4xl">
              Paparan Kerja
            </p>
            <p className="landing-preview-topbar-copy mt-1 text-xs">
              Gambaran ringkas aliran operasi harian.
            </p>
          </div>
          <div className="landing-preview-status rounded-full px-3 py-1 text-xs font-semibold">
            Akses dalaman
          </div>
        </div>

        <div
          className="landing-workspace-preview mt-4 rounded-2xl p-4"
          role="group"
          aria-label="Contoh paparan ringkas SQR"
        >
          <div className="landing-preview-toolbar flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="landing-preview-toolbar-title text-sm font-semibold">Ruang Kerja SQR</p>
              <p className="landing-preview-toolbar-copy mt-1 text-xs">Cari, simpan, semak, dan audit.</p>
            </div>
            <div className="landing-preview-search flex items-center gap-2 rounded-xl px-3 py-2 text-xs">
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              IC, akaun, nama...
            </div>
          </div>

          <div className="landing-preview-metric-grid mt-4 grid gap-2 sm:grid-cols-3">
            {previewMetrics.map((item) => (
              <div key={item.label} className="landing-preview-metric rounded-2xl px-3 py-3">
                <p className="landing-preview-metric-label text-xxs font-semibold uppercase tracking-label-xl">
                  {item.label}
                </p>
                <p className="landing-preview-metric-value mt-2 text-sm font-semibold">{item.value}</p>
                <p className="landing-preview-metric-copy mt-1 text-xs leading-5">{item.copy}</p>
              </div>
            ))}
          </div>

          <div className="landing-preview-list mt-3 space-y-2">
            {previewRows.map((row) => (
              <div
                key={row.label}
                className="landing-preview-record-row flex items-center justify-between gap-3 rounded-xl px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="landing-preview-record-title truncate text-sm font-medium">{row.label}</p>
                  <p className="landing-preview-record-meta text-xs">{row.meta}</p>
                </div>
                <span
                  className={`landing-preview-status-pill landing-preview-status-pill--${row.tone} rounded-full px-2.5 py-1 text-xs font-semibold`}
                >
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <h2 id="landing-preview-title" className="landing-about-title mt-4 text-xl font-semibold tracking-tight">
          Satu paparan untuk kerja operasi yang tersusun.
        </h2>
        <p className="landing-about-copy mt-2 text-sm leading-6">
          Antara muka dalaman ini diatur supaya pengguna boleh terus mencari rekod, menyemak status
          kerja, dan bergerak antara aliran tugas tanpa ruang yang membazir.
        </p>

        <div className="mt-4 space-y-2">
          {aboutHighlights.map((item) => (
            <div
              key={item}
              className="landing-about-item flex items-start gap-3 rounded-2xl px-3 py-2.5"
            >
              <CheckCircle2
                className="landing-about-item-icon mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <p className="landing-about-item-copy text-sm leading-6">{item}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
