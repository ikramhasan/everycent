import { Button } from "@everycent/ui/components/button";
import { Field, FieldError, FieldLabel } from "@everycent/ui/components/field";
import { Input } from "@everycent/ui/components/input";
import { Spinner } from "@everycent/ui/components/spinner";
import { createFileRoute, Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AuthCard } from "@/components/auth-card";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    setPending(true);
    setError(null);
    const { error } = await authClient.requestPasswordReset({ email });
    setPending(false);
    if (error) setError(authErrorMessage(error, "Couldn't send the email. Try again."));
    else setSentTo(email);
  }

  const footer = (
    <Link to="/sign-in" className="text-foreground underline underline-offset-4">
      Back to sign in
    </Link>
  );

  if (sentTo) {
    // The same answer whether or not the address has an account.
    return (
      <AuthCard
        title="Check your inbox"
        description="If an account uses that address, we've sent it a link to reset the password."
        footer={footer}
      >
        <p className="text-muted-foreground text-sm">
          The link expires in 1 hour and works once. Nothing arrived? Check your spam folder, or try
          again in a minute.
        </p>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title="Reset your password"
      description="Enter your account's email address and we'll send you a reset link."
      footer={footer}
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        {error && <FieldError>{error}</FieldError>}
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          Send reset link
        </Button>
      </form>
    </AuthCard>
  );
}
