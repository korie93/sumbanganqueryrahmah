import { lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CollectionSubPage } from "@/pages/collection-report/types";

const SaveCollectionPage = lazy(() => import("@/pages/collection/SaveCollectionPage"));
const CollectionRecordsPage = lazy(
  () => import("@/pages/collection/CollectionRecordsPage"),
);
const CollectionSummaryPage = lazy(
  () => import("@/pages/collection/CollectionSummaryPage"),
);
const CollectionNicknameSummaryPage = lazy(
  () => import("@/pages/collection/CollectionNicknameSummaryPage"),
);
const ManageCollectionNicknamesPage = lazy(
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
    <Card className="border-border/60 bg-background/70">
      <CardContent className="flex min-h-[320px] items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
      </CardContent>
    </Card>
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
      <Card className="border-border/60 bg-background/75 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl">Pengesahan Nickname Diperlukan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Sila lengkapkan pengesahan nickname dahulu sebelum meneruskan ke
            Collection Report.
          </p>
          <Button onClick={onOpenNicknameDialog}>
            Buka Pengesahan Nickname
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (subPage === "save") {
    return (
      <Suspense fallback={<CollectionSectionFallback />}>
        <SaveCollectionPage staffNickname={staffNickname} />
      </Suspense>
    );
  }
  if (subPage === "records") {
    return (
      <Suspense fallback={<CollectionSectionFallback />}>
        <CollectionRecordsPage role={role} />
      </Suspense>
    );
  }
  if (subPage === "summary") {
    return (
      <Suspense fallback={<CollectionSectionFallback />}>
        <CollectionSummaryPage role={role} />
      </Suspense>
    );
  }
  if (subPage === "nickname-summary") {
    return (
      <Suspense fallback={<CollectionSectionFallback />}>
        <CollectionNicknameSummaryPage role={role} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<CollectionSectionFallback />}>
      <ManageCollectionNicknamesPage
        role={role}
        currentNickname={staffNickname}
      />
    </Suspense>
  );
}
