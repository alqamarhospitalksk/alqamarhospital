"use client";

import type { ReactNode } from "react";
import { Box, Button, Flex, Heading, Text, type BoxProps } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDown, faArrowUp, type IconDefinition } from "@fortawesome/free-solid-svg-icons";

// Building blocks shared by the management dashboard (app/dashboard.tsx) and the front-desk
// dashboard (app/operator-dashboard.tsx), so both read as one product.

export const ink = {
  primary: "#0e2420",
  secondary: "#4b6862",
  muted: "#77908b",
  border: "#e1e9e6",
  hairline: "#edf2f0",
  wash: "#f5f8f7",
};

// Chart colours. Checked together for colour-blind separation and 3:1 contrast on white, so keep
// this order: teal is always the first (or only) series, violet the second, orange the third.
export const series = { teal: "#0f8f7f", violet: "#6d5bd0", orange: "#d0731f" };

// Reserved for meaning (good / needs attention / problem); always shown with an icon or a word.
export const status = { good: "#1f8a4c", warning: "#b7791f", critical: "#c0392b" };

export const chartTooltipStyle = {
  borderRadius: 10,
  border: `1px solid ${ink.border}`,
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(14,36,32,0.12)",
  background: "rgba(255,255,255,0.97)",
};
export const chartAxisTick = { fontSize: 11, fill: ink.muted };
export const chartGrid = "#e8eeec";

