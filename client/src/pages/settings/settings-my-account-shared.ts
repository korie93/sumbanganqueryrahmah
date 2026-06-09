import type { MutableRefObject } from "react";
import type { ToastFunction } from "@/hooks/use-toast";
import type { CurrentUser } from "@/pages/settings/types";

export type ToastFn = ToastFunction;

export type UseSettingsMyAccountArgs = {
  isMountedRef: MutableRefObject<boolean>;
  toast: ToastFn;
};

export type SyncCurrentUserFn = (nextUser: CurrentUser) => void;
