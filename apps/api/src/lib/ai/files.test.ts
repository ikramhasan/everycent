import { describe, expect, it } from "vitest";
import { aiFileType, cleanFileName, modelParts } from "./files";

const text = (s: string) => new TextEncoder().encode(s);

describe("aiFileType", () => {
  it("reads images and PDFs by their contents, text by its extension", async () => {
    expect(
      await aiFileType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]), "x.bin"),
    ).toEqual({ contentType: "image/jpeg", kind: "image" });
    expect(await aiFileType(text("%PDF-1.4\n%%EOF\n"), "scan.txt")).toEqual({
      contentType: "application/pdf",
      kind: "pdf",
    });
    expect(await aiFileType(text("a,b\n1,2\n"), "Bank.CSV")).toEqual({
      contentType: "text/csv",
      kind: "text",
    });
    // An OFX 2 statement is XML.
    expect(await aiFileType(text('<?xml version="1.0"?><OFX></OFX>'), "jan.qfx")).toEqual({
      contentType: "application/x-ofx",
      kind: "text",
    });
    expect(await aiFileType(text("Groceries 12.50"), "notes")).toEqual({
      contentType: "text/plain",
      kind: "text",
    });
  });

  it("refuses what the assistant can't read", async () => {
    // A zip, and binary data that isn't a known type.
    expect(await aiFileType(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]), "a.zip")).toBe(
      null,
    );
    expect(await aiFileType(Uint8Array.from([1, 0, 2, 0, 3]), "a.csv")).toBeNull();
  });
});

describe("modelParts", () => {
  it("sends text as text, decoding older bank exports' Windows-1252", async () => {
    const latin = Uint8Array.from([...text("Caf"), 0xe9, ...text(",4.50")]);
    const parts = await modelParts({
      fileName: "cafe.csv",
      contentType: "text/csv",
      kind: "text",
      bytes: latin,
    });
    expect(parts).toEqual([
      { type: "text", content: 'Attached file "cafe.csv" (text/csv):' },
      { type: "text", content: "Café,4.50" },
    ]);
  });

  it("says when a workbook can't be read", async () => {
    const [, part] = await modelParts({
      fileName: "broken.xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      kind: "spreadsheet",
      bytes: text("not a workbook"),
    });
    expect(part).toMatchObject({
      type: "text",
      content: expect.stringMatching(/couldn't be read/),
    });
  });
});

describe("cleanFileName", () => {
  it("keeps the name, not its path or control characters", () => {
    expect(cleanFileName("C:\\Users\\me\\receipt\u0007.jpg")).toBe("receipt.jpg");
    expect(cleanFileName("")).toBe("file");
  });
});
