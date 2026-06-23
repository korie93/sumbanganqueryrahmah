import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientSrcDir = path.resolve(__dirname, "../..");

function readSource(relativePath: string) {
  return readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

function readTsxFiles(rootDir: string): Array<{ filePath: string; source: string }> {
  return readdirSync(rootDir).flatMap((entry) => {
    const entryPath = path.join(rootDir, entry);
    const stats = statSync(entryPath);
    if (stats.isDirectory()) {
      return readTsxFiles(entryPath);
    }
    if (!entryPath.endsWith(".tsx")) {
      return [];
    }
    return [{ filePath: entryPath, source: readFileSync(entryPath, "utf8") }];
  });
}

test("form controls omit aria-invalid when the field is valid", () => {
  const formSource = readSource("form.tsx");
  const loginSource = readSource("../../pages/Login.tsx");

  assert.doesNotMatch(formSource, /aria-invalid="false"/);
  assert.match(formSource, /getAriaInvalidProps\(Boolean\(error\)\)/);
  assert.doesNotMatch(formSource, /aria-invalid=\{[^}]+\}/);
  assert.doesNotMatch(loginSource, /"aria-invalid": "false"/);
});

test("aria state tokens avoid direct JSX expressions for Edge inspection", () => {
  const directAriaExpression = /aria-(?:pressed|hidden|expanded|selected|current|required|invalid)=\{[^}]+\}/;
  const offenders = [
    ...readTsxFiles(path.join(clientSrcDir, "components")),
    ...readTsxFiles(path.join(clientSrcDir, "pages")),
  ].flatMap(({ filePath, source }) => {
    const match = source.match(directAriaExpression);
    return match ? [`${path.relative(clientSrcDir, filePath)}: ${match[0]}`] : [];
  });

  assert.deepEqual(offenders, []);
});

test("table headers default to column scope while allowing overrides", () => {
  const tableSource = readSource("table.tsx");

  assert.match(tableSource, /scope = "col"/);
  assert.match(tableSource, /scope=\{scope\}/);
});

test("breadcrumb current page is not exposed as an inactive link", () => {
  const breadcrumbSource = readSource("breadcrumb.tsx");

  assert.doesNotMatch(breadcrumbSource, /role="link"/);
  assert.match(breadcrumbSource, /aria-current="page"/);
});

