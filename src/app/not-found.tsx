// Global 404 (UI-SPEC Surface 4). Reached via notFound() from the admin and
// participant routes when a token does not resolve (D-08 / LINK-01/02/03).
export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12 flex flex-col gap-2">
      <h1 className="text-3xl font-semibold leading-tight">Poll not found</h1>
      <p className="text-base text-muted-foreground">
        This link may be invalid or the poll may no longer exist.
      </p>
    </main>
  );
}
