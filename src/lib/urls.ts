// Absolute share-URL construction (D-10). Prefer NEXT_PUBLIC_BASE_URL; fall back
// to the request host header when it is unset. These helpers are pure (no
// next/headers import) so they are trivially unit-testable — the RSC page reads
// the host header and passes it in.

/** Resolve the absolute base origin (no trailing slash). */
export function resolveBaseUrl(
  headerHost: string | null,
  proto?: string | null,
): string {
  const fromEnv = process.env.NEXT_PUBLIC_BASE_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  const host = headerHost ?? "localhost:3000";
  return `${proto ?? "http"}://${host}`;
}

export function buildParticipantUrl(base: string, participantUrlId: string): string {
  return `${base.replace(/\/+$/, "")}/p/${participantUrlId}`;
}

export function buildAdminUrl(base: string, adminUrlId: string): string {
  return `${base.replace(/\/+$/, "")}/a/${adminUrlId}`;
}

// The personal edit link surfaced on /thanks (D2-09). The editToken is an
// independent bearer credential — this helper only formats the URL; it never
// derives or transforms the token.
export function buildEditUrl(
  base: string,
  participantUrlId: string,
  editToken: string,
): string {
  return `${base.replace(/\/+$/, "")}/p/${participantUrlId}/edit/${editToken}`;
}
