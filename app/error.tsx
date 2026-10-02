"use client";

import { Box, Button, Heading, Text } from "@chakra-ui/react";

// Shown if a page crashes while it is running. The rest of the app keeps working.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Box minH="60vh" display="flex" flexDirection="column" alignItems="center" justifyContent="center" gap="3" p="8" textAlign="center">
      <Heading size="lg">Something went wrong</Heading>
      <Text color="#556e68" maxW="420px">
        This page could not be shown. Nothing you saved has been lost. Try again, and if it keeps happening, tell the person who manages this system.
      </Text>
      <Button onClick={reset} bg="#123d3b" color="white" _hover={{ bg: "#255d58" }}>Try again</Button>
    </Box>
  );
}
