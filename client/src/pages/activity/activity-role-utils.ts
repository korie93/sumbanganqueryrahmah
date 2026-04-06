import { getStoredRole } from "@/lib/auth-session";

export function getCurrentActivityRole() {
  return getStoredRole();
}
