// Creation form route `/` (UI-SPEC Surface 1 / board 3a · 3a-m). RSC shell:
// centered single column, max-w-2xl. Desktop (3a) frames the title + form in a
// bordered card (rounded-2xl, --border, shadow-sm, 40/44px padding); mobile
// (3a-m) drops the card chrome to full-bleed so the client form's sticky
// `Create poll` footer can pin to the viewport edges. The interactive form is a
// client component.
import Link from "next/link";
import { cookies } from "next/headers";
import { PollCreateForm } from "@/components/poll-create-form";

export default async function Home() {
  // Returning-organizer entry point (MYP-06): show a "Your polls" link only when
  // the same-browser organizer cookie is present. Reading cookies() forces this
  // (tiny) page dynamic in Next 16 — intended, so PROH-3 requires NO
  // `dynamic`/`revalidate` export; the link is the static `/polls` path (no token
  // embedded). Empty/whitespace is treated as absent (mirrors create-poll) so a
  // first-time visitor sees no dead link.
  const cookieStore = await cookies();
  const hasOrganizer = Boolean(cookieStore.get("lfg_organizer")?.value?.trim());

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      {hasOrganizer ? (
        <nav className="mb-4 flex items-center text-sm">
          <Link
            href="/polls"
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            Your polls
          </Link>
        </nav>
      ) : null}
      <div className="sm:rounded-2xl sm:border sm:bg-card sm:px-11 sm:py-10 sm:shadow-sm">
        <h1 className="text-3xl font-semibold leading-tight mb-8">
          Create a poll
        </h1>
        <PollCreateForm />
      </div>
    </main>
  );
}
