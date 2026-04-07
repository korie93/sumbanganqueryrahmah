import type { MonitorSection, User } from "@/app/types";
import { DEFAULT_SYSTEM_NAME } from "@/app/constants";

type DocumentMetadataInput = {
  currentPage: string;
  monitorSection?: MonitorSection;
  systemName?: string | null;
  user?: User | null;
};

type DocumentMetadata = {
  title: string;
  description: string;
  robots: string;
};

const DEFAULT_PUBLIC_DESCRIPTION =
  "SQR System ialah platform operasi dalaman untuk general search, semakan rekod, dan pengurusan data sumbangan secara tersusun dan terkawal.";

const DEFAULT_APP_DESCRIPTION =
  "Ruang kerja dalaman untuk general search, semakan rekod, laporan, dan pengurusan operasi Sumbangan Query Rahmah.";

const INDEXABLE_ROBOTS = "index,follow,max-image-preview:large";
const NOINDEX_ROBOTS = "noindex,nofollow,noarchive";

const MONITOR_SECTION_TITLES: Record<MonitorSection, string> = {
  dashboard: "Dashboard",
  activity: "Activity",
  monitor: "Monitor",
  analysis: "Analysis",
  audit: "Audit",
};

function resolveSystemName(systemName?: string | null) {
  const normalized = String(systemName || "").trim();
  return normalized || DEFAULT_SYSTEM_NAME;
}

function buildTitle(systemName: string, section: string) {
  return `${section} | ${systemName}`;
}

function humanizePageName(page: string) {
  const normalized = String(page || "")
    .trim()
    .replace(/[-_]+/g, " ");
  if (!normalized) return "Home";
  return normalized.replace(/\b\w/g, (match) => match.toUpperCase());
}

export function resolveDocumentMetadata({
  currentPage,
  monitorSection = "monitor",
  systemName,
  user,
}: DocumentMetadataInput): DocumentMetadata {
  const resolvedSystemName = resolveSystemName(systemName);

  switch (currentPage) {
    case "home":
      if (user) {
        return {
          title: buildTitle(resolvedSystemName, "Home"),
          description: DEFAULT_APP_DESCRIPTION,
          robots: NOINDEX_ROBOTS,
        };
      }
      return {
        title: buildTitle(resolvedSystemName, "Platform Operasi Dalaman"),
        description: DEFAULT_PUBLIC_DESCRIPTION,
        robots: INDEXABLE_ROBOTS,
      };
    case "login":
      return {
        title: buildTitle(resolvedSystemName, "Log In"),
        description:
          "Akses ke ruang kerja dalaman SQR System untuk general search, semakan rekod, dan pengurusan operasi.",
        robots: NOINDEX_ROBOTS,
      };
    case "forgot-password":
      return {
        title: buildTitle(resolvedSystemName, "Lupa Kata Laluan"),
        description:
          "Mulakan semula akses akaun anda melalui aliran pemulihan kata laluan SQR System.",
        robots: NOINDEX_ROBOTS,
      };
    case "reset-password":
      return {
        title: buildTitle(resolvedSystemName, "Tetapan Semula Kata Laluan"),
        description:
          "Selesaikan penetapan semula kata laluan untuk kembali mengakses ruang kerja dalaman SQR System.",
        robots: NOINDEX_ROBOTS,
      };
    case "activate-account":
      return {
        title: buildTitle(resolvedSystemName, "Aktivasi Akaun"),
        description:
          "Aktifkan akaun pengguna bagi mendapatkan akses ke sistem operasi dalaman SQR System.",
        robots: NOINDEX_ROBOTS,
      };
    case "change-password":
      return {
        title: buildTitle(resolvedSystemName, "Tukar Kata Laluan"),
        description: DEFAULT_APP_DESCRIPTION,
        robots: NOINDEX_ROBOTS,
      };
    case "banned":
      return {
        title: buildTitle(resolvedSystemName, "Akaun Disekat"),
        description:
          "Akses ke sistem ini telah disekat dan memerlukan tindakan lanjut daripada pentadbir sistem.",
        robots: NOINDEX_ROBOTS,
      };
    case "maintenance":
      return {
        title: buildTitle(resolvedSystemName, "Penyelenggaraan Sistem"),
        description:
          "Sistem sedang berada dalam mod penyelenggaraan untuk memastikan kestabilan operasi dan keselamatan data.",
        robots: NOINDEX_ROBOTS,
      };
    case "not-found":
      return {
        title: buildTitle(resolvedSystemName, "Halaman Tidak Dijumpai"),
        description:
          "Halaman yang diminta tidak dijumpai. Semak semula pautan atau kembali ke halaman utama SQR System.",
        robots: NOINDEX_ROBOTS,
      };
    case "monitor":
      return {
        title: buildTitle(
          resolvedSystemName,
          MONITOR_SECTION_TITLES[monitorSection] || "Monitor",
        ),
        description: DEFAULT_APP_DESCRIPTION,
        robots: NOINDEX_ROBOTS,
      };
    case "general-search":
      return {
        title: buildTitle(resolvedSystemName, "General Search"),
        description: DEFAULT_APP_DESCRIPTION,
        robots: NOINDEX_ROBOTS,
      };
    case "viewer":
      return {
        title: buildTitle(resolvedSystemName, "Viewer"),
        description: DEFAULT_APP_DESCRIPTION,
        robots: NOINDEX_ROBOTS,
      };
    case "saved":
      return {
        title: buildTitle(resolvedSystemName, "Saved Imports"),
        description: DEFAULT_APP_DESCRIPTION,
        robots: NOINDEX_ROBOTS,
      };
    case "collection-report":
      return {
        title: buildTitle(resolvedSystemName, "Collection"),
        description: DEFAULT_APP_DESCRIPTION,
        robots: NOINDEX_ROBOTS,
      };
    case "settings":
      return {
        title: buildTitle(resolvedSystemName, "Settings"),
        description: DEFAULT_APP_DESCRIPTION,
        robots: NOINDEX_ROBOTS,
      };
    default:
      return {
        title: buildTitle(resolvedSystemName, humanizePageName(currentPage)),
        description: DEFAULT_APP_DESCRIPTION,
        robots: NOINDEX_ROBOTS,
      };
  }
}

function setMetaContent(name: string, content: string, attr: "name" | "property" = "name") {
  if (typeof document === "undefined") return;
  const selector = `meta[${attr}="${name}"]`;
  const element = document.head.querySelector<HTMLMetaElement>(selector);
  if (element) {
    element.setAttribute("content", content);
    return;
  }

  const meta = document.createElement("meta");
  meta.setAttribute(attr, name);
  meta.setAttribute("content", content);
  document.head.appendChild(meta);
}

export function applyDocumentMetadata(metadata: DocumentMetadata) {
  if (typeof document === "undefined") return;
  document.title = metadata.title;
  setMetaContent("description", metadata.description);
  setMetaContent("robots", metadata.robots);
  setMetaContent("googlebot", metadata.robots);
  setMetaContent("og:title", metadata.title, "property");
  setMetaContent("og:description", metadata.description, "property");
  setMetaContent("twitter:title", metadata.title);
  setMetaContent("twitter:description", metadata.description);
}
