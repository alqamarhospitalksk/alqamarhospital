"use client";
import { DateInput } from "./date-input";

import { HStack, Text } from "@chakra-ui/react";

// "YYYY-MM-DD" for a local date, shifted by `daysBack` days.
export function localDateString(daysBack = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// From / To pickers for the expense and payout ledgers, which show the last 90 days by default
// so a long-running hospital never loses older rows off the end of a "latest 50" list.
export function LedgerDateFilter({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  return (
    <HStack gap="2" flexWrap="wrap">
      <Text fontSize="sm" color="#607d76">From</Text>
      <DateInput size="sm" value={from} max={to} onChange={(event) => onChange(event.target.value, to)} w="150px" borderRadius="8px" bg="white" />
      <Text fontSize="sm" color="#607d76">to</Text>
      <DateInput size="sm" value={to} min={from} onChange={(event) => onChange(from, event.target.value)} w="150px" borderRadius="8px" bg="white" />
    </HStack>
  );
}
