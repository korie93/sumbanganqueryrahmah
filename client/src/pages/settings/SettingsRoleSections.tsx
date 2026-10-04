import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  CircleMinus,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RolePermissionImpact, SettingItem } from "@/pages/settings/types";

type RolePermissionId = "admin" | "manager" | "user";

type RolePermissionSection = {
  id: RolePermissionId;
  title: string;
  shortLabel: string;
  description: string;
  icon: typeof ShieldCheck;
  settings: SettingItem[];
};

type RoleComparisonRow = {
  id: string;
  label: string;
  states: Record<RolePermissionId, boolean | null>;
};

type RolePermissionGroup = {
  id: string;
  label: string;
  description: string;
  settings: SettingItem[];
};

interface SettingsRoleSectionsProps {
  renderSettingCard: (setting: SettingItem) => JSX.Element;
  rolePermissionImpacts: RolePermissionImpact[];
  roleSections: {
    admin: SettingItem[];
    manager: SettingItem[];
    user: SettingItem[];
    other: SettingItem[];
  } | null;
}

const roleOrder: RolePermissionId[] = ["manager", "admin", "user"];
const permissionGroupOrder = [
  "dashboard",
  "collection",
  "monitoring",
  "backup",
  "settings",
  "other",
] as const;

const permissionGroupMeta: Record<
  (typeof permissionGroupOrder)[number],
  { label: string; description: string }
> = {
  dashboard: {
    label: "Dashboard & Home",
    description: "Landing, dashboard, and insight pages that orient daily work.",
  },
  collection: {
    label: "Collection",
    description: "Import, saved data, viewer, search, and collection report access.",
  },
  monitoring: {
    label: "Monitoring & Audit",
    description: "System monitor, activity, and audit visibility controls.",
  },
  backup: {
    label: "Backup & Restore",
    description: "Protected recovery tools that should stay tightly controlled.",
  },
  settings: {
    label: "Settings",
    description: "Administrative settings and privileged configuration access.",
  },
  other: {
    label: "Other",
    description: "Permission controls that do not belong to a standard module group.",
  },
};

function isEnabledSetting(setting: SettingItem): boolean {
  return String(setting.value).trim().toLowerCase() === "true";
}

function parseRoleSettingKey(key: string): { role: RolePermissionId; suffix: string } | null {
  const match = key.match(/^tab_(admin|manager|user)_(.+)_enabled$/);
  if (!match) return null;
  return {
    role: match[1] as RolePermissionId,
    suffix: match[2],
  };
}

