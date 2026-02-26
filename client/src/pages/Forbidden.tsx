import { ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function Forbidden() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background p-6">
      <div className="mx-auto max-w-3xl">
        <Card className="glass-wrapper border-red-500/35">
          <CardContent className="p-10 text-center">
            <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-red-500" />
            <h1 className="text-3xl font-semibold text-foreground">403 Forbidden</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              You do not have permission to access this section.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

