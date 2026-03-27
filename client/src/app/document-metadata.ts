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
};

const DEFAULT_PUBLIC_DESCRIPTION =
  "SQR System ialah platform operasi dalaman untuk general search, semakan rekod, dan pengurusan data sumbangan secara tersusun dan terkawal.";

const DEFAULT_APP_DESCRIPTION =
  "Ruang kerja dalaman untuk general search, semakan rekod, laporan, dan pengurusan operasi Sumbangan Query Rahmah.";

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
        };
      }
      return {
        title: buildTitle(resolvedSystemName, "Platform Operasi Dalaman"),
        description: DEFAULT_PUBLIC_DESCRIPTION,
      };
    case "login":
      return {
        title: buildTitle(resolvedSystemName, "Log In"),
        description:
          "Akses ke ruang kerja dalaman SQR System untuk general search, semakan rekod, dan pengurusan operasi.",
      };
    case "forgot-password":
      return {
        title: buildTitle(resolvedSystemName, "Lupa Kata Laluan"),
        description:
          "Mulakan semula akses akaun anda melalui aliran pemulihan kata laluan SQR System.",
      };
    case "reset-password":
      return {
        title: buildTitle(resolvedSystemName, "Tetapan Semula Kata Laluan"),
        description:
          "Selesaikan penetapan semula kata laluan untuk kembali mengakses ruang kerja dalaman SQR System.",
      };
    case "activate-account":
      return {
        title: buildTitle(resolvedSystemName, "Aktivasi Akaun"),
        description:
          "Aktifkan akaun pengguna bagi mendapatkan akses ke sistem operasi dalaman SQR System.",
      };
    case "change-password":
      return {
        title: buildTitle(resolvedSystemName, "Tukar Kata Laluan"),
        description: DEFAULT_APP_DESCRIPTION,
      };
    case "banned":
      return {
        title: buildTitle(resolvedSystemName, "Akaun Disekat"),
        description:
          "Akses ke sistem ini telah disekat dan memerlukan tindakan lanjut daripada pentadbir sistem.",
      };
    case "maintenance":
      return {
        title: buildTitle(resolvedSystemName, "Penyelenggaraan Sistem"),
        description:
          "Sistem sedang berada dalam mod penyelenggaraan untuk memastikan kestabilan operasi dan keselamatan data.",
      };
    case "monitor":
      return {
        title: buildTitle(
          resolvedSystemName,
          MONITOR_SECTION_TITLES[monitorSection] || "Monitor",
        ),
        description: DEFAULT_APP_DESCRIPTION,
      };
    case "general-search":
      return {
        title: buildTitle(resolvedSystemName, "General Search"),
        description: DEFAULT_APP_DESCRIPTION,
      };
    case "viewer":
      return {
        title: buildTitle(resolvedSystemName, "Viewer"),
        description: DEFAULT_APP_DESCRIPTION,
      };
    case "saved":
      return {
        title: buildTitle(resolvedSystemName, "Saved Imports"),
        description: DEFAULT_APP_DESCRIPTION,
      };
    case "collection-report":
      return {
        title: buildTitle(resolvedSystemName, "Collection"),
        description: DEFAULT_APP_DESCRIPTION,
      };
    case "settings":
      return {
        title: buildTitle(resolvedSystemName, "Settings"),
        description: DEFAULT_APP_DESCRIPTION,
      };
    default:
      return {
        title: buildTitle(resolvedSystemName, humanizePageName(currentPage)),
        description: DEFAULT_APP_DESCRIPTION,
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
  setMetaContent("og:title", metadata.title, "property");
  setMetaContent("og:description", metadata.description, "property");
  setMetaContent("twitter:title", metadata.title);
  setMetaContent("twitter:description", metadata.description);
}
