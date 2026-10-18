import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { Transaction } from "@/lib/transactions";
import { AttachmentCell, AttachmentField, attachmentUrl } from "./transaction-attachment";

const txn: Transaction = {
  id: "t1",
  accountId: "a1",
  accountName: "Checking",
  date: "2026-10-01",
  amount: "-2500",
  currency: "USD",
  baseAmount: "-2500",
  fxRate: null,
  fxRateManual: false,
  payeeId: null,
  payeeName: "Market",
  categoryId: null,
  categoryName: null,
  memo: "",
  cleared: "uncleared",
  transferAccountId: null,
  transferTransactionId: null,
  flag: null,
  approved: true,
  needsCategory: false,
  imported: false,
  importedPayee: null,
  matched: null,
  transferFromSplit: false,
  transferReconciled: false,
  transferSide: null,
  subtransactions: [],
  runningBalance: "0",
  matchingLineIds: null,
  enteredBy: null,
  attachment: null,
  changedBy: null,
  version: 1,
};
const withPhoto: Transaction = {
  ...txn,
  attachment: {
    id: "att1",
    transactionId: "t1",
    fileName: "receipt.jpg",
    contentType: "image/jpeg",
    byteSize: 204_800,
    createdAt: "2026-10-01T10:00:00Z",
  },
};

const wrap = (node: ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);

describe("AttachmentCell", () => {
  it("offers to add one, unless the viewer can't change the budget", () => {
    const { unmount } = wrap(<AttachmentCell budgetId="b1" transaction={txn} />);
    expect(screen.getByRole("button", { name: "Add a photo or PDF to Market" })).toBeEnabled();
    unmount();
    wrap(<AttachmentCell budgetId="b1" transaction={txn} readOnly />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the photo and opens it with Delete, Download and Close", async () => {
    wrap(<AttachmentCell budgetId="b1" transaction={withPhoto} />);
    await userEvent.click(screen.getByRole("button", { name: "Open the attachment of Market" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("receipt.jpg");
    expect(dialog).toHaveTextContent("Market · 200 KB");
    expect(screen.getByRole("img", { name: "receipt.jpg" })).toHaveAttribute(
      "src",
      attachmentUrl("b1", withPhoto),
    );
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      expect.stringContaining("download=true"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "Are you sure you want to delete this attachment?",
    );
  });
});

describe("a photo this browser can't decode", () => {
  it("shows as a file in the register and offers the download in the viewer", async () => {
    const heic: Transaction = {
      ...withPhoto,
      attachment: {
        ...(withPhoto.attachment as NonNullable<Transaction["attachment"]>),
        contentType: "image/heic",
      },
    };
    const { container } = wrap(<AttachmentCell budgetId="b1" transaction={heic} />);
    const thumb = container.querySelector("img");
    if (!thumb) throw new Error("no thumbnail");
    fireEvent.error(thumb);
    expect(container.querySelector("img")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Open the attachment of Market" }));
    fireEvent.error(screen.getByRole("img", { name: "receipt.jpg" }));
    expect(await screen.findByText(/can't show this photo/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download" })).toBeInTheDocument();
  });
});

describe("AttachmentField", () => {
  it("names the file on a phone", () => {
    wrap(<AttachmentField budgetId="b1" transaction={withPhoto} />);
    expect(screen.getByRole("button", { name: /receipt\.jpg/ })).toHaveTextContent("200 KB");
  });
});

describe("attachmentUrl", () => {
  it("names the version, so a replaced file isn't served from the cache", () => {
    expect(attachmentUrl("b1", withPhoto, true)).toMatch(
      /\/v1\/budgets\/b1\/transactions\/t1\/attachment\?v=att1&download=true$/,
    );
  });
});
