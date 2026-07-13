import type { Config } from "tailwindcss";
import baseConfig from "./tailwind.config";

// The public entry already ships utilities for these logged-out routes. Excluding
// them here keeps the authenticated CSS incremental while preserving the shared
// components, maintenance route, and forced password-change route used after login.
const publicOnlyContent = [
  "./client/src/pages/Landing*.tsx",
  "./client/src/pages/Login.tsx",
  "./client/src/pages/LoginParts.tsx",
  "./client/src/pages/ForgotPassword.tsx",
  "./client/src/pages/ActivateAccount.tsx",
  "./client/src/pages/ActivateAccountParts.tsx",
  "./client/src/pages/ResetPassword.tsx",
  "./client/src/pages/Banned.tsx",
  "./client/src/pages/NotFound.tsx",
] as const;

export default {
  ...baseConfig,
  content: [
    ...baseConfig.content,
    ...publicOnlyContent.map((pattern) => `!${pattern}`),
  ],
} satisfies Config;
