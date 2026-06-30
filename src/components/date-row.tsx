"use client";

// A single candidate-date row in the creation form (UI-SPEC Surface 1 "Date row
// structure"): native date input + native time input + a ghost remove button.
// Native <input type="date"> keeps values as 'YYYY-MM-DD' strings (timezone-safe,
// D-11/P3) — we never construct a Date from the value here. The only Date use is
// reading "now" for the non-blocking past-date warning.
import { useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type DateRowValue = {
  id: string;
  date: string;
  startTime: string;
};

function todayLocalIso(): string {
  // Local "now" only (NOT parsing a date-only string) — safe under D-11/P3.
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function DateRow({
  row,
  index,
  showRemove,
  disabled,
  shouldFocus,
  onChange,
  onRemove,
}: {
  row: DateRowValue;
  index: number;
  showRemove: boolean;
  disabled: boolean;
  shouldFocus: boolean;
  onChange: (patch: Partial<Pick<DateRowValue, "date" | "startTime">>) => void;
  onRemove: () => void;
}) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const position = index + 1; // 1-indexed for screen-reader labels

  useEffect(() => {
    if (shouldFocus) dateInputRef.current?.focus();
  }, [shouldFocus]);

  // Lexicographic compare on 'YYYY-MM-DD' strings — no Date parsing of the value.
  const isPast = row.date !== "" && row.date < todayLocalIso();

  const dateId = `date-${row.id}`;
  const timeId = `time-${row.id}`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <Label htmlFor={dateId} className="sr-only">
            Date {position}
          </Label>
          <Input
            ref={dateInputRef}
            id={dateId}
            type="date"
            className="h-11"
            value={row.date}
            disabled={disabled}
            onChange={(e) => onChange({ date: e.target.value })}
          />
        </div>
        <div className="flex-1">
          <Label htmlFor={timeId} className="sr-only">
            Start time for date {position} (optional)
          </Label>
          <Input
            id={timeId}
            type="time"
            className="h-11"
            placeholder="Start time (optional)"
            value={row.startTime}
            disabled={disabled}
            onChange={(e) => onChange({ startTime: e.target.value })}
          />
        </div>
        {showRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 text-muted-foreground hover:text-destructive"
            aria-label={`Remove date ${position}`}
            disabled={disabled}
            onClick={onRemove}
          >
            <Trash2 />
            <span className="sr-only">Remove date</span>
          </Button>
        ) : (
          // Preserve horizontal rhythm when the remove button is hidden.
          <div aria-hidden className="h-11 w-11 shrink-0" />
        )}
      </div>
      {isPast ? (
        <p className="text-amber-600 text-sm">This date is in the past</p>
      ) : null}
    </div>
  );
}
