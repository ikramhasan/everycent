import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? window.location.origin,
  // The sign-in page asks for the code itself (`twoFactorRedirect` in sign-in's result).
  plugins: [twoFactorClient()],
});
