import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
} from "react";
import "./PublicAuthControls.css";

function joinClassNames(...parts: Array<string | undefined | false | null>) {
  return parts.filter(Boolean).join(" ");
}

type PublicAuthButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
};

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

export const PublicAuthInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function PublicAuthInput({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={joinClassNames("public-auth-input", className)}
        {...props}
      />
    );
  },
);
