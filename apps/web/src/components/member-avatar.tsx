import { Tooltip, TooltipContent, TooltipTrigger } from "@everycent/ui/components/tooltip";
import { cn } from "@everycent/ui/lib/utils";

/**
 * YNAB's six member avatar colours (avatar-one … avatar-six, checked 2026-10-16 on a shared plan,
 * EVERYCENT-166): the owner ("manager") is #545BFE with white text, everyone else black text. The
 * API numbers them 1–6 (the owner 1, the others by when they joined).
 */
const AVATAR_COLORS: Record<number, string> = {
  1: "bg-[#545BFE] text-white",
  2: "bg-[#AEE865] text-black",
  3: "bg-[#41D298] text-black",
  4: "bg-[#D4D5FF] text-black",
  5: "bg-[#FBE48E] text-black",
  6: "bg-[#FAADA5] text-black",
};

/** An avatar's tooltip, as YNAB words it: "Pat", "Pat (you)", "Pat (removed)", "Inactive Member". */
export function memberTooltip(
  userId: string | null,
  userName: string | null,
  avatarColor: number | null,
  currentUserId: string | undefined,
): string {
  if (!userId || !userName) return "Inactive Member";
  if (!avatarColor) return `${userName} (removed)`;
  return `${userName}${userId === currentUserId ? " (you)" : ""}`;
}

/**
 * Who made a change, as YNAB marks a money move: a small round avatar with the first letter of the
 * name in the member's colour and the name as its tooltip. Someone no longer on the budget gets the
 * grey inactive avatar (#DBD7CC): with their initial and "(removed)" while their user exists, empty
 * with "Inactive Member" once it's deleted.
 */
export function MemberAvatar({
  userId,
  userName,
  avatarColor,
  currentUserId,
  className,
}: {
  userId: string | null;
  userName: string | null;
  /** 1–6 from the API; null once they've left the budget. */
  avatarColor: number | null;
  currentUserId: string | undefined;
  className?: string;
}) {
  const tooltip = memberTooltip(userId, userName, avatarColor, currentUserId);
  const colors = (avatarColor && AVATAR_COLORS[avatarColor]) || "bg-[#DBD7CC] text-[#696763]";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={tooltip}
          className={cn(
            "inline-flex size-6 shrink-0 select-none items-center justify-center rounded-full font-bold text-xs uppercase",
            colors,
            className,
          )}
        >
          {userId && userName ? userName.trim().charAt(0) : ""}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
