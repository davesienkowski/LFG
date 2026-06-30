// Shared poll summary (UI-SPEC Surface 2/3): renders the optional description
// and location. Location is prefixed with a MapPin icon. Renders nothing when
// both are absent, so a title-only poll shows no empty summary block (POLL-02).
import { MapPin } from "lucide-react";

export function PollSummary({
  description,
  location,
}: {
  description: string | null;
  location: string | null;
}) {
  if (!description && !location) return null;
  return (
    <div className="flex flex-col gap-2">
      {description ? (
        <p className="text-base leading-relaxed whitespace-pre-line">
          {description}
        </p>
      ) : null}
      {location ? (
        <p className="flex items-center gap-2 text-base">
          <MapPin className="size-4 shrink-0" aria-hidden />
          {location}
        </p>
      ) : null}
    </div>
  );
}
