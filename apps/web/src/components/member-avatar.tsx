import { Tooltip, TooltipContent, TooltipTrigger } from "@everycent/ui/components/tooltip";
import { cn } from "@everycent/ui/lib/utils";

/**
 * Who made a money move, as YNAB marks it (checked 2026-10-14): a small round avatar with the
 * first letter of the name and the name as its tooltip, " (you)" added for you. The plan's owner
 * ("manager" in YNAB) is avatar-one, #545BFE with white text. Someone no longer on the plan is an
 * inactive member: an empty grey avatar (#DBD7CC) with the tooltip "Inactive Member". The colours
 * YNAB gives the other members couldn't be seen yet (EVERYCENT-166), so they get a neutral one.
 */
export function MemberAvatar({
  userId,
  userName,
  memberRole,
  currentUserId,
  className,
}: {
  userId: string | null;
  userName: string | null;
  memberRole: "owner" | "editor" | null;
  currentUserId: string | undefined;
  className?: string;
}) {
  const active = Boolean(userId && userName && memberRole);
  const tooltip = active
    ? `${userName}${userId === currentUserId ? " (you)" : ""}`
    : "Inactive Member";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={tooltip}
          className={cn(
            "inline-flex size-6 shrink-0 select-none items-center justify-center rounded-full font-bold text-xs uppercase",
            !active
              ? "bg-[#DBD7CC] text-[#696763]"
              : memberRole === "owner"
                ? "bg-[#545BFE] text-white"
                : "bg-muted text-foreground ring-1 ring-border",
            className,
          )}
        >
          {active ? userName?.trim().charAt(0) : ""}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
