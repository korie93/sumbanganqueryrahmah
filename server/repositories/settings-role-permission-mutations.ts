import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getRoleFeatureRestriction, parseRoleFeatureSettingKey } from "../../shared/role-feature-access";
import { db } from "../db-postgres";
import { getRequestIdFromContext } from "../lib/request-context";
import type { SystemSettingItem } from "../config/system-settings";
import type { SettingsUpdateResult } from "./settings-repository-types";
import { buildTextInList, queryRows } from "./settings-repository-query-utils";
import { buildSystemSettingItem } from "./settings-repository-view-utils";
import { normalizeSettingValue } from "./settings-repository-value-utils";

export type RolePermissionUpdateInput = {
  role: string;
  updates: Array<{ key: string; value: string | number | boolean | null }>;
  confirmCritical?: boolean;
  updatedBy: string;
};
export type RolePermissionUpdateResult = SettingsUpdateResult & { settings?: SystemSettingItem[] };

// Tab configuration, version history and audit commit together. This is also
// used by the legacy single-key endpoint, so it cannot bypass batch invariants.
export async function updateRolePermissions(input: RolePermissionUpdateInput): Promise<RolePermissionUpdateResult> {
  if (input.role !== "superuser") return { status: "forbidden", message: "Only superuser can change role permissions." };
  const keys = input.updates.map((update) => update.key);
  if (!keys.length || keys.length > 50 || new Set(keys).size !== keys.length) {
    return { status: "invalid", message: "Provide between 1 and 50 unique role permission keys." };
  }
  const values = new Map<string, string>();
  for (const update of input.updates) {
    const parsed = parseRoleFeatureSettingKey(update.key);
    if (!parsed) return { status: "invalid", message: "Unknown role permission key." };
    const restriction = getRoleFeatureRestriction(parsed.role, parsed.feature);
    if (restriction) return { status: "forbidden", message: restriction };
    const value = normalizeSettingValue("boolean", update.value);
    if (value === null) return { status: "invalid", message: "Role permission values must be boolean." };
    values.set(update.key, value);
  }
  return db.transaction(async (tx) => {
    // One deterministic lock order also serializes overlapping concurrent saves.
    const rows = queryRows<Record<string, unknown>>(await tx.execute(sql`
      SELECT s.*, COALESCE(p.can_edit, false) AS can_edit
      FROM public.system_settings s
      LEFT JOIN public.role_setting_permissions p ON p.setting_key = s.key AND p.role = ${input.role}
      WHERE s.key IN (${buildTextInList(keys)}) ORDER BY s.key FOR UPDATE OF s
    `));
    if (rows.length !== keys.length) return { status: "not_found", message: "Role permission setting not found." };
    if (rows.some((row) => row.can_edit !== true)) return { status: "forbidden", message: "You do not have permission to edit these settings." };
    if (rows.some((row) => row.type !== "boolean")) return { status: "invalid", message: "Role permission settings must be boolean." };
    if (!input.confirmCritical && rows.some((row) => row.is_critical === true)) {
      return { status: "requires_confirmation", message: "Critical setting requires explicit confirmation." };
    }
    const settings: SystemSettingItem[] = [];
    for (const row of rows) {
      const key = String(row.key);
      const nextValue = values.get(key)!;
      if (String(row.value) === nextValue) continue;
      const result = await tx.execute(sql`
        UPDATE public.system_settings SET value = ${nextValue}, updated_at = now()
        WHERE id = ${row.id} RETURNING *
      `);
      const updated = queryRows<Record<string, unknown>>(result)[0];
      if (!updated) throw new Error("Role permission update did not complete.");
      await tx.execute(sql`
        INSERT INTO public.setting_versions (setting_key, old_value, new_value, changed_by, changed_at)
        VALUES (${key}, ${String(row.value)}, ${nextValue}, ${input.updatedBy}, now())
      `);
      await tx.execute(sql`
        INSERT INTO public.audit_logs (id, action, performed_by, request_id, target_resource, details, timestamp)
        VALUES (${randomUUID()}, ${row.is_critical ? "CRITICAL_SETTING_UPDATED" : "SETTING_UPDATED"},
          ${input.updatedBy}, ${getRequestIdFromContext()}, ${key}, ${`Updated setting ${key} to "${nextValue}"`}, now())
      `);
      settings.push(buildSystemSettingItem({ row: updated, canEdit: true }));
    }
    return { status: settings.length ? "updated" : "unchanged", message: settings.length ? "Role permissions updated successfully." : "No change detected.", settings };
  });
}
