import { useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SettingItem } from "@/pages/settings/types";

type RolePermissionId = "admin" | "manager" | "user";

type RolePermissionSection = {
  id: RolePermissionId;
  title: string;
  shortLabel: string;
  description: string;
  icon: typeof ShieldCheck;
  settings: SettingItem[];
};

interface SettingsRoleSectionsProps {
  renderSettingCard: (setting: SettingItem) => JSX.Element;
  roleSections: {
    admin: SettingItem[];
    manager: SettingItem[];
    user: SettingItem[];
    other: SettingItem[];
  } | null;
}

const roleOrder: RolePermissionId[] = ["manager", "admin", "user"];

function isEnabledSetting(setting: SettingItem): boolean {
  return String(setting.value).trim().toLowerCase() === "true";
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

export function SettingsRoleSections({
  renderSettingCard,
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

  if (!roleSections || !activeSection) {
    return null;
  }

  const enabledCount = getEnabledCount(activeSection.settings);
  const blockedCount = activeSection.settings.length - enabledCount;

  return (
    <section className="space-y-4" aria-label="Role and permission manager">
      <Card className="sticky top-3 z-20 border-border/70 bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="rounded-full">
                  {visiblePermissions}/{totalPermissions} shown
                </Badge>
                <Badge variant="outline" className="rounded-full">
                  {enabledCount} enabled
                </Badge>
                <Badge variant="outline" className="rounded-full">
                  {blockedCount} blocked
                </Badge>
              </div>
              <p className="text-sm font-medium text-foreground">Role permission workspace</p>
              <p className="text-xs leading-5 text-muted-foreground">
                Select a role, search a module, then save changes using the fixed save bar below.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_auto] xl:min-w-[560px]">
              <label className="relative block">
                <span className="sr-only">Search permission or module</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search module, action, or key"
                  className="h-10 pl-9"
                />
              </label>
              <div className="hidden items-center gap-2 rounded-md border border-border/70 px-3 text-xs text-muted-foreground sm:flex">
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                Compact role view
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeRole} onValueChange={(value) => setActiveRole(value as RolePermissionId)}>
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-xl p-1">
          {sections.map((section) => {
            const RoleIcon = section.icon;
            const sectionEnabledCount = getEnabledCount(section.settings);
            return (
              <TabsTrigger
                key={section.id}
                value={section.id}
                className="min-h-12 flex-col gap-1 px-2 py-2 text-xs sm:flex-row sm:justify-start sm:text-sm"
              >
                <RoleIcon className="h-4 w-4" aria-hidden="true" />
                <span>{section.shortLabel}</span>
                <Badge variant="secondary" className="rounded-full px-2 text-2xs">
                  {sectionEnabledCount}/{section.settings.length}
                </Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {sections.map((section) => {
          const SectionIcon = section.icon;
          const sectionFilteredSettings =
            section.id === activeRole
              ? filteredSettings
              : section.settings.filter((setting) => matchesPermissionSearch(setting, searchQuery));

          return (
            <TabsContent key={section.id} value={section.id} className="space-y-4">
              <Card className="border-border/60 bg-background/70">
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <SectionIcon className="h-4 w-4 text-primary" aria-hidden="true" />
                        {section.title}
                      </CardTitle>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {section.description}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="rounded-full">
                        {getEnabledCount(section.settings)} enabled
                      </Badge>
                      <Badge variant="secondary" className="rounded-full">
                        {section.settings.length - getEnabledCount(section.settings)} blocked
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {sectionFilteredSettings.length > 0 ? (
                    sectionFilteredSettings.map(renderSettingCard)
                  ) : (
                    <div className="rounded-lg border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                      No permissions match this search for {section.shortLabel}.
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>

      {otherSettings.length > 0 ? (
        <Card className="border-border/60 bg-background/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Other Permission Settings</CardTitle>
            <p className="text-xs text-muted-foreground">
              Permission controls that are not tied to a single role tab.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {otherSettings.map(renderSettingCard)}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
