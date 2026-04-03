import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
} from "react";

function joinClassNames(...parts: Array<string | undefined | false | null>) {
  return parts.filter(Boolean).join(" ");
}

type PublicAuthButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
};

const PRIMARY_BUTTON_CLASS_NAME =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70 disabled:cursor-not-allowed disabled:opacity-70";

const GHOST_BUTTON_CLASS_NAME =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm text-slate-200 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:cursor-not-allowed disabled:opacity-70";

export function PublicAuthButton({
  className,
  type = "button",
  variant = "primary",
  ...props
}: PublicAuthButtonProps) {
  return (
    <button
      type={type}
      className={joinClassNames(
        variant === "primary" ? PRIMARY_BUTTON_CLASS_NAME : GHOST_BUTTON_CLASS_NAME,
        className,
      )}
      {...props}
    />
  );
}

const INPUT_CLASS_NAME =
  "w-full rounded-xl border border-white/10 bg-white/95 px-4 py-3 text-slate-950 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/70 disabled:cursor-not-allowed disabled:opacity-70";

export const PublicAuthInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function PublicAuthInput({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={joinClassNames(INPUT_CLASS_NAME, className)}
        {...props}
      />
    );
  },
);
