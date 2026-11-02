"use client";

import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

type DateInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "onChange" | "value" | "defaultValue"
> & {
  value?: string;
  defaultValue?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
};

const weekdays = ["L", "M", "X", "J", "V", "S", "D"];

function parseIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

function formatInputDate(value: string) {
  const date = parseIsoDate(value);
  return date
    ? `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`
    : "";
}

function parseDisplayDate(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return "";
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  return parseIsoDate(iso) ? iso : "";
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ className, name, value, defaultValue, onChange, onBlur, min, max, disabled, required, ...props }, ref) => {
    const hiddenRef = React.useRef<HTMLInputElement>(null);
    const initialValue = value ?? defaultValue ?? "";
    const [isoValue, setIsoValue] = React.useState(initialValue);
    const [displayValue, setDisplayValue] = React.useState(formatInputDate(initialValue));
    const [calendarOpen, setCalendarOpen] = React.useState(false);
    const selectedDate = parseIsoDate(isoValue);
    const [visibleMonth, setVisibleMonth] = React.useState(() => {
      const date = selectedDate ?? new Date();
      return new Date(date.getFullYear(), date.getMonth(), 1);
    });
    const calendarId = React.useId();
    const visibleInputRef = React.useRef<HTMLInputElement>(null);

    React.useImperativeHandle(ref, () => hiddenRef.current as HTMLInputElement);

    function updateValue(nextValue: string) {
      setIsoValue(nextValue);
      if (hiddenRef.current) {
        hiddenRef.current.value = nextValue;
        onChange?.({
          target: hiddenRef.current,
          currentTarget: hiddenRef.current
        } as React.ChangeEvent<HTMLInputElement>);
      }
    }

    function chooseDate(date: Date) {
      const nextValue = toIsoDate(date);
      setDisplayValue(formatInputDate(nextValue));
      setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
      updateValue(nextValue);
      setCalendarOpen(false);
    }

    const firstWeekday = (visibleMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
    const calendarDays = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, index) => {
      const day = index - firstWeekday + 1;
      return day > 0 && day <= daysInMonth
        ? new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day)
        : null;
    });

    return (
      <div className="relative">
        <div className="relative">
          <Input
            {...props}
            ref={visibleInputRef}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="dd/mm/aaaa"
            value={displayValue}
            disabled={disabled}
            required={required}
            aria-haspopup="dialog"
            aria-expanded={calendarOpen}
            aria-controls={calendarId}
            className={cn("pr-11", className)}
            onChange={(event) => {
              const nextDisplay = event.target.value.slice(0, 10);
              setDisplayValue(nextDisplay);
              const parsed = parseDisplayDate(nextDisplay);
              updateValue(parsed && (!min || parsed >= min) && (!max || parsed <= max) ? parsed : "");
            }}
            onBlur={onBlur}
            onKeyDown={(event) => {
              if (event.key === "Escape") setCalendarOpen(false);
              if (event.key === "ArrowDown" && !calendarOpen) {
                event.preventDefault();
                setCalendarOpen(true);
              }
            }}
          />
          <button
            type="button"
            aria-label="Abrir calendario"
            aria-controls={calendarId}
            aria-expanded={calendarOpen}
            disabled={disabled}
            onClick={() => setCalendarOpen((open) => !open)}
            className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center rounded-r-lg text-blue-300 transition hover:bg-slate-800 hover:text-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <input ref={hiddenRef} type="hidden" name={name} value={isoValue} />
        {calendarOpen && (
          <div
            id={calendarId}
            role="dialog"
            aria-label="Elegir fecha"
            className="absolute left-0 top-full z-30 mt-2 w-72 rounded-xl border border-slate-700 bg-slate-950 p-3 shadow-xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                aria-label="Mes anterior"
                onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-slate-800"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <p className="text-sm font-medium capitalize">
                {visibleMonth.toLocaleDateString("es-AR", { month: "long", year: "numeric" })}
              </p>
              <button
                type="button"
                aria-label="Mes siguiente"
                onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-slate-800"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="grid grid-cols-7 text-center text-xs text-muted-foreground">
              {weekdays.map((day, index) => <span key={`${day}-${index}`} className="py-2">{day}</span>)}
            </div>
            <div className="grid grid-cols-7 text-center">
              {calendarDays.map((date, index) => {
                if (!date) return <span key={`empty-${index}`} />;
                const dateValue = toIsoDate(date);
                const unavailable = Boolean((min && dateValue < min) || (max && dateValue > max));
                const isSelected = dateValue === isoValue;
                const isToday = dateValue === toIsoDate(new Date());
                return (
                  <button
                    key={dateValue}
                    type="button"
                    disabled={unavailable}
                    aria-label={date.toLocaleDateString("es-AR", { dateStyle: "long" })}
                    aria-pressed={isSelected}
                    onClick={() => chooseDate(date)}
                    className={cn(
                      "mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30",
                      isSelected && "bg-blue-500 font-semibold text-white hover:bg-blue-400",
                      isToday && !isSelected && "border border-blue-400/60 text-blue-200"
                    )}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }
);
DateInput.displayName = "DateInput";
