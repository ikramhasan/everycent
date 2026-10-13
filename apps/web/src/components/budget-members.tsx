import type { components } from "@everycent/api-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@everycent/ui/components/alert-dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@everycent/ui/components/dropdown-menu";
import { Field, FieldError, FieldLabel } from "@everycent/ui/components/field";
import { Input } from "@everycent/ui/components/input";
import { Skeleton } from "@everycent/ui/components/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { $api } from "@/lib/api";
import { useBudget } from "@/lib/budget-context";
import { apiErrorMessage, invalidateBudgets } from "@/lib/budgets";
import { sessionQueryOptions } from "@/lib/session";

/** Budget settings' sharing card: YNAB Together's members and pending invitations, per budget. */
export function BudgetMembers() {
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
                  <MemberActions member={m} isMe={m.userId === me?.id} onChanged={refresh} />
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

type Confirm = "remove" | "transfer" | "leave";

/**
 * The owner removes people or makes one of them the owner; anyone else can leave. Each asks
 * first, as YNAB's Remove Member and Leave Group do.
 */
function MemberActions({
  member,
  isMe,
  onChanged,
}: {
  member: Member;
  isMe: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const { budget } = useBudget();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const path = { budgetId: budget.id };
  const remove = $api.useMutation("delete", "/v1/budgets/{budgetId}/members/{userId}");
  const leave = $api.useMutation("post", "/v1/budgets/{budgetId}/leave");
  const transfer = $api.useMutation("post", "/v1/budgets/{budgetId}/transfer-ownership");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const owner = budget.role === "owner";

  if (member.role === "owner" || (!owner && !isMe)) return null;

  async function run() {
    try {
      if (confirm === "remove") {
        await remove.mutateAsync({ params: { path: { ...path, userId: member.userId } } });
        toast.success(`${member.name} no longer shares this budget`);
        await onChanged();
      } else if (confirm === "transfer") {
        await transfer.mutateAsync({ params: { path }, body: { userId: member.userId } });
        toast.success(`${member.name} now owns this budget`);
        await onChanged();
        await invalidateBudgets(queryClient);
      } else if (confirm === "leave") {
        await leave.mutateAsync({ params: { path } });
        await navigate({ to: "/" });
        queryClient.removeQueries({ queryKey: ["get", "/v1/budgets/{budgetId}"] });
        await invalidateBudgets(queryClient);
        toast.success(`You left “${budget.name}”`);
      }
    } catch (e) {
      toast.error(apiErrorMessage(e, "Couldn't do that. Try again."));
    }
  }

  const copy: Record<Confirm, { title: string; body: string; action: string }> = {
    remove: {
      title: `Remove ${member.name}?`,
      body: `${member.name} (${member.email}) will no longer be able to see or edit “${budget.name}”.`,
      action: "Remove Member",
    },
    transfer: {
      title: `Make ${member.name} the owner?`,
      body: `${member.name} will own “${budget.name}”: only they will be able to invite or remove people, delete it or make a fresh start. You'll keep access as a member.`,
      action: "Transfer Ownership",
    },
    leave: {
      title: `Leave “${budget.name}”?`,
      body: "You'll no longer be able to see or edit this budget. The owner can invite you again.",
      action: "Leave Budget",
    },
  };

  return (
    <>
      {isMe ? (
        <Button size="sm" variant="outline" onClick={() => setConfirm("leave")}>
          Leave
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" aria-label={`Actions for ${member.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuItem onSelect={() => setConfirm("transfer")}>Make owner</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("remove")}>
              Remove Member
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        {confirm && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{copy[confirm].title}</AlertDialogTitle>
              <AlertDialogDescription>{copy[confirm].body}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant={confirm === "transfer" ? "default" : "destructive"}
                onClick={run}
              >
                {copy[confirm].action}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </>
  );
}
