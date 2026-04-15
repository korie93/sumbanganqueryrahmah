import { Suspense, type ReactNode } from "react";
import { AppRouteErrorBoundary } from "@/app/AppRouteErrorBoundary";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { Button } from "@/components/ui/button";
import { lazyWithPreload } from "@/lib/lazy-with-preload";
import type { CollectionSubPage } from "@/pages/collection-report/types";

const SaveCollectionPage = lazyWithPreload(() => import("@/pages/collection/SaveCollectionPage"));
const CollectionRecordsPage = lazyWithPreload(
  () => import("@/pages/collection/CollectionRecordsPage"),
);
const CollectionSummaryPage = lazyWithPreload(
  () => import("@/pages/collection/CollectionSummaryPage"),
);
const CollectionDailyPage = lazyWithPreload(
  () => import("@/pages/collection/CollectionDailyPage"),
);
const CollectionNicknameSummaryPage = lazyWithPreload(
  () => import("@/pages/collection/CollectionNicknameSummaryPage"),
);
const ManageCollectionNicknamesPage = lazyWithPreload(
  () => import("@/pages/collection/ManageCollectionNicknamesPage"),
);

type CollectionReportContentProps = {
  canAccessCollection: boolean;
  role: string;
  staffNickname: string;
  subPage: CollectionSubPage;
  onOpenNicknameDialog: () => void;
};

function CollectionSectionFallback() {
  return (
    <OperationalSectionCard contentClassName="flex min-h-[320px] items-center justify-center p-8">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
    </OperationalSectionCard>
  );
}

function renderCollectionSection(subPage: CollectionSubPage, node: ReactNode) {
  return (
    <AppRouteErrorBoundary
      routeKey={`collection-report:${subPage}`}
      routeLabel="collection-report"
    >
      <Suspense fallback={<CollectionSectionFallback />}>{node}</Suspense>
    </AppRouteErrorBoundary>
  );
}

export function CollectionReportContent({
  canAccessCollection,
  role,
  staffNickname,
  subPage,
  onOpenNicknameDialog,
}: CollectionReportContentProps) {
  if (!canAccessCollection) {
    return (
      <OperationalSectionCard
        title="Pengesahan Nickname Diperlukan"
        description="Lengkapkan pengesahan nickname dahulu sebelum meneruskan ke Collection Report."
      >
        <p className="text-sm text-muted-foreground">
          Sila lengkapkan pengesahan nickname dahulu sebelum meneruskan ke
          Collection Report.
        </p>
        <Button onClick={onOpenNicknameDialog}>
          Buka Pengesahan Nickname
        </Button>
      </OperationalSectionCard>
    );
  }

  if (subPage === "save") {
    return renderCollectionSection(
      "save",
      <SaveCollectionPage staffNickname={staffNickname} />,
    );
  }
  if (subPage === "records") {
    return renderCollectionSection("records", <CollectionRecordsPage role={role} />);
  }
  if (subPage === "summary") {
    return renderCollectionSection("summary", <CollectionSummaryPage role={role} />);
  }
  if (subPage === "daily") {
    return renderCollectionSection("daily", <CollectionDailyPage role={role} />);
  }
  if (subPage === "nickname-summary") {
    return renderCollectionSection(
      "nickname-summary",
      <CollectionNicknameSummaryPage role={role} />,
    );
  }

  return renderCollectionSection(
    "manage-nicknames",
    <ManageCollectionNicknamesPage
      role={role}
      currentNickname={staffNickname}
    />,
  );
}