test("toast notifications expose polite and assertive live-region semantics", () => {
  const toastSource = readSource("toast.tsx");
  const toasterSource = readSource("toaster.tsx");
  const requestReferenceSource = readSource("ToastRequestReference.tsx");

  assert.match(toastSource, /role="presentation"/);
  assert.match(toastSource, /role: "alert" as const/);
  assert.match(toastSource, /"aria-live": "assertive" as const/);
  assert.match(toastSource, /"aria-atomic": "true" as const/);
  assert.match(toastSource, /role: "status" as const/);
  assert.match(toastSource, /"aria-live": "polite" as const/);
  assert.match(toastSource, /data-slot="toast"/);
  assert.match(toastSource, /data-variant=\{resolvedVariant\}/);
  assert.match(requestReferenceSource, /type="button"/);
  assert.match(requestReferenceSource, /aria-label=\{copied \?/);
  assert.match(requestReferenceSource, /aria-live="polite"/);
  assert.match(toasterSource, /aria-label=\{`Notifikasi ini berlaku \$\{countLabel\}`\}/);
});

test("icon buttons derive an accessible name from an explicit title fallback", () => {
  const buttonSource = readSource("button.tsx");

  assert.match(buttonSource, /"aria-label": ariaLabel/);
  assert.match(buttonSource, /size === "icon" && typeof title === "string" \? title : undefined/);
  assert.match(buttonSource, /\{\.\.\.ariaLabelProps\}/);
});

test("checkbox checkmark icon is decorative only", () => {
  const checkboxSource = readSource("checkbox.tsx");
  const contextMenuSource = readSource("context-menu.tsx");
  const dropdownMenuSource = readSource("dropdown-menu.tsx");
  const menubarSource = readSource("menubar.tsx");

  assert.match(checkboxSource, /<Check className="h-4 w-4" aria-hidden="true" \/>/);
  assert.match(contextMenuSource, /<Check className="h-4 w-4" aria-hidden="true" \/>/);
  assert.match(dropdownMenuSource, /<Check className="h-4 w-4" aria-hidden="true" \/>/);
  assert.match(menubarSource, /<Check className="h-4 w-4" aria-hidden="true" \/>/);
});

test("shared primitive visual indicators are decorative only", () => {
  const accordionSource = readSource("accordion.tsx");
  const breadcrumbSource = readSource("breadcrumb.tsx");
  const calendarSource = readSource("calendar.tsx");
  const commandSource = readSource("command.tsx");
  const datePickerSource = readSource("date-picker-field.tsx");
  const dialogSource = readSource("dialog.tsx");
  const sheetSource = readSource("sheet.tsx");
  const radioGroupSource = readSource("radio-group.tsx");
  const resizableSource = readSource("resizable.tsx");

  assert.match(accordionSource, /<ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" aria-hidden="true" \/>/);
  assert.match(breadcrumbSource, /<MoreHorizontal className="h-4 w-4" aria-hidden="true" \/>/);
  assert.match(calendarSource, /<ChevronLeft className=\{cn\("h-4 w-4", className\)\} \{\.\.\.props\} aria-hidden="true" \/>/);
  assert.match(calendarSource, /<ChevronRight className=\{cn\("h-4 w-4", className\)\} \{\.\.\.props\} aria-hidden="true" \/>/);
  assert.match(commandSource, /<Search className="mr-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" \/>/);
  assert.match(datePickerSource, /<CalendarIcon[\s\S]*aria-hidden="true"/);
  assert.match(datePickerSource, /getAriaInvalidProps\(ariaInvalid\)/);
  assert.match(datePickerSource, /const triggerRequiredProps = ariaRequired \? \{ "aria-required": ariaRequired \} : \{\}/);
  assert.match(datePickerSource, /\{\.\.\.triggerRequiredProps\}/);
  assert.doesNotMatch(datePickerSource, /aria-required=\{/);
  assert.match(dialogSource, /<X className="h-4 w-4" aria-hidden="true" \/>/);
  assert.match(sheetSource, /<X className="h-4 w-4" aria-hidden="true" \/>/);
  assert.match(radioGroupSource, /<Circle className="h-2\.5 w-2\.5 fill-current text-current" aria-hidden="true" \/>/);
  assert.match(resizableSource, /<GripVertical className="h-2\.5 w-2\.5" aria-hidden="true" \/>/);
});

test("menu submenu arrows and radio dots are decorative only", () => {
  const contextMenuSource = readSource("context-menu.tsx");
  const dropdownMenuSource = readSource("dropdown-menu.tsx");
  const menubarSource = readSource("menubar.tsx");

  assert.match(contextMenuSource, /<ChevronRight className="ml-auto h-4 w-4" aria-hidden="true" \/>/);
  assert.match(contextMenuSource, /<Circle className="h-2 w-2 fill-current" aria-hidden="true" \/>/);
  assert.match(dropdownMenuSource, /<ChevronRight className="ml-auto" aria-hidden="true" \/>/);
  assert.match(dropdownMenuSource, /<Circle className="h-2 w-2 fill-current" aria-hidden="true" \/>/);
  assert.match(menubarSource, /<ChevronRight className="ml-auto h-4 w-4" aria-hidden="true" \/>/);
  assert.match(menubarSource, /<Circle className="h-2 w-2 fill-current" aria-hidden="true" \/>/);
});

test("Floating AI trigger exposes dialog relationship and expanded state", () => {
  const triggerSource = readSource("../FloatingAITrigger.tsx");

  assert.match(triggerSource, /aria-controls=\{panelId\}/);
  assert.match(triggerSource, /aria-haspopup="dialog"/);
  assert.match(triggerSource, /aria-label=\{isOpen \? `Kecilkan panel/);
  assert.match(triggerSource, /getAriaExpandedProps\(isOpen\)/);
  assert.doesNotMatch(triggerSource, /aria-expanded=\{[^}]+\}/);
});

test("sidebar rail is an explicit non-submit control", () => {
  const sidebarSource = readSource("sidebar.tsx");

  assert.match(sidebarSource, /<button[\s\S]*type="button"[\s\S]*data-sidebar="rail"/);
});

test("modal shells use Radix focus-managed primitives and labelled close controls", () => {
  const dialogSource = readSource("dialog.tsx");
  const sheetSource = readSource("sheet.tsx");
  const alertDialogSource = readSource("alert-dialog.tsx");

  assert.match(dialogSource, /import \* as DialogPrimitive from "@radix-ui\/react-dialog"/);
  assert.match(dialogSource, /<DialogPrimitive\.Content/);
  assert.match(dialogSource, /<DialogPrimitive\.Close aria-label="Close"/);
  assert.match(sheetSource, /import \* as SheetPrimitive from "@radix-ui\/react-dialog"/);
  assert.match(sheetSource, /<SheetPrimitive\.Content/);
  assert.match(sheetSource, /<SheetPrimitive\.Close aria-label="Close"/);
  assert.match(alertDialogSource, /import \* as AlertDialogPrimitive from "@radix-ui\/react-alert-dialog"/);
  assert.match(alertDialogSource, /<AlertDialogPrimitive\.Content/);
});

test("tooltips stay keyboard accessible through Radix trigger/content primitives", () => {
  const tooltipSource = readSource("tooltip.tsx");
  const infoHintSource = readSource("../monitor/InfoHint.tsx");
  const metricPanelSource = readSource("../monitor/MetricPanel.tsx");
  const monthlyHintSource = readSource("../../pages/collection-summary/MonthlyComparisonHint.tsx");

  assert.match(tooltipSource, /import \* as TooltipPrimitive from "@radix-ui\/react-tooltip"/);
  assert.match(tooltipSource, /const Tooltip = TooltipPrimitive\.Root/);
  assert.match(tooltipSource, /const TooltipTrigger = TooltipPrimitive\.Trigger/);
  assert.match(tooltipSource, /<TooltipPrimitive\.Content/);
  assert.match(infoHintSource, /<TooltipTrigger asChild>/);
  assert.match(infoHintSource, /<button[\s\S]*type="button"[\s\S]*aria-label="Maklumat bantuan"/);
  assert.match(metricPanelSource, /<TooltipTrigger asChild>/);
  assert.match(metricPanelSource, /aria-label=\{`\$\{label\} description`\}/);
  assert.match(monthlyHintSource, /<TooltipTrigger asChild>/);
  assert.match(monthlyHintSource, /aria-label=\{label\}/);
});

test("AI chat dynamic status and message regions are announced politely", () => {
  const aiChatSource = readSource("../AIChat.tsx");

  assert.match(aiChatSource, /<span role="status" aria-live="polite" aria-atomic="true">/);
  assert.match(aiChatSource, /role="log"/);
  assert.match(aiChatSource, /aria-relevant="additions text"/);
  assert.match(aiChatSource, /className="ai-notice" role="status" aria-live="polite" aria-atomic="true"/);
});

test("toast close controls keep an explicit accessible name", () => {
  const toastSource = readSource("toast.tsx");

  assert.match(toastSource, /const ariaLabel = props\["aria-label"\] \?\? "Dismiss notification"/);
  assert.match(toastSource, /aria-label=\{ariaLabel\}/);
  assert.match(toastSource, /title=\{title\}/);
});

test("chart containers expose an accessible name by default", () => {
  const chartSource = readSource("chart.tsx");

  assert.match(chartSource, /role="img"/);
  assert.doesNotMatch(chartSource, /role=\{[^}]+\}/);
  assert.match(chartSource, /aria-label=\{resolvedAriaLabel\}/);
  assert.match(chartSource, /"Data chart"/);
});
