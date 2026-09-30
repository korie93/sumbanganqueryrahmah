import { forwardRef, useState, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
};

/** One real autofill/paste-capable field, six decorative slots. Native editing,
 * arrow keys and Backspace keep their familiar, screen-reader-safe behavior. */
export const AuthOtpInput = forwardRef<HTMLInputElement, Props>(function AuthOtpInput(
  { value, onValueChange, onFocus, onBlur, ...props }, ref,
) {
  const [focused, setFocused] = useState(false);
  const [position, setPosition] = useState(0);
  return (
    <div className="auth-v17-otp" data-invalid={props["aria-invalid"] || undefined}>
      <div className="auth-v17-otp__slots" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => <span key={index} className="auth-v17-otp__slot"
          data-active={focused && index === Math.min(position, 5) ? "true" : undefined}>{value[index] || ""}</span>)}
      </div>
      <input {...props} ref={ref} className="auth-v17-otp__input" type="text" inputMode="numeric"
        autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={value}
        onChange={(event) => onValueChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
        onSelect={(event) => setPosition(event.currentTarget.selectionStart ?? value.length)}
        onFocus={(event) => { setFocused(true); setPosition(event.currentTarget.selectionStart ?? value.length); onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); onBlur?.(event); }} />
    </div>
  );
});
