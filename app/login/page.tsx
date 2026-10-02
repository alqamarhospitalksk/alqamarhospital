"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Flex, Heading, HStack, Input, Text, VStack } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faEye, faEyeSlash, faHospital, faLock, faUser } from "@fortawesome/free-solid-svg-icons";

type HospitalSettings = { name: string; logoDataUrl?: string | null };

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hospitalSettings, setHospitalSettings] = useState<HospitalSettings | null>(null);
  const [hospitalLoaded, setHospitalLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/hospital-settings")
      .then(async (response) => {
        if (response.ok) setHospitalSettings((await response.json()).settings);
      })
      .catch(() => undefined)
      .finally(() => setHospitalLoaded(true));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error ?? "Unable to sign in.");
        return;
      }

      router.replace(result.user?.mustChangePassword ? "/change-password" : "/");
      router.refresh();
    } catch {
      setError("Unable to reach the clinic server. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Flex minH="100vh" bg="#eef2f0" color="#17252b" align="stretch">
      {/* Hero panel */}
      <Box
        display={{ base: "none", md: "flex" }}
        flex="1"
        bg="linear-gradient(145deg, #0a1f1d 0%, #0f2e2b 40%, #133d38 70%, #1a5548 100%)"
        color="white"
        px="8vw"
        alignItems="center"
        position="relative"
        overflow="hidden"
      >
        {/* Decorative radial glow top-right */}
        <Box
          position="absolute" top="-80px" right="-80px"
          w="400px" h="400px" borderRadius="full"
          bg="radial-gradient(circle, rgba(74,222,128,0.09) 0%, transparent 70%)"
          pointerEvents="none"
        />
        {/* Decorative radial glow bottom-left */}
        <Box
          position="absolute" bottom="-120px" left="-60px"
          w="500px" h="500px" borderRadius="full"
          bg="radial-gradient(circle, rgba(45,212,191,0.07) 0%, transparent 70%)"
          pointerEvents="none"
        />
        <Box maxW="460px" position="relative" zIndex="1">
          <HStack gap="3" mb="10">
            {hospitalSettings?.logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={hospitalSettings.logoDataUrl}
                alt="Hospital logo"
                style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 13, objectFit: "contain", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}
              />
            ) : hospitalLoaded ? (
              <Flex
                w="46px" h="46px" flexShrink="0"
                bgGradient="to-br" gradientFrom="#4ade80" gradientTo="#2dd4bf"
                color="#0a2520" align="center" justify="center" borderRadius="13px"
                boxShadow="0 4px 20px rgba(74,222,128,0.4)"
              >
                <FontAwesomeIcon icon={faHospital} size="lg" />
              </Flex>
            ) : (
              <Box w="46px" h="46px" flexShrink="0" bg="whiteAlpha.200" borderRadius="13px" />
            )}
            <Box>
              <Text fontSize="xl" fontWeight="800" letterSpacing="-0.04em" color="#f0faf8">
                {hospitalSettings?.name || "CareLedger"}
              </Text>
              <Text fontSize="10px" color="rgba(194,216,212,0.6)" letterSpacing="0.08em" textTransform="uppercase">
                Hospital Management Suite
              </Text>
            </Box>
          </HStack>
          <Heading size="2xl" lineHeight="1.05" letterSpacing="-0.05em" mt="10px" color="#f0faf8">
            Every counter,{" "}
            <Box
              as="span"
              style={{
                background: "linear-gradient(135deg, #4ade80 0%, #2dd4bf 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              one clear record.
            </Box>
          </Heading>
          <Text color="rgba(194,216,212,0.75)" fontSize="lg" lineHeight="1.7" mt="6">
            A focused workspace for patient flow, diagnostics, billing, and hospital operations.
          </Text>
          {/* Feature pills */}
          <Flex flexWrap="wrap" gap="2" mt="8">
            {["OPD Management", "Lab & Diagnostics", "Billing & Reports", "Medical Store"].map((feat) => (
              <Box
                key={feat}
                px="3" py="1"
                borderRadius="full"
                bg="rgba(255,255,255,0.07)"
                border="1px solid rgba(255,255,255,0.12)"
                color="rgba(194,216,212,0.85)"
                fontSize="xs"
                fontWeight="500"
              >
                {feat}
              </Box>
            ))}
          </Flex>
        </Box>
      </Box>
      {/* Form panel */}
      <Flex
        flex="0 1 540px"
        px={{ base: "28px", sm: "72px" }}
        py={{ base: "56px", md: "80px" }}
        align="center"
        justify="center"
        bg="white"
        position="relative"
      >
        {/* Top gradient accent bar */}
        <Box
          position="absolute" top="0" left="0" right="0" h="3px"
          bgGradient="to-r" gradientFrom="#4ade80" gradientTo="#60a5fa"
        />
        <Box w="full" maxW="360px">
          {/* Mobile brand */}
          <Box display={{ base: "flex", md: "none" }} alignItems="center" gap="3" mb="52px">
            {hospitalSettings?.logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={hospitalSettings.logoDataUrl}
                alt="Hospital logo"
                style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 11, objectFit: "contain" }}
              />
            ) : hospitalLoaded ? (
              <Flex
                w="38px" h="38px" flexShrink="0"
                bgGradient="to-br" gradientFrom="#4ade80" gradientTo="#2dd4bf"
                color="#0a2520" align="center" justify="center" borderRadius="11px"
              >
                <FontAwesomeIcon icon={faHospital} />
              </Flex>
            ) : (
              <Box w="38px" h="38px" flexShrink="0" bg="#eef2f1" borderRadius="11px" />
            )}
            <Text fontSize="xl" fontWeight="800" color="#0e2420">{hospitalSettings?.name || "CareLedger"}</Text>
          </Box>

          {/* Badge */}
          <Flex
            display="inline-flex" align="center" gap="6px"
            px="3" py="1" borderRadius="full"
            bg="rgba(45,160,139,0.08)" border="1px solid rgba(45,160,139,0.18)"
            mb="4"
          >
            <Box w="6px" h="6px" borderRadius="full" bg="#4ade80" boxShadow="0 0 6px #4ade80" />
            <Text fontSize="10px" fontWeight="700" color="#1a8070" letterSpacing="0.08em" textTransform="uppercase">
              Secure staff access
            </Text>
          </Flex>

          <Heading size="xl" mt="1" letterSpacing="-0.04em" color="#0e2420">Welcome back</Heading>
          <Text color="#6e8982" fontSize="sm" mt="2" mb="9">Sign in to continue to your clinic workspace.</Text>

          <form onSubmit={handleSubmit}>
            <VStack align="stretch" gap="5">
              <Box>
                <Text fontSize="sm" fontWeight="700" mb="2" color="#1a3330">Username</Text>
                <HStack
                  border="1px solid #dbe5e1" borderRadius="10px" px="3" h="48px"
                  bg="#fafafa"
                  _focusWithin={{ borderColor: "#2da08b", boxShadow: "0 0 0 3px rgba(45,160,139,0.12)", bg: "white" }}
                  transition="all 0.18s ease"
                >
                  <FontAwesomeIcon icon={faUser} color="#9aada8" />
                  <Input required variant="flushed" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Enter your username" />
                </HStack>
              </Box>
              <Box>
                <Text fontSize="sm" fontWeight="700" mb="2" color="#1a3330">Password</Text>
                <HStack
                  border="1px solid #dbe5e1" borderRadius="10px" px="3" h="48px"
                  bg="#fafafa"
                  _focusWithin={{ borderColor: "#2da08b", boxShadow: "0 0 0 3px rgba(45,160,139,0.12)", bg: "white" }}
                  transition="all 0.18s ease"
                >
                  <FontAwesomeIcon icon={faLock} color="#9aada8" />
                  <Input required type={showPassword ? "text" : "password"} variant="flushed" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    minW="auto"
                    p="1"
                    color="#9aada8"
                    _hover={{ color: "#2da08b", bg: "transparent" }}
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
                  </Button>
                </HStack>
              </Box>
              {error && (
                <Box
                  bg="#fef2f2" border="1px solid rgba(220,38,38,0.2)"
                  borderLeft="3px solid #dc2626"
                  borderRadius="8px" px="3" py="2"
                >
                  <Text fontSize="sm" color="#b91c1c" fontWeight="500">{error}</Text>
                </Box>
              )}
              <Button
                type="submit"
                loading={isSubmitting}
                bg="linear-gradient(135deg, #1a8070 0%, #0f5a52 100%)"
                color="white"
                h="48px"
                borderRadius="10px"
                fontWeight="700"
                letterSpacing="0.02em"
                boxShadow="0 4px 16px rgba(26,128,112,0.35)"
                _hover={{ boxShadow: "0 6px 24px rgba(26,128,112,0.50)", transform: "translateY(-1px)" }}
                _active={{ transform: "translateY(0)", boxShadow: "0 2px 8px rgba(26,128,112,0.30)" }}
                transition="all 0.2s ease"
              >
                Sign in <FontAwesomeIcon icon={faArrowRight} />
              </Button>
            </VStack>
          </form>
          <Text color="#9aada8" fontSize="xs" textAlign="center" mt="12">
            Access is restricted to authorized clinic staff.
          </Text>
        </Box>
      </Flex>
    </Flex>
  );
}