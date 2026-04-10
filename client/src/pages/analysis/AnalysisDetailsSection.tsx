import { Suspense, lazy } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Plane, Shield, Users } from "lucide-react";
import { AnalysisCategoryCard } from "@/pages/analysis/AnalysisCategoryCard";
import { AnalysisSectionFallback } from "@/pages/analysis/AnalysisSectionFallback";
import type { AnalysisData, AnalysisMode, AllAnalysisResult } from "@/pages/analysis/types";
import type { useDeferredAnalysisSectionMount } from "@/pages/analysis/useDeferredAnalysisSectionMount";

const AnalysisExpandableSection = lazy(() =>
  import("@/pages/analysis/AnalysisExpandableSection").then((module) => ({
    default: module.AnalysisExpandableSection,
  })),
);
const AnalysisFilesList = lazy(() =>
  import("@/pages/analysis/AnalysisTables").then((module) => ({
    default: module.AnalysisFilesList,
  })),
);
const AnalysisDuplicatesPanel = lazy(() =>
  import("@/pages/analysis/AnalysisTables").then((module) => ({
    default: module.AnalysisDuplicatesPanel,
  })),
);

type DeferredSectionMount = ReturnType<typeof useDeferredAnalysisSectionMount>;

type PaginatedItems<T> = {
  page: number;
  start: number;
  end: number;
  totalPages: number;
  items: T[];
};

type AnalysisDetailsState = {
  copiedItems: Record<string, boolean>;
  expandedSections: Record<string, boolean>;
  specialIdPagedSections: {
    polis: PaginatedItems<string>;
    tentera: PaginatedItems<string>;
    passportMY: PaginatedItems<string>;
    passportLN: PaginatedItems<string>;
  };
  filesPaged: PaginatedItems<AllAnalysisResult["imports"][number]>;
  duplicatesPaged: PaginatedItems<AnalysisData["duplicates"]["items"][number]>;
  filesListOpen: boolean;
  duplicatesOpen: boolean;
  setFilesListOpen: Dispatch<SetStateAction<boolean>>;
  setDuplicatesOpen: Dispatch<SetStateAction<boolean>>;
  setPage: (key: string, page: number, totalItems: number) => void;
  toggleSection: (key: string) => void;
  copyToClipboard: (text: string, itemKey?: string) => void;
  copyAllToClipboard: (items: string[], sectionKey: string) => void;
};

type AnalysisDetailsSectionProps = {
  section: DeferredSectionMount;
  analysis: AnalysisData;
  mode: AnalysisMode;
  allResult: AllAnalysisResult | null;
  displayState: AnalysisDetailsState;
};

