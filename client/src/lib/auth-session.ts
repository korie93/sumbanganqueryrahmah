import type { User } from "@/app/types";

export function persistAuthenticatedUser(user: User) {
  localStorage.setItem("username", user.username);
  localStorage.setItem("role", user.role);
  localStorage.setItem("user", JSON.stringify(user));
  if (user.mustChangePassword) {
    localStorage.setItem("forcePasswordChange", "1");
  } else {
    localStorage.removeItem("forcePasswordChange");
  }
}

export function clearAuthenticatedUserStorage() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("username");
  localStorage.removeItem("role");
  localStorage.removeItem("forcePasswordChange");
  localStorage.removeItem("activityId");
  localStorage.removeItem("activeTab");
  localStorage.removeItem("lastPage");
  localStorage.removeItem("selectedImportId");
  localStorage.removeItem("selectedImportName");
  localStorage.removeItem("fingerprint");
  sessionStorage.removeItem("collection_staff_nickname");
  sessionStorage.removeItem("collection_staff_nickname_auth");
}
