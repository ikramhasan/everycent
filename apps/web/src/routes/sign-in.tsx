import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { AuthCard } from "@/components/auth-card";
import { SignInForm } from "@/components/sign-in-form";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { safeRedirect } from "@/lib/safe-redirect";
import { refreshSession, sessionQueryOptions } from "@/lib/session";

export const Route = createFileRoute("/sign-in")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: async ({ context, search }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
    if (session) throw redirect({ href: safeRedirect(search.redirect) });
  },
  component: SignInPage,
});

function SignInPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to your budget."
      footer={
        <span>
          New here?{" "}
          <Link to="/sign-up" className="text-foreground underline underline-offset-4">
            Create an account
          </Link>
        </span>
      }
    >
      <SignInForm
        forgotPassword={
          <Link
            to="/forgot-password"
            className="text-muted-foreground text-sm underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        }
        onSubmit={async (values) => {
          const { error } = await authClient.signIn.email(values);
          if (error) return authErrorMessage(error, error.message ?? "Sign in failed");
          await refreshSession(queryClient);
          await navigate({ href: safeRedirect(search.redirect) });
          return null;
        }}
      />
    </AuthCard>
  );
}
