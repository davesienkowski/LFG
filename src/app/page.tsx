// Creation form route `/` (UI-SPEC Surface 1 / board 3a · 3a-m). RSC shell:
// centered single column, max-w-2xl. Desktop (3a) frames the title + form in a
// bordered card (rounded-2xl, --border, shadow-sm, 40/44px padding); mobile
// (3a-m) drops the card chrome to full-bleed so the client form's sticky
// `Create poll` footer can pin to the viewport edges. The interactive form is a
// client component.
import { PollCreateForm } from "@/components/poll-create-form";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <div className="sm:rounded-2xl sm:border sm:bg-card sm:px-11 sm:py-10 sm:shadow-sm">
        <h1 className="text-3xl font-semibold leading-tight mb-8">
          Create a poll
        </h1>
        <PollCreateForm />
      </div>
    </main>
  );
}
