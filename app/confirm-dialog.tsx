"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { Box, Button, Flex, Heading, Text } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleQuestion, faTriangleExclamation, faXmark } from "@fortawesome/free-solid-svg-icons";

type ConfirmOptions = {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  // "danger" for actions that can't be undone easily (discharge, remove, deactivate).
  tone?: "default" | "danger";
};

// The app's own replacement for window.confirm(): same look as the other dialogs, and it can be
// awaited the same way.
//   const [confirm, confirmDialog] = useConfirm();
//   if (!(await confirm({ title: "…", message: "…" }))) return;
//   …and render {confirmDialog} once in the page.
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((answer: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function close(answer: boolean) {
    resolver.current?.(answer);
    resolver.current = null;
    setOptions(null);
  }

  const danger = options?.tone === "danger";
  const dialog = options ? (
    <Flex position="fixed" inset="0" bg="rgba(15, 30, 28, 0.55)" backdropFilter="blur(3px)" zIndex="200" align="center" justify="center" p="4" onClick={() => close(false)}>
      <Box bg="white" borderRadius="16px" w="full" maxW="460px" boxShadow="0 20px 40px rgba(0,0,0,0.2)" overflow="hidden" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
        <Flex justify="space-between" align="center" px="24px" py="16px" bg="#123d3b" color="white">
          <Flex align="center" gap="3">
            <Flex w="34px" h="34px" bg={danger ? "#f6d6dd" : "#d6e66c"} color={danger ? "#a34258" : "#123d3b"} borderRadius="9px" align="center" justify="center">
              <FontAwesomeIcon icon={danger ? faTriangleExclamation : faCircleQuestion} />
            </Flex>
            <Heading size="sm">{options.title}</Heading>
          </Flex>
          <Button variant="ghost" color="white" _hover={{ bg: "#255d58" }} p="2" minW="auto" onClick={() => close(false)} aria-label="Close">
            <FontAwesomeIcon icon={faXmark} size="lg" />
          </Button>
        </Flex>
        <Box px="24px" py="20px">
          {typeof options.message === "string" ? <Text fontSize="sm" color="#3e5e58" lineHeight="1.6">{options.message}</Text> : options.message}
        </Box>
        <Flex justify="flex-end" gap="3" px="24px" py="14px" bg="#f7faf9" borderTop="1px solid #e2e9e6">
          <Button variant="outline" borderColor="#c8dad5" onClick={() => close(false)}>{options.cancelLabel ?? "Cancel"}</Button>
          <Button autoFocus bg={danger ? "#a34258" : "#123d3b"} color="white" _hover={{ bg: danger ? "#8a3549" : "#255d58" }} onClick={() => close(true)}>
            {options.confirmLabel ?? "Confirm"}
          </Button>
        </Flex>
      </Box>
    </Flex>
  ) : null;

  return [confirm, dialog] as const;
}
