import { useState } from "react";
import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AIJumpToLatestButtonProps = {
  controlsId: string;
  visible: boolean;
  onJump: () => void;
  className?: string | undefined;
};

/** Returns to the newest message without removing a keyboard-focused control. */
export function AIJumpToLatestButton({ controlsId, visible, onJump, className }: AIJumpToLatestButtonProps) {
  const [focused, setFocused] = useState(false);
  // A keyboard-activated button stays mounted until focus leaves it.
  if (!visible && !focused) return null;
  return (
    <div className={cn("flex justify-end", className)}>
      <Button type="button" variant="outline" size="sm" className="min-h-11 gap-2 md:min-h-9"
        aria-controls={controlsId} onClick={onJump}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
        <ArrowDown className="h-4 w-4" aria-hidden="true" />
        Ke mesej terkini
      </Button>
    </div>
  );
}
