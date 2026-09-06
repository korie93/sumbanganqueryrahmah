import { lazy, Suspense, type ReactNode } from "react";
import { AppRouteErrorBoundary } from "@/app/AppRouteErrorBoundary";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { Button } from "@/components/ui/button";
import type { CollectionSubPage } from "@/pages/collection-report/types";

const SaveCollectionPage = lazy(() => import("@/pages/collection/SaveCollectionPage"));
const SuperuserSaveCollectionPage = lazy(() => import("@/pages/collection/SuperuserSaveCollectionPage"));
const CollectionRecordsPage = lazy(
  () => import("@/pages/collection/CollectionRecordsPage"),
);
const CollectionSummaryPage = lazy(
  () => import("@/pages/collection/CollectionSummaryPage"),
);
const CollectionMonthlyComparisonPage = lazy(
  () => import("@/pages/collection/CollectionMonthlyComparisonPage"),
);
const CollectionDailyPage = lazy(
  () => import("@/pages/collection/CollectionDailyPage"),
);
const BillingPrincipalReportPage = lazy(
  () => import("@/pages/collection/BillingPrincipalReportPage"),
);
const CollectionNicknameSummaryPage = lazy(
  () => import("@/pages/collection/CollectionNicknameSummaryPage"),
);
const ManageCollectionNicknamesPage = lazy(
  () => import("@/pages/collection/ManageCollectionNicknamesPage"),
);

type CollectionReportContentProps = {
  canAccessCollection: boolean;
  checkingNicknameSession?: boolean;
  nicknameReauthenticationRequired?: boolean;
  onReauthenticateNickname?: (() => void) | undefined;
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
  checkingNicknameSession = false,
  nicknameReauthenticationRequired = false,
  onReauthenticateNickname,
  role,
  staffNickname,
  subPage,
  onOpenNicknameDialog,
}: CollectionReportContentProps) {
  // Billing is account-assigned; this bypass does not grant nickname-scoped Collection access.
  if (subPage === "billing-principal") {
    return ["admin", "manager", "superuser"].includes(role)
      ? renderCollectionSection("billing-principal", <BillingPrincipalReportPage role={role} />)
      : <p role="alert">Billing OSP is available to authorized staff accounts only.</p>;
  }
  if (checkingNicknameSession) {
    return (
      <OperationalSectionCard title="Menyemak sesi nickname">
        <p role="status" className="text-sm text-muted-foreground">
          Sila tunggu sebentar sementara sesi nickname disahkan.
        </p>
      </OperationalSectionCard>
    );
  }
  const preserveSaveDraft = nicknameReauthenticationRequired
    && (role === "admin" || role === "user")
    && subPage === "save"
    && Boolean(staffNickname);
  if (!canAccessCollection && !preserveSaveDraft) {
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
    if (role === "manager") {
      return renderCollectionSection("records", <CollectionRecordsPage role={role} />);
    }
    return renderCollectionSection(
      "save",
      role === "superuser"
        ? <SuperuserSaveCollectionPage />
        : <SaveCollectionPage
            key={staffNickname}
            staffNickname={staffNickname}
            accessSuspended={nicknameReauthenticationRequired}
            onReauthenticateNickname={onReauthenticateNickname}
          />,
    );
  }
  if (subPage === "records") {
    return renderCollectionSection("records", <CollectionRecordsPage role={role} />);
  }
  if (subPage === "summary") {
    return renderCollectionSection(
      "summary",
      <CollectionSummaryPage role={role} />,
    );
  }
  if (subPage === "monthly-comparison") {
    return renderCollectionSection(
      "monthly-comparison",
      <CollectionMonthlyComparisonPage role={role} staffNickname={staffNickname} />,
    );
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
