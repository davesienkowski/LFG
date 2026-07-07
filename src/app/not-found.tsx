// Global 404 (UI-SPEC Surface 4). Reached via notFound() from the admin and
// participant routes when a token does not resolve (D-08 / LINK-01/02/03).
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12 flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold leading-tight">Poll not found</h1>
        <p className="text-base text-muted-foreground">
          This link may be invalid or the poll may no longer exist.
        </p>
      </div>
      {/* Escape hatch so the 404 is never a dead end (UX-UAT F6). */}
      <div>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium hover:bg-muted"
        >
          Create a poll
        </Link>
      </div>
    </main>
  );
}