export const formatNumber = (value: number) => value.toLocaleString("en-PK", { maximumFractionDigits: 0 });
export const money = (value: number) => `PKR ${value.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
// Axis ticks: 1.5L (lakh) and 12K read better than 150,000 in a narrow column.
export const compactMoney = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 100000) return `${(value / 100000).toFixed(abs % 100000 === 0 ? 0 : 1)}L`;
  if (abs >= 1000) return `${(value / 1000).toFixed(abs % 1000 === 0 ? 0 : 1)}K`;
  return String(value);
};

// "PKR" in small muted type in front of the figure, so large amounts still fit narrow cards.
export function Money({ value, size = "2xl", color = ink.primary }: { value: number; size?: string; color?: string }) {
  return (
    <Text as="span" fontSize={size} fontWeight="800" color={color} letterSpacing="-0.02em" whiteSpace="nowrap">
      <Text as="span" fontSize="0.55em" fontWeight="700" color={ink.muted} mr="1" letterSpacing="0.02em">
        PKR
      </Text>
      {value.toLocaleString("en-PK", { maximumFractionDigits: 0 })}
    </Text>
  );
}

export function IconChip({ icon, color, size = "34px" }: { icon: IconDefinition; color: string; size?: string }) {
  return (
    <Flex w={size} h={size} flexShrink="0" borderRadius="10px" align="center" justify="center" bg={`${color}17`} color={color} fontSize="sm">
      <FontAwesomeIcon icon={icon} />
    </Flex>
  );
}

// Sticky page header: small label, title, one line of context on the left; controls on the right.
// On narrow screens the controls drop below the title.
export function DashboardHeader({ eyebrow, title, subtitle, actions }: { eyebrow: string; title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <Box
      as="header"
      position="sticky"
      top="0"
      zIndex="40"
      bg="rgba(255,255,255,0.9)"
      style={{ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
      borderBottom="1px solid rgba(14,36,32,0.07)"
    >
      <Flex maxW="1680px" mx="auto" px={{ base: "4", md: "6", xl: "8" }} py={{ base: "3", md: "4" }} gap="3" align={{ base: "stretch", md: "center" }} justify="space-between" direction={{ base: "column", md: "row" }}>
        <Box minW="0">
          <Text fontSize="11px" fontWeight="700" color={series.teal} textTransform="uppercase" letterSpacing="0.1em">
            {eyebrow}
          </Text>
          <Heading as="h1" fontSize={{ base: "xl", md: "2xl" }} letterSpacing="-0.03em" color={ink.primary} lineHeight="1.2">
            {title}
          </Heading>
          {subtitle && (
            <Text fontSize="sm" color={ink.secondary} mt="0.5">
              {subtitle}
            </Text>
          )}
        </Box>
        {actions && (
          <Flex gap="2" align="center" flexWrap="wrap" justify={{ base: "flex-start", md: "flex-end" }}>
            {actions}
          </Flex>
        )}
      </Flex>
    </Box>
  );
}

// The page body: one width limit and gutter for every dashboard section.
export function DashboardBody({ children }: { children: ReactNode }) {
  return (
    <Box as="main" maxW="1680px" mx="auto" px={{ base: "4", md: "6", xl: "8" }} py={{ base: "4", md: "6" }} display="flex" flexDirection="column" gap={{ base: "4", md: "5" }}>
      {children}
    </Box>
  );
}

// A row of mutually exclusive choices (period pickers). Scrolls sideways rather than wrapping on a phone.
export function Segmented<T extends string>({ options, value, onChange, size = "sm" }: { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void; size?: "xs" | "sm" }) {
  return (
    <Flex bg={ink.wash} border={`1px solid ${ink.border}`} borderRadius="10px" p="3px" gap="2px" maxW="100%" overflowX="auto" role="tablist">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Button
            key={option.value}
            role="tab"
            aria-selected={active}
            size={size}
            h={size === "xs" ? "26px" : "30px"}
            px={size === "xs" ? "2.5" : "3.5"}
            flexShrink="0"
            variant="ghost"
            borderRadius="8px"
            fontWeight={active ? "700" : "500"}
            bg={active ? "white" : "transparent"}
            color={active ? ink.primary : ink.secondary}
            boxShadow={active ? "0 1px 3px rgba(14,36,32,0.12)" : "none"}
            _hover={{ bg: active ? "white" : "rgba(255,255,255,0.6)", color: ink.primary }}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        );
      })}
    </Flex>
  );
}

export function Panel({ title, subtitle, icon, iconColor = series.teal, action, children, bodyPadding = true, ...rest }: { title: string; subtitle?: ReactNode; icon?: IconDefinition; iconColor?: string; action?: ReactNode; children: ReactNode; bodyPadding?: boolean } & Omit<BoxProps, "title">) {
  return (
    <Box bg="white" border={`1px solid ${ink.border}`} borderRadius="14px" boxShadow="0 1px 2px rgba(14,36,32,0.04)" minW="0" display="flex" flexDirection="column" {...rest}>
      <Flex align="center" justify="space-between" gap="3" px={{ base: "4", md: "5" }} pt="4" pb="3" flexWrap="wrap">
        <Flex align="center" gap="3" minW="0">
          {icon && <IconChip icon={icon} color={iconColor} size="32px" />}
          <Box minW="0">
            <Heading as="h2" fontSize="md" fontWeight="700" color={ink.primary} letterSpacing="-0.01em">
              {title}
            </Heading>
            {subtitle && (
              <Text fontSize="xs" color={ink.muted}>
                {subtitle}
              </Text>
            )}
          </Box>
        </Flex>
        {action}
      </Flex>
      <Box px={bodyPadding ? { base: "4", md: "5" } : "0"} pb={bodyPadding ? "4" : "0"} flex="1" minH="0">
        {children}
      </Box>
    </Box>
  );
}

export type Delta = { percent: number; label: string; upIsGood?: boolean } | null;

// A compact figure card: label + icon on top, the value, then an optional change badge or note.
export function KpiTile({ label, value, icon, color, hint, delta }: { label: string; value: ReactNode; icon: IconDefinition; color: string; hint?: ReactNode; delta?: Delta }) {
  return (
    <Box bg="white" border={`1px solid ${ink.border}`} borderRadius="14px" p={{ base: "3.5", md: "4" }} boxShadow="0 1px 2px rgba(14,36,32,0.04)" minW="0" display="flex" flexDirection="column" gap="2">
      <Flex align="center" justify="space-between" gap="2">
        <Text fontSize="11px" fontWeight="700" color={ink.muted} textTransform="uppercase" letterSpacing="0.06em" lineClamp={2}>
          {label}
        </Text>
        <IconChip icon={icon} color={color} size="30px" />
      </Flex>
      <Box fontSize={{ base: "xl", md: "2xl" }} fontWeight="800" color={ink.primary} letterSpacing="-0.02em" lineHeight="1.15" overflow="hidden" textOverflow="ellipsis">
        {value}
      </Box>
      {(delta || hint) && (
        <Flex align="center" gap="2" flexWrap="wrap" mt="auto">
          {delta && <DeltaBadge delta={delta} />}
          {hint && (
            <Text fontSize="xs" color={ink.muted}>
              {hint}
            </Text>
          )}
        </Flex>
      )}
    </Box>
  );
}

export function DeltaBadge({ delta }: { delta: NonNullable<Delta> }) {
  const up = delta.percent >= 0;
  const good = delta.upIsGood === false ? !up : up;
  const color = delta.percent === 0 ? ink.secondary : good ? status.good : status.critical;
  return (
    <Flex align="center" gap="1" fontSize="xs" fontWeight="700" color={color} bg={`${color}14`} px="1.5" py="0.5" borderRadius="6px" whiteSpace="nowrap" title={delta.label}>
      {delta.percent !== 0 && <FontAwesomeIcon icon={up ? faArrowUp : faArrowDown} style={{ fontSize: 9 }} />}
      {Math.abs(delta.percent).toFixed(Math.abs(delta.percent) < 10 ? 1 : 0)}%
      <Text as="span" fontWeight="500" color={ink.muted}>
        {delta.label}
      </Text>
    </Flex>
  );
}

export type RankedRow = { key: string; label: string; value: number; display: string; note?: string };

// Horizontal bars for comparing categories (services, doctors). Every bar is the same colour:
// the length already shows the size, and the label beside it names the row.
export function RankedBars({ rows, color = series.teal, emptyText }: { rows: RankedRow[]; color?: string; emptyText: string }) {
  if (rows.length === 0) return <EmptyState text={emptyText} />;
  const max = Math.max(...rows.map((row) => row.value), 0) || 1;
  return (
    <Flex direction="column" gap="3">
      {rows.map((row) => (
        <Box key={row.key} title={`${row.label}: ${row.display}${row.note ? ` (${row.note})` : ""}`} _hover={{ "& .bar": { opacity: 1 } }}>
          <Flex justify="space-between" align="baseline" gap="3" mb="1">
            <Text fontSize="sm" color={ink.primary} fontWeight="500" lineClamp={1}>
              {row.label}
            </Text>
            <Flex align="baseline" gap="2" flexShrink="0">
              <Text fontSize="sm" fontWeight="700" color={ink.primary} style={{ fontVariantNumeric: "tabular-nums" }}>
                {row.display}
              </Text>
              {row.note && (
                <Text fontSize="xs" color={ink.muted} minW="34px" textAlign="right" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {row.note}
                </Text>
              )}
            </Flex>
          </Flex>
          <Box h="6px" bg={ink.hairline} borderRadius="4px" overflow="hidden">
            <Box className="bar" h="100%" w={`${Math.max(2, (Math.max(row.value, 0) / max) * 100)}%`} bg={color} borderRadius="4px" opacity={0.85} transition="opacity 0.15s ease, width 0.4s ease" />
          </Box>
        </Box>
      ))}
    </Flex>
  );
}

export function EmptyState({ text, py = "10" }: { text: string; py?: string }) {
  return (
    <Flex py={py} align="center" justify="center" textAlign="center" color={ink.muted} fontSize="sm" border={`1px dashed ${ink.border}`} borderRadius="10px" bg={ink.wash}>
      {text}
    </Flex>
  );
}

// A label/value line inside a panel (lists of figures).
export function StatLine({ label, value, icon, color = ink.secondary, strong = false }: { label: ReactNode; value: ReactNode; icon?: IconDefinition; color?: string; strong?: boolean }) {
  return (
    <Flex align="center" justify="space-between" gap="3" py="2.5" borderTop={`1px solid ${ink.hairline}`} _first={{ borderTop: "none", pt: "0.5" }}>
      <Flex align="center" gap="2.5" minW="0">
        {icon && (
          <Box w="16px" textAlign="center" color={color} fontSize="sm" flexShrink="0">
            <FontAwesomeIcon icon={icon} />
          </Box>
        )}
        <Text fontSize="sm" color={strong ? ink.primary : ink.secondary} fontWeight={strong ? "700" : "500"} lineClamp={1}>
          {label}
        </Text>
      </Flex>
      <Box fontSize="sm" fontWeight={strong ? "800" : "700"} color={ink.primary} flexShrink="0" textAlign="right" style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </Box>
    </Flex>
  );
}

// Chart area that grows with the window height, so the main charts fit a laptop screen and use a big monitor.
export function ChartBox({ children, min = 220, vh = 34, max = 380 }: { children: ReactNode; min?: number; vh?: number; max?: number }) {
  return (
    // Recharts sets the tick size as an SVG attribute, which the app's global font size overrides.
    <Box h={`clamp(${min}px, ${vh}vh, ${max}px)`} w="100%" minW="0" css={{ "& .recharts-cartesian-axis-tick-value": { fontSize: "11px" } }}>
      {children}
    </Box>
  );
}
