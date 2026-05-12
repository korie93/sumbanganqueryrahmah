import type { User, UserActivity } from "../../shared/schema-postgres";
import type { IStorage } from "../storage-postgres";

type SessionSnapshotStorage = Pick<
  IStorage,
  | "getActivityById"
  | "getUser"
  | "getUserByUsername"
  | "isVisitorBanned"
> & {
  getAuthenticatedSessionSnapshot?: (activityId: string) => Promise<{
    activity: UserActivity;
    user?: User | undefined;
    isVisitorBanned: boolean;
  } | undefined>;
};

type DecodedSessionIdentity = {
  activityId: string;
  username: string;
};

export async function loadAuthenticatedSessionSnapshot(
  storage: SessionSnapshotStorage,
  decoded: DecodedSessionIdentity,
): Promise<{
  activity: UserActivity | undefined;
  user?: User | undefined;
  isVisitorBanned: boolean;
}> {
  if (storage.getAuthenticatedSessionSnapshot) {
    const snapshot = await storage.getAuthenticatedSessionSnapshot(decoded.activityId);
    if (snapshot) {
      return {
        activity: snapshot.activity,
        user: snapshot.user,
        isVisitorBanned: snapshot.isVisitorBanned,
      };
    }
  }

  const activity = await storage.getActivityById(decoded.activityId);
  if (!activity) {
    return {
      activity: undefined,
      user: undefined,
      isVisitorBanned: false,
    };
  }

  const [isVisitorBanned, user] = await Promise.all([
    storage.isVisitorBanned(
      activity.fingerprint ?? null,
      activity.ipAddress ?? null,
      activity.username || decoded.username,
    ),
    activity.userId
      ? storage.getUser(activity.userId)
      : storage.getUserByUsername(activity.username || decoded.username),
  ]);

  return {
    activity,
    user,
    isVisitorBanned,
  };
}
