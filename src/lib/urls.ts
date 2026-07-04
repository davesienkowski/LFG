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

// The organizer calendar-feed URL (LD-6). The https copy target the admin card
// surfaces + the click-to-subscribe webcal variant. organizerId is an
// unguessable bearer token — these helpers only format the URL (like the others
// above); they never derive or transform it.
export function buildOrganizerFeedUrl(
  base: string,
  organizerId: string,
): string {
  return `${base.replace(/\/+$/, "")}/feed/${organizerId}/calendar.ics`;
}

// webcal:// scheme triggers the OS calendar-subscribe. Built off the feed URL so
// the path stays in lockstep; swaps http:// OR https:// for webcal://.
export function buildOrganizerWebcalUrl(
  base: string,
  organizerId: string,
): string {
  return buildOrganizerFeedUrl(base, organizerId).replace(
    /^https?:\/\//,
    "webcal://",
  );
}
