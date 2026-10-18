import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The API client keeps the fetch it was created with, so swap it in before anything imports it.
const api = vi.hoisted(() => {
  const state = {
    notifications: {} as {
      monthlySummary: boolean;
      monthlySummaryAi: boolean;
      budgets: { budgetId: string; name: string; monthlySummary: boolean; aiEnabled: boolean }[];
    },
    patches: [] as Record<string, unknown>[],
  };
  globalThis.fetch = (async (input: Request) => {
    if (input.method === "PATCH") {
      const body = (await input.json()) as Record<string, unknown> & {
        budgets?: { budgetId: string; monthlySummary: boolean }[];
      };
      state.patches.push(body);
      const { budgets, ...rest } = body;
      state.notifications = {
        ...state.notifications,
        ...rest,
        budgets: state.notifications.budgets.map((b) => ({
          ...b,
          monthlySummary:
            budgets?.find((x) => x.budgetId === b.budgetId)?.monthlySummary ?? b.monthlySummary,
        })),
      };
    }
    return Response.json(state.notifications);
  }) as typeof fetch;
  return state;
});

import { instanceQueryOptions } from "@/lib/instance";
import { NotificationsCard } from "./notifications-card";

function renderCard(email = true) {
  const client = new QueryClient();
  client.setQueryData(instanceQueryOptions.queryKey, { deployment: "self-hosted", email });
  render(
    <QueryClientProvider client={client}>
      <NotificationsCard />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.notifications = {
    monthlySummary: true,
    monthlySummaryAi: true,
    budgets: [
      { budgetId: "b1", name: "Household", monthlySummary: true, aiEnabled: true },
      { budgetId: "b2", name: "Side Business", monthlySummary: true, aiEnabled: false },
    ],
  };
  api.patches = [];
});

describe("notification settings", () => {
  it("turns one budget's summary off, then every summary", async () => {
    const user = userEvent.setup();
    renderCard();
    const household = await screen.findByRole("checkbox", { name: "Household" });
    await waitFor(() => expect(household).toBeEnabled());
    await user.click(household);
    await waitFor(() => expect(household).not.toBeChecked());
    expect(api.patches).toEqual([{ budgets: [{ budgetId: "b1", monthlySummary: false }] }]);

    await user.click(screen.getByRole("checkbox", { name: /Monthly summary/ }));
    await waitFor(() => expect(screen.queryByRole("checkbox", { name: "Household" })).toBeNull());
    expect(api.patches.at(-1)).toEqual({ monthlySummary: false });
  });

  it("turns the AI overview off", async () => {
    const user = userEvent.setup();
    renderCard();
    const ai = await screen.findByRole("checkbox", { name: /AI overview/ });
    await waitFor(() => expect(ai).toBeEnabled());
    await user.click(ai);
    await waitFor(() => expect(api.patches).toEqual([{ monthlySummaryAi: false }]));
  });

  it("offers nothing on a server that sends no email", async () => {
    renderCard(false);
    expect(await screen.findByText(/doesn't send email/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Monthly summary/ })).toBeDisabled();
  });
});
