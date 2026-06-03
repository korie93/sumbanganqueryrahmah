import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  useId,
} from "react";
import "./PublicAuthControls.css";

function joinClassNames(...parts: Array<string | undefined | false | null>) {
  return parts.filter(Boolean).join(" ");
}

type PublicAuthButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
};

/**
 * Renders the shared public auth button component used across SQR screens.
 */
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
        "public-auth-button",
        variant === "primary" ? "public-auth-button-primary" : "public-auth-button-ghost",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Renders the shared public auth input component used across SQR screens.
 */
export const PublicAuthInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function PublicAuthInput({ className, ...props }, ref) {
    const generatedId = useId();
    const fallbackId = !props.id && !props.name ? generatedId : undefined;

    return (
      <input
        ref={ref}
        id={props.id ?? fallbackId}
        className={joinClassNames("public-auth-input", className)}
        {...props}
      />
    );
  },
);
