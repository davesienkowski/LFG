"use client";

// Month-calendar multi-select for candidate dates (UI-SPEC delta 01-04 / POLL-05).
//
// Replaces the repeating "Add date" rows. A two-pane picker: a month calendar
// (mode="multiple", past days disabled) on the left; a Default-start-time +
// "Apply to all" control and a chronologically-sorted Selected-dates list (each
// with an optional start time + remove) on the right. It owns selection state and
// emits the serialized [{date, startTime|null}] payload upward via onChange — the
// SAME shape the createPoll action already consumes (no action/schema change).
//
// Timezone safety (D-11 / P3 / PLAT-04, input layer): selection is held as the
// user's clicked `Date` objects; the date STRING is built only via
// toLocalDateString (local getters, never toISOString/UTC). The past-day boundary
// is local midnight today, built from local components — never a parsed string.
import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  toLocalDateString,
  buildDatesPayload,
  applyTimeToAll,
  type DatePayloadEntry,
} from "@/lib/date-input";
import { formatDateOnly } from "@/lib/format-date";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CalendarDatePicker({
  disabled = false,
  onChange,
}: {
  disabled?: boolean;
  onChange: (dates: DatePayloadEntry[]) => void;
}) {
  const [days, setDays] = useState<Date[]>([]);
  const [times, setTimes] = useState<Record<string, string>>({});
  const [defaultTime, setDefaultTime] = useState("");

  // Local midnight today — built from LOCAL components (never a parsed string) so
  // the disabled-past boundary is correct under any timezone (P-pastghost / P3).
  const pastBoundary = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  // Sorted, de-duplicated payload — single source of truth for both the rendered
  // list and the emitted value (so the label can never disagree with the data).
  const sorted = useMemo(() => buildDatesPayload(days, times), [days, times]);

  useEffect(() => {
    onChange(sorted);
  }, [sorted, onChange]);

  function handleSelect(next: Date[] | undefined) {
    const nextDays = next ?? [];
    setDays(nextDays);
    // Drop time entries for days that were just removed.
    setTimes((prev) => {
      const keep: Record<string, string> = {};
      for (const d of nextDays) {
        const key = toLocalDateString(d);
        if (key in prev) keep[key] = prev[key];
      }
      return keep;
    });
  }

  function removeDate(date: string) {
    setDays((prev) => prev.filter((d) => toLocalDateString(d) !== date));
    setTimes((prev) => {
      const rest = { ...prev };
      delete rest[date];
      return rest;
    });
  }

  function setDateTime(date: string, value: string) {
    setTimes((prev) => ({ ...prev, [date]: value }));
  }

  function applyToAll() {
    setTimes(applyTimeToAll(days, defaultTime));
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
      {/* Left pane — calendar */}
      <div className="shrink-0">
        <Calendar
          mode="multiple"
          selected={days}
          onSelect={handleSelect}
          disabled={disabled ? () => true : { before: pastBoundary }}
          className="rounded-md border"
        />
      </div>

      {/* Right pane — default time + selected dates */}
      <div className="flex flex-1 flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="default-start-time">Default start time</Label>
          <div className="flex items-center gap-2">
            <Input
              id="default-start-time"
              type="time"
              className="h-11 flex-1"
              value={defaultTime}
              disabled={disabled}
              onChange={(e) => setDefaultTime(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={disabled || days.length === 0}
              onClick={applyToAll}
            >
              Apply to all
            </Button>
          </div>
        </div>

        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold">
            Selected dates ({sorted.length})
          </h3>

          {sorted.length === 0 ? (
            <p className="text-muted-foreground mt-2 text-sm">
              Pick days on the calendar to add candidate dates.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {sorted.map((entry) => {
                const label = formatDateOnly(entry.date);
                const timeId = `time-${entry.date}`;
                return (
                  <li key={entry.date} className="flex items-center gap-2">
                    <span className="flex-1 text-sm">{label}</span>
                    <Label htmlFor={timeId} className="sr-only">
                      Start time for {label} (optional)
                    </Label>
                    <Input
                      id={timeId}
                      type="time"
                      className="h-10 w-32"
                      value={times[entry.date] ?? ""}
                      disabled={disabled}
                      onChange={(e) => setDateTime(entry.date, e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${label}`}
                      disabled={disabled}
                      onClick={() => removeDate(entry.date)}
                    >
                      <Trash2 />
                      <span className="sr-only">Remove {label}</span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
