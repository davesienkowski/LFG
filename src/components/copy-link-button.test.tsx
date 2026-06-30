// @vitest-environment jsdom
//
// CopyLinkButton tests — prohibition UI-P2: the "Copied!" success state must be
// reached ONLY when navigator.clipboard.writeText() resolves. A rejected write
// must NOT show "Copied!".
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { CopyLinkButton } from "./copy-link-button";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
}

describe("CopyLinkButton", () => {
  it("shows 'Copied!' after a resolved clipboard write", async () => {
    mockClipboard(vi.fn().mockResolvedValue(undefined));
    render(
      <CopyLinkButton
        url="https://lfg.app/p/abc"
        label="Copy participant link"
      />,
    );
    const button = screen.getByRole("button", {
      name: "Copy participant link",
    });
    expect(button.textContent).toContain("Copy link");

    fireEvent.click(button);

    await waitFor(() => expect(button.textContent).toContain("Copied!"));
  });

  it("does NOT show 'Copied!' when the clipboard write rejects (UI-P2)", async () => {
    mockClipboard(vi.fn().mockRejectedValue(new Error("permission denied")));
    render(
      <CopyLinkButton
        url="https://lfg.app/a/secret"
        label="Copy admin link"
      />,
    );
    const button = screen.getByRole("button", { name: "Copy admin link" });

    fireEvent.click(button);

    // Flush the rejected promise's microtasks.
    await Promise.resolve();
    await Promise.resolve();

    expect(button.textContent).not.toContain("Copied!");
    expect(button.textContent).toContain("Copy link");
  });
});