function getPermissionModuleLabel(setting: SettingItem, suffix: string): string {
  const label = setting.label.replace(/^(Admin|Manager|User) Tab:\s*/i, "").trim();
  if (label) return label;
  return suffix.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getPermissionGroupId(setting: SettingItem): (typeof permissionGroupOrder)[number] {
  const parsed = parseRoleSettingKey(setting.key);
  const suffix = parsed?.suffix ?? setting.key;

  if (suffix === "home" || suffix === "dashboard" || suffix === "analysis") {
    return "dashboard";
  }
  if (
    suffix === "import"
    || suffix === "saved"
    || suffix === "viewer"
    || suffix === "general_search"
    || suffix === "collection_report"
  ) {
    return "collection";
  }
  if (
    suffix === "monitor"
    || suffix === "activity"
    || suffix === "audit_logs"
    || setting.key === "canViewSystemPerformance"
  ) {
    return "monitoring";
  }
  if (suffix === "backup") {
    return "backup";
  }
  if (suffix === "settings") {
    return "settings";
  }

  return "other";
}

function matchesPermissionSearch(setting: SettingItem, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  return [
    setting.key,
    setting.label,
    setting.description ?? "",
  ].some((value) => value.toLowerCase().includes(query));
}

function buildRoleSections(roleSections: NonNullable<SettingsRoleSectionsProps["roleSections"]>) {
  const sections: Record<RolePermissionId, RolePermissionSection> = {
    manager: {
      id: "manager",
      title: "Manager Permissions",
      shortLabel: "Manager",
      description: "Read-focused operational access without superuser powers.",
      icon: BriefcaseBusiness,
      settings: roleSections.manager,
    },
    admin: {
      id: "admin",
      title: "Admin Permissions",
      shortLabel: "Admin",
      description: "Administration access controlled by explicit tab permissions.",
      icon: ShieldCheck,
      settings: roleSections.admin,
    },
    user: {
      id: "user",
      title: "User Permissions",
      shortLabel: "User",
      description: "Standard user access for day-to-day operational screens.",
      icon: UserRound,
      settings: roleSections.user,
    },
  };

  return roleOrder.map((roleId) => sections[roleId]);
}

function getEnabledCount(settings: SettingItem[]) {
  return settings.filter(isEnabledSetting).length;
}

function buildRoleComparisonRows(
  sections: RolePermissionSection[],
  rawQuery: string,
): RoleComparisonRow[] {
  const rows = new Map<string, RoleComparisonRow>();

  for (const section of sections) {
    for (const setting of section.settings) {
      const parsed = parseRoleSettingKey(setting.key);
      if (!parsed) continue;
      if (!matchesPermissionSearch(setting, rawQuery)) continue;

      const existing = rows.get(parsed.suffix) ?? {
        id: parsed.suffix,
        label: getPermissionModuleLabel(setting, parsed.suffix),
        states: {
          admin: null,
          manager: null,
          user: null,
        },
      };

      existing.states[parsed.role] = isEnabledSetting(setting);
      rows.set(parsed.suffix, existing);
    }
  }

  return Array.from(rows.values()).sort((left, right) => left.label.localeCompare(right.label));
}

function buildPermissionGroups(settings: SettingItem[]): RolePermissionGroup[] {
  const groups = new Map<(typeof permissionGroupOrder)[number], RolePermissionGroup>();

  for (const setting of settings) {
    const groupId = getPermissionGroupId(setting);
    const existing = groups.get(groupId) ?? {
      id: groupId,
      label: permissionGroupMeta[groupId].label,
      description: permissionGroupMeta[groupId].description,
      settings: [],
    };

    existing.settings.push(setting);
    groups.set(groupId, existing);
  }

  return permissionGroupOrder
    .map((groupId) => groups.get(groupId))
    .filter((group): group is RolePermissionGroup => group !== undefined);
}

function getEmptyPermissionMessage(section: RolePermissionSection, rawQuery: string) {
  if (section.settings.length === 0 && rawQuery.trim().length === 0) {
    return `${section.shortLabel} permission settings are not installed yet. Run the latest database migration, then refresh this page.`;
  }

  return `No permissions match this search for ${section.shortLabel}.`;
}

export function SettingsRoleSections({
  renderSettingCard,
  rolePermissionImpacts,
  roleSections,
}: SettingsRoleSectionsProps) {
  const [activeRole, setActiveRole] = useState<RolePermissionId>("manager");
  const [searchQuery, setSearchQuery] = useState("");

  const sections = useMemo(
    () => (roleSections ? buildRoleSections(roleSections) : []),
    [roleSections],
  );
  const activeSection = sections.find((section) => section.id === activeRole) ?? sections[0];
  const filteredSettings = useMemo(
    () => activeSection?.settings.filter((setting) => matchesPermissionSearch(setting, searchQuery)) ?? [],
    [activeSection, searchQuery],
  );
  const otherSettings = useMemo(
    () => roleSections?.other.filter((setting) => matchesPermissionSearch(setting, searchQuery)) ?? [],
    [roleSections?.other, searchQuery],
  );
  const totalPermissions = sections.reduce((total, section) => total + section.settings.length, 0)
    + (roleSections?.other.length ?? 0);
  const visiblePermissions = filteredSettings.length + otherSettings.length;
  const comparisonRows = useMemo(
    () => buildRoleComparisonRows(sections, searchQuery),
    [searchQuery, sections],
  );
  const visibleImpacts = rolePermissionImpacts.slice(0, 4);
  const grantImpactCount = rolePermissionImpacts.filter((impact) => impact.action === "grant").length;
  const blockImpactCount = rolePermissionImpacts.filter((impact) => impact.action === "block").length;
  const sensitiveImpactCount = rolePermissionImpacts.filter((impact) => impact.severity === "sensitive").length;

  if (!roleSections || !activeSection) {
    return null;
  }

  const enabledCount = getEnabledCount(activeSection.settings);
  const blockedCount = activeSection.settings.length - enabledCount;

  return (
    <section className="min-w-0 space-y-4" aria-label="Role and permission manager">
      <div className="sticky top-3 z-20 space-y-3 border-b border-border bg-background py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-1">
            <h2 className="text-sm font-medium text-foreground">Role permission workspace</h2>
            <p className="text-xs leading-5 text-muted-foreground">
              Select a role, search a module, then save changes using the fixed save bar below.
            </p>
          </div>
          <label htmlFor="role-permission-search" className="relative block w-full lg:max-w-sm">
            <span className="sr-only">Search permission or module</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="role-permission-search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search module, action, or key"
              className="h-11 pl-9 md:h-9"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" role="group" aria-label="Permission counts">
          <span>{visiblePermissions}/{totalPermissions} shown</span>
          <span>{enabledCount} enabled</span>
          <span>{blockedCount} blocked</span>
          <span className="ml-auto hidden sm:inline">Compact role view</span>
        </div>
      </div>

      {rolePermissionImpacts.length > 0 ? (
        <section className="border-l-2 border-warning bg-warning/5 p-3 sm:p-4" aria-label="Pending permission impact">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
                  <p className="text-sm font-semibold text-foreground">Pending permission impact</p>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  Review role access changes before saving so grants and blocks are intentional.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="rounded-full">
                  {grantImpactCount} grant{grantImpactCount === 1 ? "" : "s"}
                </Badge>
                <Badge variant="outline" className="rounded-full">
                  {blockImpactCount} block{blockImpactCount === 1 ? "" : "s"}
                </Badge>
                {sensitiveImpactCount > 0 ? (
                  <Badge variant="destructive" className="rounded-full">
                    {sensitiveImpactCount} sensitive
                  </Badge>
                ) : null}
              </div>
            </div>

            <ul className="mt-3 divide-y divide-border" aria-label="Pending role permission changes">
              {visibleImpacts.map((impact) => (
                <li
                  key={impact.key}
                  className="flex flex-col gap-1 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="min-w-0 font-medium text-foreground">
                    {impact.role}: {impact.moduleLabel}
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge
                      variant={impact.action === "grant" ? "secondary" : "outline"}
                      className="rounded-full"
                    >
                      {impact.action === "grant" ? "Will allow access" : "Will block access"}
                    </Badge>
                    {impact.severity === "sensitive" ? (
                      <Badge variant="destructive" className="rounded-full">
                        Sensitive
                      </Badge>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
            {rolePermissionImpacts.length > visibleImpacts.length ? (
              <p className="mt-2 text-xs text-muted-foreground">
                +{rolePermissionImpacts.length - visibleImpacts.length} more pending permission change
                {rolePermissionImpacts.length - visibleImpacts.length === 1 ? "" : "s"}.
              </p>
            ) : null}
        </section>
      ) : null}

      <Tabs value={activeRole} onValueChange={(value) => setActiveRole(value as RolePermissionId)} className="space-y-3">
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-md p-1" aria-label="Permission roles">
          {sections.map((section) => {
            const RoleIcon = section.icon;
            const sectionEnabledCount = getEnabledCount(section.settings);
            return (
              <TabsTrigger
                key={section.id}
                value={section.id}
                className="min-h-11 gap-1.5 px-2 py-2 text-xs md:min-h-9 sm:text-sm"
              >
                <RoleIcon className="hidden h-4 w-4 sm:block" aria-hidden="true" />
                <span>{section.shortLabel}</span>
                <span className="text-xs font-normal tabular-nums text-muted-foreground">
                  {sectionEnabledCount}/{section.settings.length}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <details className="group min-w-0 rounded-lg border border-border bg-card">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
            <span>Role Comparison</span>
            <ChevronDown className="h-4 w-4 shrink-0 group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="space-y-3 border-t border-border px-3 py-3">
            <p className="text-xs leading-5 text-muted-foreground">
              Compare module access across Manager, Admin, and User before changing any toggle.
            </p>
            {comparisonRows.length > 0 ? (
              <div className="min-w-0 overflow-x-auto">
                <table className="w-full table-fixed text-left text-xs sm:text-sm">
                  <caption className="sr-only">
                    Role permission comparison by module
                  </caption>
                  <thead className="border-b border-border text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="w-1/3 py-2 pr-2 font-medium">Module</th>
                      {roleOrder.map((roleId) => (
                        <th key={roleId} scope="col" className="px-1 py-2 text-center font-medium sm:px-3">
                          {roleId.charAt(0).toUpperCase() + roleId.slice(1)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {comparisonRows.map((row) => (
                      <tr key={row.id}>
                        <th scope="row" className="break-words py-3 pr-2 font-medium text-foreground">
                          {row.label}
                        </th>
                        {roleOrder.map((roleId) => {
                          const allowed = row.states[roleId];
                          return (
                            <td key={roleId} className="px-1 py-3 text-center sm:px-3">
                              {allowed === null ? (
                                <span className="inline-flex items-center gap-1 text-muted-foreground">
                                  <CircleMinus className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" />
                                  Not set
                                </span>
                              ) : allowed ? (
                                <span className="inline-flex items-center gap-1 text-success">
                                  <CheckCircle2 className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" />
                                  Allowed
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-muted-foreground">
                                  <CircleMinus className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" />
                                  Blocked
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                No role comparison rows match this search.
              </div>
            )}
          </div>
        </details>

        {sections.map((section) => {
          const SectionIcon = section.icon;
          const sectionFilteredSettings =
            section.id === activeRole
              ? filteredSettings
              : section.settings.filter((setting) => matchesPermissionSearch(setting, searchQuery));

          return (
            <TabsContent key={section.id} value={section.id} className="space-y-4">
                <header>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="flex items-center gap-2 text-base font-semibold">
                        <SectionIcon className="h-4 w-4 text-primary" aria-hidden="true" />
                        {section.title}
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {section.description}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        {getEnabledCount(section.settings)} enabled
                      </span>
                      <span>
                        {section.settings.length - getEnabledCount(section.settings)} blocked
                      </span>
                    </div>
                  </div>
                </header>
                <div className="space-y-5">
                  {sectionFilteredSettings.length > 0 ? (
                    buildPermissionGroups(sectionFilteredSettings).map((group) => (
                      <section
                        key={group.id}
                        className="min-w-0 space-y-1"
                        aria-label={`${group.label} permission group`}
                      >
                        <div className="flex flex-col gap-2 border-b border-border pb-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 space-y-1">
                            <h4 className="text-sm font-semibold text-foreground">{group.label}</h4>
                            <p className="text-xs leading-5 text-muted-foreground">
                              {group.description}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>
                              {group.settings.length} item{group.settings.length === 1 ? "" : "s"}
                            </span>
                            <span>
                              {getEnabledCount(group.settings)} enabled
                            </span>
                          </div>
                        </div>
                        <div className="space-y-0">
                          {group.settings.map(renderSettingCard)}
                        </div>
                      </section>
                    ))
                  ) : (
                    <div className="rounded-lg border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                      {getEmptyPermissionMessage(section, searchQuery)}
                    </div>
                  )}
                </div>
            </TabsContent>
          );
        })}
      </Tabs>

      {otherSettings.length > 0 ? (
        <section className="space-y-3 border-t border-border pt-4" aria-label="Other Permission Settings">
          <header className="space-y-1">
            <h3 className="text-base font-semibold">Other Permission Settings</h3>
            <p className="text-xs text-muted-foreground">
              Permission controls that are not tied to a single role tab.
            </p>
          </header>
          <div className="space-y-0">
            {otherSettings.map(renderSettingCard)}
          </div>
        </section>
      ) : null}
    </section>
  );
}
