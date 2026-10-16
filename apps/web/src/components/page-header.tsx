import { createContext, type ReactNode, useContext } from "react";
import { createPortal } from "react-dom";

/**
 * Where page headers go: the app shell's top bar, beside the sidebar toggle. `null` while the bar
 * mounts; `undefined` outside the shell (tests, sign-in), where a header renders in place.
 */
const PageHeaderSlot = createContext<HTMLElement | null | undefined>(undefined);

export const PageHeaderSlotProvider = PageHeaderSlot.Provider;

/**
 * A page's header — its title, anything that belongs beside it (a star, the account type) and its
 * actions — shown in the top bar rather than above the page, so the page starts with its content.
 */
export function PageHeader({
  title,
  meta,
  actions,
}: {
  title: ReactNode;
  /** Beside the title: badges, a star, a short muted line. */
  meta?: ReactNode;
  /** The page's buttons, at the bar's right end. */
  actions?: ReactNode;
}) {
  const slot = useContext(PageHeaderSlot);
  const content = (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <h1 className="truncate font-semibold text-base">{title}</h1>
        {meta}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </>
  );
  if (slot === undefined) return <header className="flex items-center gap-2">{content}</header>;
  return slot ? createPortal(content, slot) : null;
}
