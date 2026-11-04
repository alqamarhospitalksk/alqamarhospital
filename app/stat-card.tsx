"use client";

import type { ReactNode } from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";

type StatCardProps = {
  label: string;
  value: ReactNode;
  icon: IconDefinition;
  color: string;
  valueColor?: string;
  footnote?: ReactNode;
  // Smaller text and padding, for pages that show many cards at once.
  compact?: boolean;
};

// The figure card used across the app: label and a tinted icon on top, the value, an optional note.
// Same layout as the dashboards' KPI tiles (app/dashboard-ui.tsx), so every page reads alike.
export function StatCard({ label, value, icon, color, valueColor = "#0e2420", footnote, compact = false }: StatCardProps) {
  return (
    <Box
      bg="white"
      border="1px solid #e1e9e6"
      borderRadius="14px"
      p={compact ? { base: "3.5", md: "4" } : { base: "4", md: "5" }}
      boxShadow="0 1px 2px rgba(14,36,32,0.04), 0 2px 12px rgba(14,36,32,0.035)"
      minW="0"
      display="flex"
      flexDirection="column"
      gap="2"
      transition="box-shadow 0.2s ease, border-color 0.2s ease"
      _hover={{ boxShadow: "0 6px 20px rgba(14,36,32,0.08)", borderColor: "#d3e0dc" }}
    >
      <Flex align="center" justify="space-between" gap="2">
        <Text fontSize="11px" color="#6b857f" textTransform="uppercase" letterSpacing="0.06em" fontWeight="700" lineClamp={2}>
          {label}
        </Text>
        <Flex w={compact ? "30px" : "34px"} h={compact ? "30px" : "34px"} flexShrink="0" bg={`${color}17`} color={color} borderRadius="10px" align="center" justify="center" fontSize="sm">
          <FontAwesomeIcon icon={icon} />
        </Flex>
      </Flex>
      <Text fontSize={compact ? { base: "lg", md: "xl" } : { base: "xl", md: "2xl" }} fontWeight="800" color={valueColor} letterSpacing="-0.02em" lineHeight="1.15" style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </Text>
      {footnote && (
        <Text fontSize="xs" color="#6b857f" mt="auto">
          {footnote}
        </Text>
      )}
    </Box>
  );
}
