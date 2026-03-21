import { useEffect, useState } from "react";
import { getCollectionDailyUsers, type CollectionDailyUser } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { parseApiError } from "@/pages/collection/utils";

type UseCollectionDailyUsersDataOptions = {
  canManage: boolean;
};

export function useCollectionDailyUsersData({ canManage }: UseCollectionDailyUsersDataOptions) {
  const { toast } = useToast();
  const [users, setUsers] = useState<CollectionDailyUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    const run = async () => {
      setLoadingUsers(true);
      try {
        const response = await getCollectionDailyUsers();
        if (cancelled) return;
        setUsers(Array.isArray(response?.users) ? response.users : []);
      } catch (error: unknown) {
        if (cancelled) return;
        toast({
          title: "Failed to Load Staff Nicknames",
          description: parseApiError(error),
          variant: "destructive",
        });
      } finally {
        if (!cancelled) {
          setLoadingUsers(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [canManage, toast]);

  return {
    users,
    loadingUsers,
  };
}
