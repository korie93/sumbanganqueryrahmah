import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function UserAccountManagementHeader({ onCreate }: { onCreate: () => void }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h1 className="ops-page-title">Account Management</h1>
        <p className="text-sm leading-6 text-muted-foreground">Manage user lifecycle, reset requests, and local mail outbox.</p>
      </div>
      <Button type="button" className="min-h-11 shrink-0 self-start sm:min-h-10" onClick={onCreate}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Create Account
      </Button>
    </header>
  );
}
