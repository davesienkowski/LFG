// Creation form route `/` (UI-SPEC Surface 1). RSC shell: centered single
// column, max-w-2xl, 48px vertical padding, "Create a poll" Display heading;
// the interactive form is a client component.
import { PollCreateForm } from "@/components/poll-create-form";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-semibold leading-tight mb-8">
        Create a poll
      </h1>
      <PollCreateForm />
    </main>
  );
}
