import { nanoid } from "nanoid";

/**
 * Generates a URL-safe, cryptographically-random 21-character token
 * (~126 bits of entropy via crypto.getRandomValues internally — D-07 / LINK-03).
 *
 * This helper is intentionally a thin wrapper with NO derivation or transform
 * logic. createPoll (plan 01-02) calls it twice, independently, to mint the
 * participant and admin tokens — the admin token MUST NOT be derivable from the
 * participant token (prohibition P1 / LINK-02).
 */
export function generateToken(): string {
  return nanoid(21);
}
