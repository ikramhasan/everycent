import { Button } from "@everycent/ui/components/button";
import { Link } from "@tanstack/react-router";

export function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-4 text-center">
      <p className="font-semibold text-5xl tabular-nums">404</p>
      <p className="text-muted-foreground">This page doesn't exist.</p>
      <Button asChild variant="outline">
        <Link to="/">Back to budget</Link>
      </Button>
    </main>
  );
}
