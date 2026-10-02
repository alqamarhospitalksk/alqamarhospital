"use client";

import { Box, Button, Flex, Heading, Text } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faHospital } from "@fortawesome/free-solid-svg-icons";
import { useRouter } from "next/navigation";

export default function NotFound() {
  const router = useRouter();

  return (
    <Flex
      minH="100vh"
      bg="linear-gradient(145deg, #0a1f1d 0%, #0f2e2b 45%, #133d38 100%)"
      color="#0e2420"
      align="center"
      justify="center"
      px="6"
      position="relative"
      overflow="hidden"
    >
      {/* Decorative glow orbs */}
      <Box
        position="absolute" top="-100px" right="-100px"
        w="500px" h="500px" borderRadius="full"
        bg="radial-gradient(circle, rgba(74,222,128,0.08) 0%, transparent 70%)"
        pointerEvents="none"
      />
      <Box
        position="absolute" bottom="-120px" left="-80px"
        w="600px" h="600px" borderRadius="full"
        bg="radial-gradient(circle, rgba(45,212,191,0.06) 0%, transparent 70%)"
        pointerEvents="none"
      />

      <Box
        textAlign="center"
        maxW="420px"
        bg="rgba(255,255,255,0.97)"
        borderRadius="24px"
        p={{ base: "40px 28px", md: "52px 48px" }}
        boxShadow="0 24px 72px rgba(14,36,32,0.30)"
        border="1px solid rgba(255,255,255,0.8)"
        position="relative"
        zIndex="1"
        style={{ animation: "slideInUp 0.45s ease both" }}
      >
        {/* Top gradient accent */}
        <Box
          position="absolute" top="0" left="0" right="0" h="3px"
          bgGradient="to-r" gradientFrom="#4ade80" gradientTo="#60a5fa"
          borderRadius="24px 24px 0 0"
        />

        <Flex
          w="64px" h="64px"
          bgGradient="to-br" gradientFrom="#4ade80" gradientTo="#2dd4bf"
          color="#0a2520"
          borderRadius="18px"
          align="center"
          justify="center"
          mx="auto"
          mb="6"
          boxShadow="0 8px 24px rgba(74,222,128,0.35)"
        >
          <FontAwesomeIcon icon={faHospital} size="lg" />
        </Flex>

        <Text
          fontSize="xs" color="#7a9e96" textTransform="uppercase"
          letterSpacing="0.14em" fontWeight="700" mb="2"
        >
          404 error
        </Text>
        <Heading size="xl" letterSpacing="-0.04em" mb="3" color="#0e2420">
          Page not found
        </Heading>
        <Text color="#6e8982" fontSize="sm" lineHeight="1.7" mb="8">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </Text>

        <Button
          h="46px" px="28px" borderRadius="10px"
          bg="linear-gradient(135deg, #1a8070 0%, #0f5a52 100%)"
          color="white" fontWeight="700"
          boxShadow="0 4px 16px rgba(26,128,112,0.30)"
          _hover={{ boxShadow: "0 6px 24px rgba(26,128,112,0.45)", transform: "translateY(-1px)" }}
          _active={{ transform: "translateY(0)" }}
          transition="all 0.2s ease"
          onClick={() => router.push("/")}
        >
          <FontAwesomeIcon icon={faArrowLeft} />
          &nbsp; Back to workspace
        </Button>
      </Box>
    </Flex>
  );
}
