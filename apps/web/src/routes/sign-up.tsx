import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { AuthCard } from "@/components/auth-card";
import { SignUpForm } from "@/components/sign-up-form";
import { authClient } from "@/lib/auth-client";
import { refreshSession, sessionQueryOptions } from "@/lib/session";

export const Route = createFileRoute("/sign-up")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
    if (session) throw redirect({ to: "/" });
  },
  component: SignUpPage,
});

function SignUpPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return (
    <AuthCard
      title="Create your account"
      description="Give every cent a job."
      footer={
        <span>
          Already have an account?{" "}
          <Link to="/sign-in" className="text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </span>
      }
    >
      <SignUpForm
        onSubmit={async (values) => {
          const { error } = await authClient.signUp.email(values);
          if (error) return error.message ?? "Sign up failed";
          await refreshSession(queryClient);
          await navigate({ to: "/" });
          return null;
        }}
      />
    </AuthCard>
  );
}
