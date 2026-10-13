import type { components } from "@everycent/api-client";
import { Button } from "@everycent/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@everycent/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@everycent/ui/components/dialog";
import { Field, FieldError, FieldLabel } from "@everycent/ui/components/field";
import { Input } from "@everycent/ui/components/input";
import { Skeleton } from "@everycent/ui/components/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useState } from "react";
import { toast } from "sonner";
import { $api } from "@/lib/api";
import { useBudget } from "@/lib/budget-context";
import { apiErrorMessage } from "@/lib/budgets";
import { sessionQueryOptions } from "@/lib/session";

/** Budget settings' sharing card: YNAB Together's members and pending invitations, per budget. */
export function BudgetMembers({ actions }: { actions?: (member: Member) => ReactNode }) {
  const { budget, formatDate } = useBudget();
  const queryClient = useQueryClient();
  const path = { budgetId: budget.id };
  const members = $api.useQuery("get", "/v1/budgets/{budgetId}/members", { params: { path } });
  const resend = $api.useMutation(
    "post",
    "/v1/budgets/{budgetId}/invitations/{invitationId}/resend",
  );
  const cancel = $api.useMutation("delete", "/v1/budgets/{budgetId}/invitations/{invitationId}");
  const me = queryClient.getQueryData(sessionQueryOptions.queryKey)?.user;
  const [inviting, setInviting] = useState(false);
  const owner = budget.role === "owner";

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["get", "/v1/budgets/{budgetId}/members"] });

  const data = members.data;
  const remaining = data
    ? data.maxPeople - data.members.length - data.invitations.filter((i) => !i.expired).length
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sharing</CardTitle>
        <CardDescription>
          People you share this budget with can see and edit everything in it. Only the owner can
          invite or remove people, delete the budget or make a fresh start.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!data ? (
          <Skeleton className="h-16" />
        ) : (
          <>
            <ul className="grid gap-2">
              {data.members.map((m) => (
                <li key={m.userId} className="flex items-center gap-3">
                  <Avatar name={m.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm">
                      {m.name}
                      {m.userId === me?.id && " (you)"}
                    </p>
                    <p className="truncate text-muted-foreground text-xs">{m.email}</p>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {m.role === "owner" ? "Owner" : "Member"}
                  </span>
                  {actions?.(m)}
                </li>
              ))}
            </ul>

            {owner && data.invitations.length > 0 && (
              <div className="grid gap-2">
                <p className="font-medium text-sm">Pending Invitations</p>
                <ul className="grid gap-2">
                  {data.invitations.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center gap-3">
                      <Avatar name={i.name} muted />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-sm">{i.name}</p>
                        <p className="truncate text-muted-foreground text-xs">
                          {i.email} ·{" "}
                          {i.expired
                            ? "Expired"
                            : `Expires ${formatDate(i.expiresAt.slice(0, 10))}`}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={resend.isPending}
                        onClick={async () => {
                          try {
                            await resend.mutateAsync({
                              params: { path: { ...path, invitationId: i.id } },
                            });
                            toast.success(`Invitation sent again to ${i.email}`);
                          } catch (e) {
                            toast.error(apiErrorMessage(e, "Couldn't resend the invitation."));
                          }
                          await refresh();
                        }}
                      >
                        Resend Invite
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={cancel.isPending}
                        onClick={async () => {
                          try {
                            await cancel.mutateAsync({
                              params: { path: { ...path, invitationId: i.id } },
                            });
                          } catch (e) {
                            toast.error(apiErrorMessage(e, "Couldn't cancel the invitation."));
                          }
                          await refresh();
                        }}
                      >
                        Cancel Invite
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {owner && (
              <div className="flex items-center justify-between gap-3 border-t pt-4">
                <p className="text-muted-foreground text-sm">
                  {remaining > 0
                    ? `${remaining} ${remaining === 1 ? "invite" : "invites"} remaining`
                    : "This budget is shared with as many people as it can be."}
                </p>
                <Button onClick={() => setInviting(true)} disabled={remaining <= 0}>
                  Invite Member
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
      {inviting && (
        <InviteDialog
          onClose={() => setInviting(false)}
          onInvited={async (email) => {
            setInviting(false);
            toast.success(`Invitation sent to ${email}`);
            await refresh();
          }}
        />
      )}
    </Card>
  );
}

export type Member = components["schemas"]["BudgetMember"];

function Avatar({ name, muted }: { name: string; muted?: boolean }) {
  return (
    <span
      aria-hidden
      className={
        muted
          ? "flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed font-medium text-muted-foreground text-sm"
          : "flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-sm"
      }
    >
      {[...name.trim()][0]?.toUpperCase() ?? "?"}
    </span>
  );
}

function InviteDialog({
  onClose,
  onInvited,
}: {
  onClose: () => void;
  onInvited: (email: string) => Promise<void>;
}) {
  const { budget } = useBudget();
  const invite = $api.useMutation("post", "/v1/budgets/{budgetId}/invitations");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    if (!name) return setError("Enter their first name.");
    setError(null);
    try {
      await invite.mutateAsync({
        params: { path: { budgetId: budget.id } },
        body: { name, email },
      });
      await onInvited(email);
    } catch (e) {
      setError(apiErrorMessage(e, "Couldn't send the invitation. Try again."));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Invite Member</DialogTitle>
            <DialogDescription>
              They'll get an email with a link to join “{budget.name}”. It works for 14 days.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="invite-name">First name</FieldLabel>
            <Input id="invite-name" name="name" autoComplete="off" maxLength={100} autoFocus />
          </Field>
          <Field>
            <FieldLabel htmlFor="invite-email">Email</FieldLabel>
            <Input id="invite-email" name="email" type="email" required autoComplete="off" />
          </Field>
          {error && <FieldError>{error}</FieldError>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={invite.isPending}>
              Invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
