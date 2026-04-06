import type { MutableRefObject } from "react";

export type ToastFn = (payload: {
  title: string;
  description: string;
  variant?: "default" | "destructive";
}) => void;

export type UseSettingsSystemSettingsArgs = {
  isMountedRef: MutableRefObject<boolean>;
  toast: ToastFn;
};
