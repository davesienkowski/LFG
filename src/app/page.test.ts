// Landing page `/` tests. Asserts the cookie-gated "Your polls" entry link
// (MYP-06): shown ONLY when the same-browser `lfg_organizer` cookie is present,
// and omitted when the cookie is absent or empty/whitespace (treated as absent,
// mirroring create-poll). No DB is touched — the landing page only reads the
// cookie via next/headers, which is mocked here with a controllable value.
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Control the organizer cookie per test. get() returns { value } when set, else
// undefined (mirrors the real cookies() store shape).
let mockCookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () =>
      mockCookieValue !== undefined ? { value: mockCookieValue } : undefined,
  }),
  headers: async () => new Map<string, string>([["host", "lfg.test"]]),
}));

import Home from "./page";

async function renderHome(): Promise<string> {
  return renderToStaticMarkup(await Home());
}

describe("Home (landing page)", () => {
  it("shows the 'Your polls' (/polls) link when the organizer cookie is present (MYP-06)", async () => {
    mockCookieValue = "some-organizer-token";
    const html = await renderHome();

    expect(html).toContain('href="/polls"');
    expect(html).toContain("Your polls");
  });

  it("omits the '/polls' link when the organizer cookie is absent (MYP-06 negative)", async () => {
    mockCookieValue = undefined;
    const html = await renderHome();

    // First-time visitors see no dead link.
    expect(html).not.toContain('href="/polls"');
    expect(html).not.toContain("Your polls");
  });

  it("treats an empty/whitespace organizer cookie as absent (no '/polls' link)", async () => {
    mockCookieValue = "   ";
    const html = await renderHome();

    expect(html).not.toContain('href="/polls"');
    expect(html).not.toContain("Your polls");
  });
});
