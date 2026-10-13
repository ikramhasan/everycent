import { Button } from "@everycent/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@everycent/ui/components/card";
import { Checkbox } from "@everycent/ui/components/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@everycent/ui/components/field";
import { Input } from "@everycent/ui/components/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@everycent/ui/components/item";
import { Spinner } from "@everycent/ui/components/spinner";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { NewPasswordFields, readNewPassword } from "@/components/new-password-fields";
import { $api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { apiErrorMessage } from "@/lib/budgets";
import { refreshSession } from "@/lib/session";

export const Route = createFileRoute("/_authed/account")({
  component: AccountPage,
});

function AccountPage() {
  const { session } = Route.useRouteContext();
  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <h1 className="font-semibold text-2xl tracking-tight">Account settings</h1>
      <EmailCard email={session.user.email} />
      <PasswordCard />
      <DevicesCard />
    </div>
  );
}

function EmailCard({ email }: { email: string }) {
  const change = $api.useMutation("post", "/v1/me/email");
  const [error, setError] = useState<string | null>(null);
  const [pendingTo, setPendingTo] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const newEmail = String(form.get("newEmail") ?? "").trim();
    setError(null);
    try {
      await change.mutateAsync({
        body: { newEmail, password: String(form.get("password") ?? "") },
      });
      formElement.reset();
      setPendingTo(newEmail);
    } catch (e) {
      setError(apiErrorMessage(e, "Couldn't start the change. Try again."));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email</CardTitle>
        <CardDescription>
          You sign in with <span className="font-medium text-foreground break-all">{email}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {pendingTo ? (
          <div className="grid gap-3 text-sm" role="status">
            <p>
              We've emailed <span className="font-medium break-all">{email}</span> a link to approve
              the change. Once it's approved, we'll send a confirmation link to{" "}
              <span className="font-medium break-all">{pendingTo}</span>. Your email changes when
              you open that one.
            </p>
            <p className="text-muted-foreground">
              Both links expire in 1 hour. If the new address already has an account, no link is
              sent to it.
            </p>
            <div>
              <Button variant="outline" onClick={() => setPendingTo(null)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid gap-4">
            <Field>
              <FieldLabel htmlFor="newEmail">New email</FieldLabel>
              <Input id="newEmail" name="newEmail" type="email" autoComplete="email" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="emailPassword">Current password</FieldLabel>
              <Input
                id="emailPassword"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
              <FieldDescription>
                We'll ask your current address to approve the change first.
              </FieldDescription>
            </Field>
            {error && <FieldError>{error}</FieldError>}
            <div>
              <Button type="submit" disabled={change.isPending}>
                {change.isPending && <Spinner />}
                Change email
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const queryClient = useQueryClient();
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const read = readNewPassword(form);
    if ("error" in read) return setError(read.error);
    setPending(true);
    setError(null);
    const { error } = await authClient.changePassword({
      currentPassword: String(form.get("currentPassword") ?? ""),
      newPassword: read.password,
      revokeOtherSessions: signOutOthers,
    });
    setPending(false);
    if (error) {
      setError(authErrorMessage(error, "Couldn't change the password. Try again."));
      return;
    }
    formElement.reset();
    // Signing out the others replaces this device's session too.
    await refreshSession(queryClient);
    await queryClient.invalidateQueries({ queryKey: ["get", "/v1/me/sessions"] });
    toast.success(
      signOutOthers ? "Password changed. Other devices signed out." : "Password changed",
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>We'll email you when your password changes.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="currentPassword">Current password</FieldLabel>
            <Input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <NewPasswordFields />
          <Field orientation="horizontal">
            <Checkbox
              id="signOutOthers"
              checked={signOutOthers}
              onCheckedChange={(checked) => setSignOutOthers(checked === true)}
            />
            <FieldLabel htmlFor="signOutOthers" className="font-normal">
              Sign out of all other devices
            </FieldLabel>
          </Field>
          {error && <FieldError>{error}</FieldError>}
          <div>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              Change password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function DevicesCard() {
  const queryClient = useQueryClient();
  const sessions = $api.useQuery("get", "/v1/me/sessions");
  const revokeOne = $api.useMutation("delete", "/v1/me/sessions/{sessionId}");
  const revokeOthers = $api.useMutation("delete", "/v1/me/sessions");
  const list = sessions.data?.sessions ?? [];
  const others = list.filter((s) => !s.current);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["get", "/v1/me/sessions"] });
  }

  async function signOutOne(sessionId: string) {
    try {
      await revokeOne.mutateAsync({ params: { path: { sessionId } } });
      toast.success("Device signed out");
    } catch (e) {
      toast.error(apiErrorMessage(e, "Couldn't sign out that device."));
    }
    await refresh();
  }

  async function signOutOthers() {
    try {
      await revokeOthers.mutateAsync({});
      toast.success("Other devices signed out");
    } catch (e) {
      toast.error(apiErrorMessage(e, "Couldn't sign out the other devices."));
    }
    await refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Devices</CardTitle>
        <CardDescription>
          Where your account is signed in. Sign out anything you don't recognise, then change your
          password.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {sessions.isPending ? (
          <Spinner />
        ) : sessions.isError ? (
          <FieldError>Couldn't load your devices.</FieldError>
        ) : (
          <ItemGroup className="gap-2">
            {list.map((s) => {
              const Icon =
                s.deviceType === "mobile"
                  ? Smartphone
                  : s.deviceType === "tablet"
                    ? Tablet
                    : Monitor;
              const name = [s.browser, s.os].filter(Boolean).join(" on ") || "Unknown device";
              return (
                <Item key={s.id} variant="outline" size="sm">
                  <ItemMedia variant="icon">
                    <Icon />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>
                      {name}
                      {s.current && (
                        <span className="font-normal text-muted-foreground text-xs">
                          This device
                        </span>
                      )}
                    </ItemTitle>
                    <ItemDescription>
                      Signed in {dateTime.format(new Date(s.createdAt))}
                      {s.ipAddress ? ` · ${s.ipAddress}` : ""}
                    </ItemDescription>
                  </ItemContent>
                  {!s.current && (
                    <ItemActions>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={revokeOne.isPending}
                        onClick={() => signOutOne(s.id)}
                      >
                        Sign out
                      </Button>
                    </ItemActions>
                  )}
                </Item>
              );
            })}
          </ItemGroup>
        )}
        {others.length > 0 && (
          <div>
            <Button variant="outline" onClick={signOutOthers} disabled={revokeOthers.isPending}>
              {revokeOthers.isPending && <Spinner />}
              Sign out all other devices
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
