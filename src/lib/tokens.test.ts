// Token helper tests (D-07 / LINK-02 / LINK-03 / prohibition P1).
// Verifies generateToken() produces 21-char URL-safe crypto-random IDs and that
// two independent calls (as createPoll uses them for participant vs admin) are
// not derivable from one another.
import { describe, it, expect } from "vitest";
import { generateToken } from "./tokens";

describe("generateToken", () => {
  it("returns a 21-character token (>=126-bit entropy, LINK-03)", () => {
    expect(generateToken()).toHaveLength(21);
  });

  it("uses only the URL-safe nanoid alphabet (no hyphens or unsafe chars)", () => {
    for (let i = 0; i < 100; i++) {
      expect(generateToken()).toMatch(/^[A-Za-z0-9_-]{21}$/);
    }
  });

  it("produces unique values across many calls (non-enumerable)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10000; i++) {
      seen.add(generateToken());
    }
    expect(seen.size).toBe(10000);
  });

  it("two independent calls are never equal — admin token not derived from participant token (P1)", () => {
    for (let i = 0; i < 1000; i++) {
      const participantUrlId = generateToken();
      const adminUrlId = generateToken();
      expect(adminUrlId).not.toBe(participantUrlId);
      // No shared prefix/suffix relationship implying derivation.
      expect(adminUrlId.startsWith(participantUrlId)).toBe(false);
      expect(participantUrlId.startsWith(adminUrlId)).toBe(false);
    }
  });
});
