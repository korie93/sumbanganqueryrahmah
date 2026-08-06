import { Eye, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GeneralSearchRelatedAccount } from "@/pages/general-search/general-search-related-accounts-utils";
import type { SearchResultRow } from "@/pages/general-search/types";

type GeneralSearchRelatedAccountsProps = {
  accounts: GeneralSearchRelatedAccount[];
  canSeeSourceFile: boolean;
  onRecordSelect: (record: SearchResultRow) => void;
};

const COLLECTION_STATE_PRESENTATION = {
  historical: {
    className: "text-amber-800 dark:text-amber-300",
    label: "Sejarah collection",
  },
  not_recorded: {
    className: "text-muted-foreground",
    label: "Tiada collection",
  },
  recorded: {
    className: "text-emerald-700 dark:text-emerald-300",
    label: "Collection aktif",
  },
  unavailable: {
    className: "text-muted-foreground",
    label: "Status belum disahkan",
  },
} as const;

export function GeneralSearchRelatedAccounts({
  accounts,
  canSeeSourceFile,
  onRecordSelect,
}: GeneralSearchRelatedAccountsProps) {
  if (accounts.length <= 1) return null;

  return (
    <section
      aria-labelledby="general-search-related-accounts-heading"
      className="rounded-lg border border-border/60 bg-muted/15 p-3"
    >
      <div className="flex min-w-0 items-start gap-2">
        <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <h3
            className="text-sm font-semibold text-foreground"
            id="general-search-related-accounts-heading"
          >
            Akaun berkaitan dalam hasil carian ini
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Dipadankan melalui nombor IC sah yang sama. Nama sahaja tidak digunakan.
          </p>
        </div>
        <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
          {accounts.length}
        </span>
      </div>

      <ul className="mt-3 max-h-56 divide-y divide-border/60 overflow-y-auto rounded-md border border-border/60 bg-background">
        {accounts.map((account) => {
          const collectionState = COLLECTION_STATE_PRESENTATION[account.collectionState];
          return (
            <li
              className={cn(
                "flex min-w-0 items-center gap-3 px-3 py-2",
                account.isSelected && "bg-primary/5",
              )}
              key={account.accountNumber}
            >
              <div className="min-w-0 flex-1">
                <p className="break-all text-sm font-semibold text-foreground">
                  {account.accountNumber}
                </p>
                <p className={cn("mt-0.5 text-xs", collectionState.className)}>
                  {collectionState.label}
                </p>
                {canSeeSourceFile && account.sourceFile ? (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    Fail Saved: {account.sourceFile}
                  </p>
                ) : null}
              </div>
              {account.isSelected ? (
                <span
                  aria-current="true"
                  className="shrink-0 text-xs font-semibold text-primary"
                >
                  Sedang dilihat
                </span>
              ) : (
                <Button
                  aria-label={`Lihat butiran akaun ${account.accountNumber}`}
                  className="shrink-0"
                  onClick={() => onRecordSelect(account.record)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Eye aria-hidden="true" />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
