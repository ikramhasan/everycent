import type { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { NotFound } from "./components/not-found";
import { routeTree } from "./routeTree.gen";

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    // Let TanStack Query own caching; the router always asks it.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    // The app shell's ScrollArea viewport scrolls the page, not the window.
    scrollToTopSelectors: ["#app-scroll"],
    defaultNotFoundComponent: NotFound,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
