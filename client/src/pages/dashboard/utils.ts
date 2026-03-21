import { Activity, Database, FileText, LogIn, ShieldOff, Users } from "lucide-react";
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from "@/lib/date-format";
import type { SummaryCardItem, SummaryData } from "@/pages/dashboard/types";

export const ROLE_COLORS: Record<string, string> = {
  superuser: "hsl(var(--chart-1))",
  admin: "hsl(var(--chart-2))",
  user: "hsl(var(--chart-3))",
};

export function formatDashboardHour(hour: number) {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

export function formatDashboardDate(dateStr: string) {
  return formatDateDDMMYYYY(dateStr, dateStr);
}

export function buildSummaryCards(summary: SummaryData | undefined): SummaryCardItem[] {
  return [
    {
      title: "Total Users",
      value: summary?.totalUsers || 0,
      icon: Users,
      color: "text-blue-600 dark:text-blue-400",
    },
    {
      title: "Active Sessions",
      value: summary?.activeSessions || 0,
      icon: Activity,
      color: "text-green-600 dark:text-green-400",
    },
    {
      title: "Logins Today",
      value: summary?.loginsToday || 0,
      icon: LogIn,
      color: "text-purple-600 dark:text-purple-400",
    },
    {
      title: "Total Data Rows",
      value: summary?.totalDataRows || 0,
      icon: Database,
      color: "text-orange-600 dark:text-orange-400",
    },
    {
      title: "Total Imports",
      value: summary?.totalImports || 0,
      icon: FileText,
      color: "text-teal-600 dark:text-teal-400",
    },
    {
      title: "Banned Users",
      value: summary?.bannedUsers || 0,
      icon: ShieldOff,
      color: "text-red-600 dark:text-red-400",
    },
  ];
}

export async function exportDashboardToPdf(element: HTMLDivElement) {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const isDark = document.documentElement.classList.contains("dark");
  const backgroundColor = isDark ? "#1e293b" : "#ffffff";

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    logging: false,
    backgroundColor,
    width: element.scrollWidth,
    height: element.scrollHeight,
    scrollX: 0,
    scrollY: -window.scrollY,
    ignoreElements: (node) => node.tagName === "IFRAME",
    onclone: (clonedDoc) => {
      const style = clonedDoc.createElement("style");
      style.textContent = `
        * {
          color: ${isDark ? "#e2e8f0" : "#1e293b"} !important;
          background-color: ${isDark ? "#1e293b" : "#ffffff"} !important;
          border-color: ${isDark ? "#475569" : "#e2e8f0"} !important;
        }
        .recharts-text { fill: ${isDark ? "#e2e8f0" : "#1e293b"} !important; }
      `;
      clonedDoc.head.appendChild(style);
    },
  });

  const imageData = canvas.toDataURL("image/png", 1.0);
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  pdf.setFillColor(isDark ? 30 : 255, isDark ? 41 : 255, isDark ? 59 : 255);
  pdf.rect(0, 0, pageWidth, pageHeight, "F");

  pdf.setFontSize(20);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(isDark ? 255 : 30);
  pdf.text("SQR Dashboard Analytics Report", 14, 18);

  pdf.setFontSize(11);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(isDark ? 180 : 100);
  pdf.text(`Generated: ${formatDateTimeDDMMYYYY(new Date(), { includeSeconds: true })}`, 14, 26);

  pdf.setDrawColor(isDark ? 100 : 200);
  pdf.setLineWidth(0.5);
  pdf.line(14, 30, pageWidth - 14, 30);

  const margin = 14;
  const headerHeight = 35;
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - headerHeight - margin;
  const ratio = Math.min(availableWidth / canvas.width, availableHeight / canvas.height);
  const finalWidth = canvas.width * ratio;
  const finalHeight = canvas.height * ratio;
  const imageX = margin + (availableWidth - finalWidth) / 2;
  const imageY = headerHeight;

  pdf.addImage(imageData, "PNG", imageX, imageY, finalWidth, finalHeight);
  pdf.setFontSize(8);
  pdf.setTextColor(isDark ? 120 : 150);
  pdf.text("Sumbangan Query Rahmah (SQR) System", margin, pageHeight - 5);
  pdf.text("Page 1 of 1", pageWidth - margin - 20, pageHeight - 5);
  pdf.save(`SQR-Dashboard-Report-${new Date().toISOString().split("T")[0]}.pdf`);
}
