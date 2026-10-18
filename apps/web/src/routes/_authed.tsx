import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { takePendingPicture, uploadProfilePicture } from "@/lib/pictures";
import { refreshSession, sessionQueryOptions } from "@/lib/session";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
    if (!session) {
      throw redirect({ to: "/sign-in", search: { redirect: location.href } });
    }
    // Only sessions from before confirmation was required can be unconfirmed; the API refuses them.
    if (!session.user.emailVerified) throw redirect({ to: "/verify-email" });
    return { session };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { session } = Route.useRouteContext();
  // The live session, so a new profile picture or name shows without a reload.
  const user = useQuery(sessionQueryOptions).data?.user ?? session.user;
  usePendingPicture(user);
  return <AppShell user={user} />;
}

/**
 * Uploads the picture chosen at sign-up (kept in this browser until there's a session), once, the
 * first time the confirmed account is signed in here without a picture.
 */
function usePendingPicture(user: { email: string; image?: string | null }) {
  const queryClient = useQueryClient();
  const started = useRef(false);
  useEffect(() => {
    if (started.current || user.image) return;
    started.current = true;
    void (async () => {
      const blob = await takePendingPicture(user.email);
      if (!blob) return;
      try {
        await uploadProfilePicture(blob);
        await refreshSession(queryClient);
      } catch {
        toast.error("Couldn't add your profile picture. Add it again in Account settings.");
      }
    })();
  }, [user.email, user.image, queryClient]);
}
