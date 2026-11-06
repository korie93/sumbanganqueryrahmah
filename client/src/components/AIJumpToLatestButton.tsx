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
      <Button type="button" variant="outline" size="sm" className="h-11 w-11 min-h-11 p-0 md:h-9 md:w-9 md:min-h-9"
        aria-label="Ke mesej terkini" title="Ke mesej terkini" aria-controls={controlsId} onClick={onJump}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
        <ArrowDown className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
