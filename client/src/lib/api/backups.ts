import { apiRequest } from "../queryClient";

export async function createBackup(name: string) {
  const response = await apiRequest("POST", "/api/backups", { name });
  return response.json();
}

export async function getBackups() {
  const response = await apiRequest("GET", "/api/backups");
  return response.json();
}

export async function getBackupById(id: string) {
  const response = await apiRequest("GET", `/api/backups/${id}`);
  return response.json();
}

export async function restoreBackup(id: string) {
  const response = await apiRequest("POST", `/api/backups/${id}/restore`);
  return response.json();
}

export async function deleteBackup(id: string) {
  const response = await apiRequest("DELETE", `/api/backups/${id}`);
  return response.json();
}
