export type RuntimeWebSocketActivity = {
  id?: string | null;
  userId?: string | number | null;
  username?: string | null;
};

export function getActivityUserKey(activity: RuntimeWebSocketActivity): string | null {
  const userId = String(activity.userId ?? "").trim();
  if (userId) {
    return `id:${userId}`;
  }

  const username = String(activity.username || "").trim().toLowerCase();
  return username ? `username:${username}` : null;
}
