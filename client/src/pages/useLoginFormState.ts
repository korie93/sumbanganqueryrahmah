import { useCallback, useState } from "react";

/**
 * Owns login form field values and validation messages.
 *
 * @returns Mutable form state plus focused helpers for clearing request
 * feedback before a new password or 2FA submission starts.
 */
export function useLoginFormState() {
  const [username, setUsername] = useState("");
  const [password, setPasswordValue] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const clearRequestFeedback = useCallback(() => {
    setError("");
    setNotice("");
    setUsernameError("");
    setPasswordError("");
  }, []);

  const setPassword = useCallback((value: string) => {
    setPasswordValue(value);
    setPasswordError("");
  }, []);

  const toggleShowPassword = useCallback(() => {
    setShowPassword((current) => !current);
  }, []);

  return {
    username,
    password,
    error,
    notice,
    usernameError,
    passwordError,
    showPassword,
    setUsername,
    setPassword,
    setError,
    setNotice,
    setUsernameError,
    setPasswordError,
    clearRequestFeedback,
    toggleShowPassword,
  };
}
