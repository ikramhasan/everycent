import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { AuthCard } from "@/components/auth-card";
import { CheckInbox } from "@/components/check-inbox";
import { PageTitle } from "@/components/page-title";
import { SignUpForm } from "@/components/sign-up-form";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { sessionQueryOptions } from "@/lib/session";

export const Route = createFileRoute("/sign-up")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
    if (session) throw redirect({ to: "/" });
  },
  component: () => (
    <>
      <PageTitle name="Sign up" />
      <SignUpPage />
    </>
  ),
});

function SignUpPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const signInLink = (
    <Link to="/sign-in" className="text-foreground underline underline-offset-4">
      Sign in
    </Link>
  );

  if (sentTo) {
    // Shown for a new address and for one that already has an account (that owner gets an
    // email instead), so sign-up doesn't reveal which addresses are registered.
    return (
      <AuthCard
        title="Check your inbox"
        description="One more step: confirm your email address."
        footer={<span>Confirmed already? {signInLink}</span>}
      >
        <CheckInbox email={sentTo} />
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title="Create your account"
      description="Give every cent a job."
      footer={<span>Already have an account? {signInLink}</span>}
    >
      <SignUpForm
        onSubmit={async (values) => {
          const { error } = await authClient.signUp.email(values);
          if (error) return authErrorMessage(error, error.message ?? "Sign up failed");
          setSentTo(values.email);
          return null;
        }}
      />
    </AuthCard>
  );
}