export function AnalysisDetailsSection({
  section,
  analysis,
  mode,
  allResult,
  displayState,
}: AnalysisDetailsSectionProps) {
  const hasSpecialIdSamples =
    analysis.noPolis.samples?.length > 0 ||
    analysis.noTentera.samples?.length > 0 ||
    analysis.passportMY.samples?.length > 0 ||
    analysis.passportLuarNegara.samples?.length > 0;

  return (
    <div ref={section.triggerRef}>
      {section.shouldRender ? (
        <>
          <h2 className="text-lg font-semibold text-foreground mb-4">ID Type Detection</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            <AnalysisCategoryCard
              title="IC Male"
              icon={Users}
              category={analysis.icLelaki}
              colorClass="text-blue-500"
              onCopySample={displayState.copyToClipboard}
            />
            <AnalysisCategoryCard
              title="IC Female"
              icon={Users}
              category={analysis.icPerempuan}
              colorClass="text-pink-500"
              onCopySample={displayState.copyToClipboard}
            />
            <AnalysisCategoryCard
              title="Police No."
              icon={Shield}
              category={analysis.noPolis}
              colorClass="text-yellow-600"
              onCopySample={displayState.copyToClipboard}
            />
            <AnalysisCategoryCard
              title="Military No."
              icon={Shield}
              category={analysis.noTentera}
              colorClass="text-green-600"
              onCopySample={displayState.copyToClipboard}
            />
            <AnalysisCategoryCard
              title="Passport Malaysia"
              icon={Plane}
              category={analysis.passportMY}
              colorClass="text-purple-500"
              onCopySample={displayState.copyToClipboard}
            />
            <AnalysisCategoryCard
              title="Foreign Passport"
              icon={Plane}
              category={analysis.passportLuarNegara}
              colorClass="text-orange-500"
              onCopySample={displayState.copyToClipboard}
            />
          </div>

          {hasSpecialIdSamples ? (
            <>
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Special ID List (Click to view, up to 50 samples)
              </h2>
              <Suspense fallback={<AnalysisSectionFallback label="Loading special ID lists..." />}>
                <div className="space-y-3 mb-8">
                  <AnalysisExpandableSection
                    copiedItems={displayState.copiedItems}
                    isExpanded={displayState.expandedSections.polis || false}
                    items={analysis.noPolis.samples || []}
                    onCopyAll={displayState.copyAllToClipboard}
                    onCopyItem={displayState.copyToClipboard}
                    onPageChange={displayState.setPage}
                    onToggle={() => displayState.toggleSection("polis")}
                    page={displayState.specialIdPagedSections.polis.page}
                    pagedItems={displayState.specialIdPagedSections.polis.items}
                    sectionKey="polis"
                    start={displayState.specialIdPagedSections.polis.start}
                    totalPages={displayState.specialIdPagedSections.polis.totalPages}
                    title="Police No."
                    colorClass="text-yellow-600"
                    icon={Shield}
                  />
                  <AnalysisExpandableSection
                    copiedItems={displayState.copiedItems}
                    isExpanded={displayState.expandedSections.tentera || false}
                    items={analysis.noTentera.samples || []}
                    onCopyAll={displayState.copyAllToClipboard}
                    onCopyItem={displayState.copyToClipboard}
                    onPageChange={displayState.setPage}
                    onToggle={() => displayState.toggleSection("tentera")}
                    page={displayState.specialIdPagedSections.tentera.page}
                    pagedItems={displayState.specialIdPagedSections.tentera.items}
                    sectionKey="tentera"
                    start={displayState.specialIdPagedSections.tentera.start}
                    totalPages={displayState.specialIdPagedSections.tentera.totalPages}
                    title="Military No."
                    colorClass="text-green-600"
                    icon={Shield}
                  />
                  <AnalysisExpandableSection
                    copiedItems={displayState.copiedItems}
                    isExpanded={displayState.expandedSections.passportMY || false}
                    items={analysis.passportMY.samples || []}
                    onCopyAll={displayState.copyAllToClipboard}
                    onCopyItem={displayState.copyToClipboard}
                    onPageChange={displayState.setPage}
                    onToggle={() => displayState.toggleSection("passportMY")}
                    page={displayState.specialIdPagedSections.passportMY.page}
                    pagedItems={displayState.specialIdPagedSections.passportMY.items}
                    sectionKey="passportMY"
                    start={displayState.specialIdPagedSections.passportMY.start}
                    totalPages={displayState.specialIdPagedSections.passportMY.totalPages}
                    title="Passport Malaysia"
                    colorClass="text-purple-500"
                    icon={Plane}
                  />
                  <AnalysisExpandableSection
                    copiedItems={displayState.copiedItems}
                    isExpanded={displayState.expandedSections.passportLN || false}
                    items={analysis.passportLuarNegara.samples || []}
                    onCopyAll={displayState.copyAllToClipboard}
                    onCopyItem={displayState.copyToClipboard}
                    onPageChange={displayState.setPage}
                    onToggle={() => displayState.toggleSection("passportLN")}
                    page={displayState.specialIdPagedSections.passportLN.page}
                    pagedItems={displayState.specialIdPagedSections.passportLN.items}
                    sectionKey="passportLN"
                    start={displayState.specialIdPagedSections.passportLN.start}
                    totalPages={displayState.specialIdPagedSections.passportLN.totalPages}
                    title="Foreign Passport"
                    colorClass="text-orange-500"
                    icon={Plane}
                  />
                </div>
              </Suspense>
            </>
          ) : null}

          {mode === "all" && allResult ? (
            <Suspense fallback={<AnalysisSectionFallback label="Loading analyzed files..." />}>
              <AnalysisFilesList
                allResult={allResult}
                filesListOpen={displayState.filesListOpen}
                filesPaged={displayState.filesPaged}
                onFilesListOpenChange={displayState.setFilesListOpen}
                onPageChange={displayState.setPage}
              />
            </Suspense>
          ) : null}

          <Suspense fallback={<AnalysisSectionFallback label="Loading duplicates list..." />}>
            <AnalysisDuplicatesPanel
              count={analysis.duplicates.count}
              duplicates={analysis.duplicates.items}
              duplicatesOpen={displayState.duplicatesOpen}
              duplicatesPaged={displayState.duplicatesPaged}
              onCopyDuplicate={displayState.copyToClipboard}
              onDuplicatesOpenChange={displayState.setDuplicatesOpen}
              onPageChange={displayState.setPage}
            />
          </Suspense>
        </>
      ) : (
        <AnalysisSectionFallback label="Detailed analysis sections will load as you scroll." />
      )}
    </div>
  );
}
