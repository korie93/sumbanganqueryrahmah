import { lazyWithPreload } from "@/lib/lazy-with-preload";

export const AuthenticatedAppEntry = lazyWithPreload(() => import("@/app/AuthenticatedAppEntry"));
