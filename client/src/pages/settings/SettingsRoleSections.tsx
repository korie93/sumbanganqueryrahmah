import { ShieldCheck, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SettingItem } from "@/pages/settings/types";

interface SettingsRoleSectionsProps {
  renderSettingCard: (setting: SettingItem) => JSX.Element;
  roleSections: {
    admin: SettingItem[];
    user: SettingItem[];
    other: SettingItem[];
  } | null;
}

export function SettingsRoleSections({
  renderSettingCard,
  roleSections,
}: SettingsRoleSectionsProps) {
  if (!roleSections) {
    return null;
  }

  return (
    <>
      <div className="space-y-4">
        <Card className="border-border/60 bg-background/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Admin Tab Permissions
            </CardTitle>
            <p className="text-xs text-muted-foreground">Control which tabs admin users can access.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {roleSections.admin.map(renderSettingCard)}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-background/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              User Tab Permissions
            </CardTitle>
            <p className="text-xs text-muted-foreground">Control which tabs standard users can access.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {roleSections.user.map(renderSettingCard)}
          </CardContent>
        </Card>

        {roleSections.other.length > 0 ? (
          <Card className="border-border/60 bg-background/70">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Other Permission Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {roleSections.other.map(renderSettingCard)}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
