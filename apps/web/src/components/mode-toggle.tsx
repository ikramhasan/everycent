import { Button } from "@everycent/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@everycent/ui/components/dropdown-menu";
import { type Theme, useTheme } from "@everycent/ui/lib/theme";
import { Monitor, Moon, Sun } from "lucide-react";

/**
 * Both icons stay mounted and cross-fade (opacity, scale from 0.25, a 4px blur), so the swap
 * animates both ways without a motion library and never grows from nothing.
 */
const ICON =
  "size-4 transition-[opacity,scale,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none";

export function ModeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Toggle theme">
          <Sun data-theme-icon className={`${ICON} dark:scale-25 dark:opacity-0 dark:blur-xs`} />
          <Moon
            data-theme-icon
            className={`${ICON} absolute scale-25 opacity-0 blur-xs dark:scale-100 dark:opacity-100 dark:blur-none`}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {/* The choice in effect is checked, "System" included. */}
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          <DropdownMenuRadioItem value="light">
            <Sun /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor /> System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
