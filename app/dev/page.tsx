"use client";

import { FormEvent, useEffect, useState } from "react";
import { Box, Button, Flex, Heading, HStack, Input, NativeSelect, Text, VStack } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faDatabase, faDownload, faLock, faRightFromBracket, faTriangleExclamation, faUpload, faUserShield } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";

type Backup = { filename: string; sizeBytes: number; createdAt: string };

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export default function DevConsolePage() {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  const [backups, setBackups] = useState<Backup[]>([]);
  const [creatingBackup, setCreatingBackup] = useState(false);

  const [restoreFilename, setRestoreFilename] = useState("");
  const [restoreConfirm, setRestoreConfirm] = useState("");
  const [restoring, setRestoring] = useState(false);

  const [cleanConfirm, setCleanConfirm] = useState("");
  const [cleaning, setCleaning] = useState(false);

  const [adminUsername, setAdminUsername] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  async function checkStatus() {
    try {
      const response = await fetch("/api/dev/status");
      const data = await response.json();
      setAuthenticated(Boolean(data.authenticated));
      if (data.authenticated) await loadBackups();
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    void checkStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadBackups() {
    const response = await fetch("/api/dev/backups");
    const data = await response.json();
    if (response.ok) setBackups(data.backups ?? []);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");
    setSigningIn(true);
    try {
      const response = await fetch("/api/dev/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setLoginError(data.error ?? "Unable to sign in.");
        return;
      }
      setPassword("");
      setAuthenticated(true);
      await loadBackups();
    } catch {
      setLoginError("Unable to reach the clinic server.");
    } finally {
      setSigningIn(false);
    }
  }

  async function logout() {
    await fetch("/api/dev/logout", { method: "POST" });
    setAuthenticated(false);
  }

  async function createBackup() {
    setCreatingBackup(true);
    try {
      const response = await fetch("/api/dev/backup", { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Backup failed.");
        return;
      }
      toast.success(`Backup created: ${data.filename}`);
      await loadBackups();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setCreatingBackup(false);
    }
  }

  async function restoreBackup() {
    if (!restoreFilename) {
      toast.error("Select a backup to restore.");
      return;
    }
    if (restoreConfirm !== "RESTORE") {
      toast.error('Type "RESTORE" to confirm.');
      return;
    }
    setRestoring(true);
    try {
      const response = await fetch("/api/dev/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: restoreFilename, confirm: restoreConfirm }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Restore failed.");
        return;
      }
      toast.success(`Database restored from ${restoreFilename}. A pre-restore safety backup was saved as ${data.safetyBackupFilename}.`);
      setRestoreConfirm("");
      await loadBackups();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setRestoring(false);
    }
  }

  async function cleanDatabase() {
    if (cleanConfirm !== "DELETE ALL DATA") {
      toast.error('Type "DELETE ALL DATA" to confirm.');
      return;
    }
    setCleaning(true);
    try {
      const response = await fetch("/api/dev/clean", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: cleanConfirm }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Clean failed.");
        return;
      }
      toast.success(`Database cleaned (${data.tablesCleared} tables). Safety backup saved as ${data.safetyBackupFilename}.`);
      setCleanConfirm("");
      await loadBackups();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setCleaning(false);
    }
  }

  async function createAdmin() {
    if (!adminUsername.trim()) {
      toast.error("Enter a username.");
      return;
    }
    if (adminPassword.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setCreatingAdmin(true);
    try {
      const response = await fetch("/api/dev/create-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: adminUsername.trim(), name: adminName.trim(), password: adminPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Unable to create the account.");
        return;
      }
      toast.success(`Management account "${data.user.username}" is ready.`);
      setAdminUsername("");
      setAdminName("");
      setAdminPassword("");
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setCreatingAdmin(false);
    }
  }

  if (checking) return null;

  if (!authenticated) {
    return (
      <Flex minH="100vh" bg="#12201e" color="#17252b" align="center" justify="center" px="4">
        <Box w="full" maxW="420px" bg="white" borderRadius="16px" border="1px solid #e1e9e6" p="10" boxShadow="0 20px 40px rgba(0,0,0,0.3)">
          <Flex w="48px" h="48px" bg="#fbecef" color="#a34258" borderRadius="12px" align="center" justify="center" mb="5">
            <FontAwesomeIcon icon={faUserShield} size="lg" />
          </Flex>
          <Heading size="lg" letterSpacing="-0.04em">Developer Console</Heading>
          <Text color="#6e8982" fontSize="sm" mt="2" mb="7">
            Restricted access. This is separate from staff logins.
          </Text>
          <form onSubmit={handleLogin}>
            <VStack align="stretch" gap="5">
              <Box>
                <Text fontSize="sm" fontWeight="700" mb="2">Developer Password</Text>
                <HStack border="1px solid #dbe5e1" borderRadius="8px" px="3" h="48px">
                  <FontAwesomeIcon icon={faLock} color="#77908b" />
                  <Input required type="password" variant="flushed" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter developer password" />
                </HStack>
              </Box>
              {loginError && <Text color="#a34258" bg="#fbecef" borderRadius="7px" px="3" py="2" fontSize="sm">{loginError}</Text>}
              <Button type="submit" loading={signingIn} bg="#123d3b" color="white" h="48px" borderRadius="8px" _hover={{ bg: "#255d58" }}>
                Enter <FontAwesomeIcon icon={faArrowRight} />
              </Button>
            </VStack>
          </form>
        </Box>
      </Flex>
    );
  }

  return (
    <Box minH="100vh" bg="#f5f7f8" color="#17252b">
      <Flex as="header" h="78px" bg="#123d3b" color="white" align="center" justify="space-between" px={{ base: "20px", md: "42px" }}>
        <HStack gap="3">
          <FontAwesomeIcon icon={faUserShield} />
          <Heading size="lg" letterSpacing="-0.04em" color="white">Developer Console</Heading>
        </HStack>
        <Button variant="ghost" color="white" _hover={{ bg: "#255d58" }} onClick={logout}>
          <FontAwesomeIcon icon={faRightFromBracket} />
          &nbsp; Exit Console
        </Button>
      </Flex>

      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }} maxW="720px">
        <Text bg="#fbecef" color="#a34258" fontSize="sm" fontWeight="700" px="4" py="3" borderRadius="8px" mb="8">
          <FontAwesomeIcon icon={faTriangleExclamation} />
          &nbsp; These tools operate directly on the live hospital database. Restore and Clean overwrite or erase real data.
        </Text>

        {/* Backup */}
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" p={{ base: "20px", md: "28px" }} mb="6">
          <HStack mb="5">
            <Flex w="36px" h="36px" bg="#e9f1ef" color="#126b68" borderRadius="9px" align="center" justify="center">
              <FontAwesomeIcon icon={faDownload} />
            </Flex>
            <Heading size="sm">Backup Database</Heading>
          </HStack>
          <Button size="sm" bg="#123d3b" color="white" _hover={{ bg: "#255d58" }} loading={creatingBackup} onClick={createBackup} mb="5">
            Create Backup Now
          </Button>
          <Text fontSize="xs" fontWeight="700" color="#607d76" mb="2" textTransform="uppercase" letterSpacing="0.04em">Existing Backups</Text>
          {backups.length === 0 ? (
            <Text fontSize="sm" color="#77908b">No backups yet.</Text>
          ) : (
            <VStack align="stretch" gap="1" maxH="220px" overflowY="auto">
              {backups.map((b) => (
                <Flex key={b.filename} justify="space-between" fontSize="xs" py="1.5" borderBottom="1px solid #f0f4f3">
                  <Text fontFamily="mono">{b.filename}</Text>
                  <HStack gap="3" color="#77908b">
                    <Text>{formatSize(b.sizeBytes)}</Text>
                    <Text>{new Date(b.createdAt).toLocaleString("en-PK")}</Text>
                  </HStack>
                </Flex>
              ))}
            </VStack>
          )}
        </Box>

        {/* Restore */}
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" p={{ base: "20px", md: "28px" }} mb="6">
          <HStack mb="5">
            <Flex w="36px" h="36px" bg="#fdf3e6" color="#b26732" borderRadius="9px" align="center" justify="center">
              <FontAwesomeIcon icon={faUpload} />
            </Flex>
            <Heading size="sm">Restore Database</Heading>
          </HStack>
          <Text fontSize="sm" color="#6e8982" mb="4">Replaces all current data with the selected backup. A safety backup of the current state is taken automatically first.</Text>
          <Box mb="3">
            <Text fontSize="sm" fontWeight="700" mb="2">Backup to Restore</Text>
            <NativeSelect.Root>
              <NativeSelect.Field value={restoreFilename} onChange={(e) => setRestoreFilename(e.target.value)}>
                <option value="">Select a backup…</option>
                {backups.map((b) => (
                  <option key={b.filename} value={b.filename}>{b.filename}</option>
                ))}
              </NativeSelect.Field>
            </NativeSelect.Root>
          </Box>
          <Box mb="4">
            <Text fontSize="sm" fontWeight="700" mb="2">Type &quot;RESTORE&quot; to confirm</Text>
            <Input value={restoreConfirm} onChange={(e) => setRestoreConfirm(e.target.value)} placeholder="RESTORE" />
          </Box>
          <Button size="sm" bg="#b26732" color="white" _hover={{ bg: "#96521f" }} loading={restoring} onClick={restoreBackup}>
            Restore Database
          </Button>
        </Box>

        {/* Clean */}
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" p={{ base: "20px", md: "28px" }} mb="6">
          <HStack mb="5">
            <Flex w="36px" h="36px" bg="#fbecef" color="#a34258" borderRadius="9px" align="center" justify="center">
              <FontAwesomeIcon icon={faTriangleExclamation} />
            </Flex>
            <Heading size="sm">Clean Database</Heading>
          </HStack>
          <Text fontSize="sm" color="#6e8982" mb="4">Erases all data from every table (schema stays intact). A safety backup is taken automatically first.</Text>
          <Box mb="4">
            <Text fontSize="sm" fontWeight="700" mb="2">Type &quot;DELETE ALL DATA&quot; to confirm</Text>
            <Input value={cleanConfirm} onChange={(e) => setCleanConfirm(e.target.value)} placeholder="DELETE ALL DATA" />
          </Box>
          <Button size="sm" bg="#a34258" color="white" _hover={{ bg: "#8a3549" }} loading={cleaning} onClick={cleanDatabase}>
            Clean Database
          </Button>
        </Box>

        {/* Create admin */}
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" p={{ base: "20px", md: "28px" }}>
          <HStack mb="5">
            <Flex w="36px" h="36px" bg="#e9f1ef" color="#126b68" borderRadius="9px" align="center" justify="center">
              <FontAwesomeIcon icon={faDatabase} />
            </Flex>
            <Heading size="sm">Create Management Account</Heading>
          </HStack>
          <Text fontSize="sm" color="#6e8982" mb="4">Creates a new MANAGEMENT-role account, or resets the password if the username already exists.</Text>
          <Box mb="3">
            <Text fontSize="sm" fontWeight="700" mb="2">Username</Text>
            <Input value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} placeholder="e.g. management" />
          </Box>
          <Box mb="3">
            <Text fontSize="sm" fontWeight="700" mb="2">Full Name (optional)</Text>
            <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Full name" />
          </Box>
          <Box mb="4">
            <Text fontSize="sm" fontWeight="700" mb="2">Password</Text>
            <Input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="At least 8 characters" />
          </Box>
          <Button size="sm" bg="#123d3b" color="white" _hover={{ bg: "#255d58" }} loading={creatingAdmin} onClick={createAdmin}>
            Create / Reset Account
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
