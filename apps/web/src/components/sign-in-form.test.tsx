import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SignInForm } from "./sign-in-form";

describe("SignInForm", () => {
  it("submits email and password", async () => {
    const onSubmit = vi.fn().mockResolvedValue(null);
    render(<SignInForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "correct-horse");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(onSubmit).toHaveBeenCalledWith({ email: "ada@example.com", password: "correct-horse" });
  });

  it("shows the error message returned by onSubmit", async () => {
    render(<SignInForm onSubmit={async () => "Invalid email or password"} />);

    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
  });
});
