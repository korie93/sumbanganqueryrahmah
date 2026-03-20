type PerformAppLogoutParams = {
  activityId?: string;
  activityLogout: (activityId?: string) => Promise<unknown>;
  applyLoggedOutClientState: (redirectToLogin?: boolean, broadcast?: boolean) => void;
  broadcastLogoutToOtherTabs: () => void;
  warn: (message: string, error: unknown) => void;
};

type PerformClientLogoutParams = {
  applyLoggedOutClientState: (redirectToLogin?: boolean, broadcast?: boolean) => void;
  broadcastLogoutToOtherTabs: () => void;
};

export function performClientLogout({
  applyLoggedOutClientState,
  broadcastLogoutToOtherTabs,
}: PerformClientLogoutParams) {
  broadcastLogoutToOtherTabs();
  applyLoggedOutClientState(true, false);
}

export async function performAppLogout({
  activityId,
  activityLogout,
  applyLoggedOutClientState,
  broadcastLogoutToOtherTabs,
  warn,
}: PerformAppLogoutParams) {
  try {
    if (activityId) {
      await activityLogout(activityId);
    }
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("401:")) {
      warn("Logout activity failed:", error);
    }
  } finally {
    performClientLogout({
      applyLoggedOutClientState,
      broadcastLogoutToOtherTabs,
    });
  }
}
