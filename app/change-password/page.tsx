"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Flex, Heading, HStack, Input, Text, VStack } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faEye, faEyeSlash, faLock, faShieldHalved } from "@fortawesome/free-solid-svg-icons";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Unable to change password.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Unable to reach the clinic server. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Flex
      minH="100vh"
      bg="linear-gradient(145deg, #0a1f1d 0%, #0f2e2b 45%, #133d38 100%)"
      color="#0e2420" align="center" justify="center" px="4"
      position="relative" overflow="hidden"
    >
      <Box position="absolute" top="-80px" right="-80px" w="400px" h="400px" borderRadius="full"
        bg="radial-gradient(circle, rgba(74,222,128,0.09) 0%, transparent 70%)" pointerEvents="none" />
      <Box position="absolute" bottom="-100px" left="-60px" w="500px" h="500px" borderRadius="full"
        bg="radial-gradient(circle, rgba(45,212,191,0.07) 0%, transparent 70%)" pointerEvents="none" />

      <Box
        w="full" maxW="420px" bg="rgba(255,255,255,0.97)"
        borderRadius="20px" border="1px solid rgba(255,255,255,0.8)"
        p={{ base: "36px 24px", md: "48px 44px" }}
        boxShadow="0 24px 72px rgba(14,36,32,0.28)"
        position="relative" zIndex="1"
        style={{ animation: "slideInUp 0.4s ease both" }}
      >
        <Flex
          w="52px" h="52px"
          bgGradient="to-br" gradientFrom="#4ade80" gradientTo="#2dd4bf"
          color="#0a2520" borderRadius="14px" align="center" justify="center" mb="5"
          boxShadow="0 6px 20px rgba(74,222,128,0.35)"
        >
          <FontAwesomeIcon icon={faShieldHalved} size="lg" />
        </Flex>

        <Heading size="lg" letterSpacing="-0.04em" color="#0e2420">Set a new password</Heading>
        <Text color="#6e8982" fontSize="sm" mt="2" mb="7" lineHeight="1.7">
          You&apos;re signing in with a one-time password. Choose your own password to continue.
        </Text>
        <form onSubmit={handleSubmit}>
          <VStack align="stretch" gap="5">
            <Box>
              <Text fontSize="sm" fontWeight="700" mb="2" color="#1a3330">New Password</Text>
              <HStack
                border="1px solid rgba(14,36,32,0.12)" borderRadius="10px" px="3" h="48px" bg="#fafafa"
                _focusWithin={{ borderColor: "#2da08b", boxShadow: "0 0 0 3px rgba(45,160,139,0.12)", bg: "white" }}
                transition="all 0.18s ease"
              >
                <FontAwesomeIcon icon={faLock} color="#9aada8" />
                <Input required type={showNewPassword ? "text" : "password"} minLength={8} variant="flushed" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="At least 8 characters" />
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  minW="auto"
                  p="1"
                  color="#9aada8"
                  _hover={{ color: "#2da08b", bg: "transparent" }}
                  onClick={() => setShowNewPassword((v) => !v)}
                  aria-label={showNewPassword ? "Hide password" : "Show password"}
                >
                  <FontAwesomeIcon icon={showNewPassword ? faEyeSlash : faEye} />
                </Button>
              </HStack>
            </Box>
            <Box>
              <Text fontSize="sm" fontWeight="700" mb="2" color="#1a3330">Confirm New Password</Text>
              <HStack
                border="1px solid rgba(14,36,32,0.12)" borderRadius="10px" px="3" h="48px" bg="#fafafa"
                _focusWithin={{ borderColor: "#2da08b", boxShadow: "0 0 0 3px rgba(45,160,139,0.12)", bg: "white" }}
                transition="all 0.18s ease"
              >
                <FontAwesomeIcon icon={faLock} color="#9aada8" />
                <Input required type={showConfirmPassword ? "text" : "password"} minLength={8} variant="flushed" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Re-enter new password" />
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  minW="auto"
                  p="1"
                  color="#9aada8"
                  _hover={{ color: "#2da08b", bg: "transparent" }}
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  <FontAwesomeIcon icon={showConfirmPassword ? faEyeSlash : faEye} />
                </Button>
              </HStack>
            </Box>
            {error && (
              <Box bg="#fef2f2" border="1px solid rgba(220,38,38,0.2)" borderLeft="3px solid #dc2626" borderRadius="8px" px="3" py="2">
                <Text fontSize="sm" color="#b91c1c" fontWeight="500">{error}</Text>
              </Box>
            )}
            <Button
              type="submit" loading={isSubmitting}
              bg="linear-gradient(135deg, #1a8070 0%, #0f5a52 100%)"
              color="white" h="48px" borderRadius="10px" fontWeight="700"
              boxShadow="0 4px 16px rgba(26,128,112,0.32)"
              _hover={{ boxShadow: "0 6px 24px rgba(26,128,112,0.48)", transform: "translateY(-1px)" }}
              _active={{ transform: "translateY(0)" }}
              transition="all 0.2s ease"
            >
              Save &amp; Continue <FontAwesomeIcon icon={faArrowRight} />
            </Button>
          </VStack>
        </form>
      </Box>
    </Flex>
  );
}
