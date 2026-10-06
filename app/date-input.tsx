"use client";

import { Box, HStack, Input, type InputProps } from "@chakra-ui/react";
import { useRef, useState } from "react";

// A native <input type="date"> shows mm/dd/yyyy or dd/mm/yyyy depending on the browser's and the
// operating system's language, which the page cannot change. These inputs always show and accept
// dd/mm/yyyy, and still hand back the usual "yyyy-mm-dd" value, so call sites work as before.

type ChangeLike = { target: { value: string } };

type DateInputProps = Omit<InputProps, "type" | "value" | "defaultValue" | "onChange" | "min" | "max"> & {
  value: string;
  onChange: (event: ChangeLike) => void;
  min?: string;
  max?: string;
};

function isoToDisplay(iso: string) {
  const [year, month, day] = (iso || "").slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : "";
}

// "dd/mm/yyyy" -> "yyyy-mm-dd", or "" when it is not a real calendar date.
function displayToIso(display: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display);
  if (!match) return "";
  const [, dd, mm, yyyy] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  const real = date.getFullYear() === Number(yyyy) && date.getMonth() === Number(mm) - 1 && date.getDate() === Number(dd);
  return real ? `${yyyy}-${mm}-${dd}` : "";
}

function maskTyped(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function DateInput({ value, onChange, min, max, w, width, minW, disabled, ...rest }: DateInputProps) {
  const [text, setText] = useState(isoToDisplay(value));
  const pickerRef = useRef<HTMLInputElement>(null);

  // Follow the parent's value (reset, loaded record, picker choice) but not while a half-typed
  // date is on screen that does not parse yet.
  const [seenValue, setSeenValue] = useState(value);
  if (seenValue !== value) {
    setSeenValue(value);
    if (displayToIso(text) !== (value || "")) setText(isoToDisplay(value));
  }

  const inRange = (iso: string) => (!min || iso >= min) && (!max || iso <= max);

  function handleTyped(raw: string) {
    const next = maskTyped(raw);
    setText(next);
    if (next === "") {
      onChange({ target: { value: "" } });
      return;
    }
    const iso = displayToIso(next);
    if (iso && inRange(iso)) onChange({ target: { value: iso } });
  }

  function handleBlur() {
    // Anything incomplete, impossible or out of range falls back to the last good value.
    const iso = displayToIso(text);
    if (text !== "" && !(iso && inRange(iso))) setText(isoToDisplay(value));
  }

  function openPicker() {
    const picker = pickerRef.current;
    if (!picker || disabled) return;
    try {
      picker.showPicker();
    } catch {
      picker.focus();
      picker.click();
    }
  }

  return (
    <Box position="relative" w={w ?? width ?? "100%"} minW={minW}>
      <Input
        {...rest}
        disabled={disabled}
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        maxLength={10}
        autoComplete="off"
        value={text}
        onChange={(event) => handleTyped(event.target.value)}
        onBlur={(event) => {
          handleBlur();
          rest.onBlur?.(event);
        }}
        pr="9"
      />
      <Box
        as="button"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ type: "button", "aria-label": "Pick a date" } as any)}
        position="absolute"
        right="2"
        top="50%"
        transform="translateY(-50%)"
        color="#77908b"
        cursor={disabled ? "not-allowed" : "pointer"}
        lineHeight="0"
        onClick={openPicker}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </Box>
      {/* Native picker, hidden: only used for its calendar popup. */}
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value || ""}
        min={min}
        max={max}
        onChange={(event) => {
          setText(isoToDisplay(event.target.value));
          onChange({ target: { value: event.target.value } });
        }}
        style={{ position: "absolute", right: 0, bottom: 0, width: 1, height: 1, opacity: 0, pointerEvents: "none", border: 0, padding: 0 }}
      />
    </Box>
  );
}

// Replacement for <input type="datetime-local">: dd/mm/yyyy date plus a time field.
// The value is the usual "yyyy-mm-ddThh:mm".
export function DateTimeInput({ value, onChange, ...rest }: Omit<DateInputProps, "min" | "max">) {
  const [date = "", time = ""] = (value || "").split("T");
  return (
    <HStack gap="2" w="100%">
      <DateInput
        {...rest}
        value={date}
        onChange={(event) => onChange({ target: { value: event.target.value ? `${event.target.value}T${time || "00:00"}` : "" } })}
      />
      <Input
        type="time"
        value={time}
        disabled={rest.disabled}
        w="130px"
        onChange={(event) => {
          if (date) onChange({ target: { value: `${date}T${event.target.value || "00:00"}` } });
        }}
      />
    </HStack>
  );
}
