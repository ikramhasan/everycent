import { cn } from "@everycent/ui/lib/utils";
import type * as React from "react";

// The register's table parts. The shared Table is a tray whose rows paint hover, selection and
// dividers on their cells, with roomy px-3 cells; the register's fixed column widths, pinned
// columns (PINNED_BG) and inline editor are built for plain rows that carry those states
// themselves, so its body, rows and cells keep that styling here.

function RegisterBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

function RegisterRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

function RegisterHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

function RegisterCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      className={cn("p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0", className)}
      {...props}
    />
  );
}

export { RegisterBody, RegisterCell, RegisterHead, RegisterRow };
