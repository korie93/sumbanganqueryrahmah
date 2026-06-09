import type { MutableRefObject } from "react";
import type { ToastFunction } from "@/hooks/use-toast";

export type ToastFn = ToastFunction;

export type UseSettingsSystemSettingsArgs = {
  isMountedRef: MutableRefObject<boolean>;
  toast: ToastFn;
};
