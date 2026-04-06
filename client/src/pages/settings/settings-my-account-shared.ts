import type { MutableRefObject } from "react";
import type { CurrentUser } from "@/pages/settings/types";

export type ToastFn = (payload: {
  title: string;
  description: string;
  variant?: "default" | "destructive";
}) => void;

export type UseSettingsMyAccountArgs = {
  isMountedRef: MutableRefObject<boolean>;
  toast: ToastFn;
};

export type SyncCurrentUserFn = (nextUser: CurrentUser) => void;
