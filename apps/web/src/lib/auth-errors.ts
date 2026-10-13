/** An error from the Better Auth client (`{ error }` from authClient calls). */
export interface AuthClientError {
  code?: string;
  message?: string;
  status: number;
}

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "That email and password don't match.",
  EMAIL_NOT_VERIFIED:
    "Confirm your email address first. We've sent a new confirmation link to your inbox.",
  TOKEN_EXPIRED: "This link has expired. Links work for 1 hour: ask for a new one.",
  INVALID_TOKEN: "This link isn't valid. Check that you opened the whole link from the email.",
  USER_NOT_FOUND: "This link isn't valid any more.",
  INVALID_USER: "This link belongs to a different account. Sign out and open it again.",
  PASSWORD_TOO_SHORT: "Use at least 8 characters.",
  PASSWORD_TOO_LONG: "Use at most 128 characters.",
  PASSWORD_COMPROMISED:
    "That password has appeared in a data breach. Choose one you haven't used anywhere else.",
  INVALID_PASSWORD: "That password isn't right.",
};

/** A sentence to show for a Better Auth client error. */
export function authErrorMessage(error: AuthClientError, fallback: string): string {
  if (error.status === 429) return "Too many attempts. Wait a minute and try again.";
  return (error.code && MESSAGES[error.code]) || fallback;
}
