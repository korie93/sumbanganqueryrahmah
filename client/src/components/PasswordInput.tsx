import { forwardRef, useCallback, useEffect, useId, useRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getAriaPressedProps } from "@/lib/aria-state-props";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  visibilityLabel: string;
  variant?: "default" | "public-auth";
};

/** Password field with an independent, accessible show/hide control; masked by default. */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({
    id,
    className,
    disabled,
    value,
    visibilityLabel,
    variant = "default",
    ...props
  }, ref) {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const [showPassword, setShowPassword] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const selectionRef = useRef<{ start: number; end: number; direction: "forward" | "backward" | "none" } | null>(null);
    const setInputRef = useCallback((input: HTMLInputElement | null) => {
      inputRef.current = input;
      if (typeof ref === "function") ref(input);
      else if (ref) ref.current = input;
    }, [ref]);
    const visible = showPassword && !disabled;
    const InputComponent = variant === "public-auth" ? "input" : Input;

    // Clearing/submitting a form must not reveal the next password entered here.
    useEffect(() => {
      if (disabled || value === "") setShowPassword(false);
    }, [disabled, value]);

    useEffect(() => {
      const selection = selectionRef.current;
      selectionRef.current = null;
      if (!selection || !inputRef.current || disabled) return;
      const input = inputRef.current;
      const restoreSelection = () => {
        if (document.activeElement === input && !input.disabled) {
          input.setSelectionRange(selection.start, selection.end, selection.direction);
        }
      };
      input.focus({ preventScroll: true });
      restoreSelection();
      // Type changes can reset selection after the click commit. Restore before
      // the next paint, without stealing focus if the user has already moved on.
      const frame = requestAnimationFrame(restoreSelection);
      return () => cancelAnimationFrame(frame);
    }, [visible, disabled]);

    return (
      <div className="relative min-w-0 w-full">
        <InputComponent
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          {...props}
          ref={setInputRef}
          id={inputId}
          type={visible ? "text" : "password"}
          value={value}
          disabled={disabled}
          className={cn(
            variant === "public-auth"
              ? "public-auth-input public-auth-password-input"
              : "pr-28",
            className,
          )}
        />
        <button
          type="button"
          aria-controls={inputId}
          aria-label={`${visible ? "Sembunyikan" : "Lihat"} ${visibilityLabel}`}
          {...getAriaPressedProps(visible)}
          disabled={disabled}
          onPointerDown={(event) => {
            const input = inputRef.current;
            selectionRef.current = null;
            if (event.button !== 0 || !input || document.activeElement !== input) return;
            selectionRef.current = {
              start: input.selectionStart ?? 0,
              end: input.selectionEnd ?? 0,
              direction: input.selectionDirection ?? "none",
            };
            // A pointer toggle should not dismiss the keyboard or move the caret.
            // Keyboard users keep normal Tab/Enter/Space button focus instead.
            event.preventDefault();
          }}
          onClick={() => setShowPassword((current) => !current)}
          className={cn(
            "absolute inset-y-0 right-0 inline-flex w-28 items-center justify-center gap-1 rounded-r-md px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-50",
            variant === "public-auth"
              ? "public-auth-password-toggle"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring",
          )}
        >
          {visible
            ? <EyeOff className="h-4 w-4 shrink-0" aria-hidden="true" focusable="false" />
            : <Eye className="h-4 w-4 shrink-0" aria-hidden="true" focusable="false" />}
          <span>{visible ? "Sembunyi" : "Lihat"}</span>
        </button>
      </div>
    );
  },
);
