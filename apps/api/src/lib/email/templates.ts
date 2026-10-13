import { html } from "hono/html";
import type { EmailKind, EmailMessage } from "./sender";

/**
 * Auth emails. They carry no user-entered text except email addresses, so a display name can't be
 * used to slip a phishing line into a message we sign. Interpolations go through hono's `html`,
 * which escapes them.
 *
 * Links point at the web app with the token in the URL fragment (`#token=`). Fragments aren't sent
 * to servers, so the token stays out of access logs and Referer headers, and nothing happens until
 * the person clicks the button on that page: a mail scanner that opens the link changes nothing.
 */

interface Content {
  subject: string;
  intro: string;
  action?: { label: string; url: string };
  outro: string;
}

function render(kind: EmailKind, to: string, { subject, intro, action, outro }: Content) {
  const text = [intro, action ? `${action.label}: ${action.url}` : null, outro]
    .filter(Boolean)
    .join("\n\n");
  const body = html`<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f6f6f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1c1a">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px">
        <tr><td style="font-size:18px;font-weight:600;padding-bottom:16px">everycent</td></tr>
        <tr><td style="font-size:15px;line-height:1.5;padding-bottom:24px">${intro}</td></tr>
        ${
          action
            ? html`<tr><td style="padding-bottom:24px"><a href="${action.url}" style="display:inline-block;background:#1c1c1a;color:#ffffff;text-decoration:none;font-size:15px;font-weight:500;padding:12px 20px;border-radius:8px">${action.label}</a></td></tr>
        <tr><td style="font-size:13px;line-height:1.5;color:#6b6b66;padding-bottom:24px;word-break:break-all">Or paste this link into your browser:<br />${action.url}</td></tr>`
            : ""
        }
        <tr><td style="font-size:13px;line-height:1.5;color:#6b6b66">${outro}</td></tr>
      </table>
    </td></tr></table>
  </body>
</html>`;
  return { kind, to, subject, text, html: String(body) } satisfies EmailMessage;
}

const link = (webOrigin: string, path: string, params: Record<string, string>) =>
  `${webOrigin}${path}#${new URLSearchParams(params).toString()}`;

const IGNORE = "If you didn't ask for this, you can ignore this email.";

export const emails = {
  verifyEmail: (to: string, webOrigin: string, token: string) =>
    render("verify-email", to, {
      subject: "Confirm your email address",
      intro: "Confirm this email address to finish setting up your everycent account.",
      action: { label: "Confirm email", url: link(webOrigin, "/verify-email", { token }) },
      outro: `The link expires in 1 hour. ${IGNORE}`,
    }),

  /** To the current address: approve moving the account to `newEmail`. */
  changeEmailConfirm: (to: string, newEmail: string, webOrigin: string, token: string) =>
    render("change-email-confirm", to, {
      subject: "Approve your email change",
      intro: `Someone signed in to your everycent account asked to change its email address to ${newEmail}. Approve the change and we'll send a confirmation link to that address.`,
      action: {
        label: "Approve change",
        url: link(webOrigin, "/verify-email", { token, step: "approve" }),
      },
      outro:
        "The link expires in 1 hour. If this wasn't you, don't approve it: change your password, and sign out your other devices in your account settings.",
    }),

  /** To the new address, after the old one approved. */
  changeEmailVerify: (to: string, webOrigin: string, token: string) =>
    render("change-email-verify", to, {
      subject: "Confirm your new email address",
      intro:
        "Confirm this address to make it the email for your everycent account. Open the link in a browser where you're signed in to everycent.",
      action: {
        label: "Confirm new email",
        url: link(webOrigin, "/verify-email", { token, step: "change" }),
      },
      outro: `The link expires in 1 hour. ${IGNORE}`,
    }),

  resetPassword: (to: string, webOrigin: string, token: string) =>
    render("reset-password", to, {
      subject: "Reset your password",
      intro: "Someone asked to reset the password for your everycent account.",
      action: {
        label: "Choose a new password",
        url: link(webOrigin, "/reset-password", { token }),
      },
      outro: `The link expires in 1 hour and works once. ${IGNORE} Your password won't change.`,
    }),

  /** Someone tried to sign up with an address that already has an account. */
  existingAccount: (to: string, webOrigin: string) =>
    render("existing-account", to, {
      subject: "You already have an everycent account",
      intro:
        "Someone tried to create an everycent account with this email address, but it already has one. If that was you, sign in instead, or reset your password if you've forgotten it.",
      action: { label: "Sign in", url: `${webOrigin}/sign-in` },
      outro: IGNORE,
    }),

  passwordChanged: (to: string, webOrigin: string) =>
    render("password-changed", to, {
      subject: "Your password was changed",
      intro: "The password for your everycent account was just changed.",
      action: { label: "Reset your password", url: `${webOrigin}/forgot-password` },
      outro: "If this was you, there's nothing to do. If it wasn't, reset your password now.",
    }),
};
