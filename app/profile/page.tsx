"use client";

import { useEffect, useState } from "react";
import { Box, Button, Flex, Heading, HStack, Input, Text } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faKey, faUser } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";

type Role = "OPERATOR" | "MANAGEMENT" | "LAB" | "MEDICAL_STORE";
type Me = { id: number; username: string; name: string | null; role: Role };

const roleLabels: Record<Role, string> = { OPERATOR: "Operator", MANAGEMENT: "Management", LAB: "Lab", MEDICAL_STORE: "Medical Store" };

export default function ProfilePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [profileName, setProfileName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(async (response) => {
      if (response.ok) {
        const data = await response.json();
        setMe(data.user);
        setProfileName(data.user?.name ?? "");
      }
    });
  }, []);

  async function saveProfile() {
    setSavingProfile(true);
    try {
      const response = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: profileName }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Unable to update profile.");
        return;
      }
      setMe((prev) => (prev ? { ...prev, name: data.user.name } : prev));
      toast.success("Profile updated.");
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword() {
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    setSavingPassword(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Unable to change password.");
        return;
      }
      toast.success("Password changed.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <Box minH="100vh" bg="#eef2f0" color="#0e2420">
      {/* Header */}
      <Flex
        as="header" h="72px"
        bg="rgba(255,255,255,0.90)" style={{ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
        borderBottom="1px solid rgba(14,36,32,0.07)"
        boxShadow="0 1px 0 rgba(14,36,32,0.05)"
        align="center" justify="space-between"
        px={{ base: "20px", md: "42px" }}
      >
        <Box>
          <Heading size="lg" letterSpacing="-0.04em" color="#0e2420">My Profile</Heading>
        </Box>
      </Flex>

      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }} maxW="600px">
        {/* Profile Details Card */}
        <Box
          bg="white" border="1px solid rgba(14,36,32,0.07)"
          borderRadius="16px" overflow="hidden"
          boxShadow="0 2px 12px rgba(14,36,32,0.05)"
          mb="6"
        >
          {/* Card header */}
          <Box px="28px" py="18px" borderBottom="1px solid rgba(14,36,32,0.05)" bg="#fafcfb">
            <HStack gap="3">
              <Flex
                w="36px" h="36px"
                bgGradient="to-br" gradientFrom="#2dd4bf" gradientTo="#4ade80"
                color="#0a2520" borderRadius="10px" align="center" justify="center"
                boxShadow="0 3px 10px rgba(45,212,191,0.25)"
              >
                <FontAwesomeIcon icon={faUser} />
              </Flex>
              <Heading size="sm" color="#0e2420">Profile Details</Heading>
            </HStack>
          </Box>

          <Box p={{ base: "20px", md: "28px" }}>
            <Box mb="4">
              <Text fontSize="sm" fontWeight="700" mb="2" color="#1a3330">Username</Text>
              <Input value={me?.username ?? ""} disabled bg="#f4f7f6" borderColor="rgba(14,36,32,0.1)" borderRadius="9px" color="#6e8982" />
            </Box>
            <Box mb="4">
              <Text fontSize="sm" fontWeight="700" mb="2" color="#1a3330">Role</Text>
              <Input value={me ? roleLabels[me.role] : ""} disabled bg="#f4f7f6" borderColor="rgba(14,36,32,0.1)" borderRadius="9px" color="#6e8982" />
            </Box>
            <Box mb="6">
              <Text fontSize="sm" fontWeight="700" mb="2" color="#1a3330">Full Name</Text>
              <Input
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Enter your full name"
                borderRadius="9px" borderColor="rgba(14,36,32,0.12)"
                _focus={{ borderColor: "#2da08b", boxShadow: "0 0 0 3px rgba(45,160,139,0.12)" }}
              />
            </Box>
            <Button
              size="sm"
              bg="linear-gradient(135deg, #1a8070 0%, #0f5a52 100%)"
              color="white" borderRadius="9px" fontWeight="700"
              boxShadow="0 3px 12px rgba(26,128,112,0.28)"
              _hover={{ boxShadow: "0 5px 18px rgba(26,128,112,0.42)", transform: "translateY(-1px)" }}
              _active={{ transform: "translateY(0)" }}
              transition="all 0.18s ease"
              loading={savingProfile} onClick={saveProfile}
            >
              Save Profile
            </Button>
          </Box>
        </Box>

        {/* Change Password Card */}
        <Box
          bg="white" border="1px solid rgba(14,36,32,0.07)"
          borderRadius="16px" overflow="hidden"
          boxShadow="0 2px 12px rgba(14,36,32,0.05)"
        >
          {/* Card header */}
          <Box px="28px" py="18px" borderBottom="1px solid rgba(14,36,32,0.05)" bg="#fafcfb">
            <HStack gap="3">
              <Flex
                w="36px" h="36px"
                bgGradient="to-br" gradientFrom="#f87171" gradientTo="#fb7185"
                color="white" borderRadius="10px" align="center" justify="center"
                boxShadow="0 3px 10px rgba(248,113,113,0.25)"
              >
                <FontAwesomeIcon icon={faKey} />
              </Flex>
              <Heading size="sm" color="#0e2420">Change Password</Heading>
            </HStack>
          </Box>

          <Box p={{ base: "20px", md: "28px" }}>
            <Box mb="4">
              <Text fontSize="sm" fontWeight="700" mb="2" color="#1a3330">Current Password</Text>
              <Input
                type="password" value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password"
                borderRadius="9px" borderColor="rgba(14,36,32,0.12)"
                _focus={{ borderColor: "#2da08b", boxShadow: "0 0 0 3px rgba(45,160,139,0.12)" }}
              />
            </Box>
            <Box mb="4">
              <Text fontSize="sm" fontWeight="700" mb="2" color="#1a3330">New Password</Text>
              <Input
                type="password" minLength={8} value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters"
                borderRadius="9px" borderColor="rgba(14,36,32,0.12)"
                _focus={{ borderColor: "#2da08b", boxShadow: "0 0 0 3px rgba(45,160,139,0.12)" }}
              />
            </Box>
            <Box mb="6">
              <Text fontSize="sm" fontWeight="700" mb="2" color="#1a3330">Confirm New Password</Text>
              <Input
                type="password" minLength={8} value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter new password"
                borderRadius="9px" borderColor="rgba(14,36,32,0.12)"
                _focus={{ borderColor: "#2da08b", boxShadow: "0 0 0 3px rgba(45,160,139,0.12)" }}
              />
            </Box>
            <Button
              size="sm"
              bg="linear-gradient(135deg, #c05070 0%, #8a2442 100%)"
              color="white" borderRadius="9px" fontWeight="700"
              boxShadow="0 3px 12px rgba(163,66,88,0.28)"
              _hover={{ boxShadow: "0 5px 18px rgba(163,66,88,0.42)", transform: "translateY(-1px)" }}
              _active={{ transform: "translateY(0)" }}
              transition="all 0.18s ease"
              loading={savingPassword} onClick={savePassword}
            >
              Change Password
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
