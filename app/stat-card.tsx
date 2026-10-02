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

export function StatCard({ label, value, icon, color, valueColor = "#123d3b", footnote, compact = false }: StatCardProps) {
  return (
    <Box
      bg="white"
      border="1px solid #e1e9e6"
      borderRadius="14px"
      p={compact ? "4" : "5"}
      boxShadow="0 2px 10px rgba(14,36,32,0.03)"
      position="relative"
      overflow="hidden"
      _hover={{ transform: "translateY(-2px)", boxShadow: "0 8px 24px rgba(14,36,32,0.08)" }}
      transition="all 0.2s ease"
    >
      <Box position="absolute" top="0" left="0" right="0" h="3px" bg={color} />
      <Flex w={compact ? "30px" : "36px"} h={compact ? "30px" : "36px"} bg="#f5f7f8" color={color} borderRadius="9px" align="center" justify="center" mb={compact ? "2" : "3"} fontSize={compact ? "sm" : undefined}>
        <FontAwesomeIcon icon={icon} />
      </Flex>
      <Text fontSize={compact ? "11px" : "xs"} color="#77908b" textTransform="uppercase" letterSpacing="0.06em" mb="1" fontWeight="700">
        {label}
      </Text>
      <Text fontSize={compact ? "lg" : "2xl"} fontWeight="800" color={valueColor}>
        {value}
      </Text>
      {footnote && (
        <Text fontSize={compact ? "11px" : "xs"} color="#607d76" mt="1">
          {footnote}
        </Text>
      )}
    </Box>
  );
}
