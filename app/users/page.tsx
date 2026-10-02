"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Box, Button, Field, Flex, Grid, Heading, HStack, Input, Link, NativeSelect, Table, Text } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faGaugeHigh, faKey, faPlus, faShieldHalved, faUser, faXmark } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";

type User = {
  id: number;
  name: string | null;
  username: string;
  role: string;
  active: boolean;
  createdAt: string;
};

const emptyForm = { name: "", username: "", password: "", role: "OPERATOR" };

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [resettingId, setResettingId] = useState<number | null>(null);
  const [resetResult, setResetResult] = useState<{ user: string; password: string } | null>(null);

  async function loadUsers() {
    const response = await fetch("/api/users");
    const data = await response.json();
    if (response.ok) setUsers(data.users);
    else toast.error(data.error ?? "Unable to load users.");
  }

  useEffect(() => {
    async function loadInitial() {
      await loadUsers();
    }
    void loadInitial();
  }, []);

  function openAddModal() {
    setForm(emptyForm);
    setShowModal(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Unable to create user.");
        return;
      }
      toast.success(`${data.user.username} account created successfully.`);
      setForm(emptyForm);
      setShowModal(false);
      await loadUsers();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(user: User) {
    const response = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !user.active }),
    });
    const data = await response.json();
    if (!response.ok) toast.error(data.error ?? "Unable to update account.");
    else {
      toast.success(`${user.username} account is now ${data.user.active ? "active" : "inactive"}.`);
      await loadUsers();
    }
  }

  function confirmResetPassword(user: User) {
    toast.warn(
      ({ closeToast }) => (
        <Box>
          <Text fontSize="sm" fontWeight="700" mb="1">Reset {user.username}&apos;s password?</Text>
          <Text fontSize="xs" mb="3">
            They&apos;ll get a one-time password, be signed out everywhere, and must set a new password on next login.
          </Text>
          <HStack gap="2" justify="flex-end">
            <Button size="xs" variant="outline" onClick={closeToast}>Cancel</Button>
            <Button
              size="xs"
              bg="#a34258"
              color="white"
              _hover={{ bg: "#8a3549" }}
              onClick={() => {
                closeToast();
                void resetPassword(user);
              }}
            >
              Reset Password
            </Button>
          </HStack>
        </Box>
      ),
      // Stays open until the user picks an option; clicking the toast body must not dismiss it.
      { toastId: `reset-password-${user.id}`, autoClose: false, closeOnClick: false, draggable: false }
    );
  }

  async function resetPassword(user: User) {
    setResettingId(user.id);
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetPassword: true }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Unable to reset password.");
        return;
      }
      setResetResult({ user: user.username, password: data.temporaryPassword });
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setResettingId(null);
    }
  }

  const pageCount = Math.max(1, Math.ceil(users.length / pageSize));
  const visibleUsers = users.slice((page - 1) * pageSize, page * pageSize);
  const firstRecord = users.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRecord = Math.min(page * pageSize, users.length);

  return (
    <Box minH="100vh" bg="#eef2f0" color="#0e2420">
      {/* Header */}
      <Flex
        as="header"
        position="sticky"
        top="0"
        zIndex="40"
        h="72px"
        bg="rgba(255,255,255,0.90)"
        style={{ backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}
        borderBottom="1px solid rgba(14,36,32,0.07)"
        boxShadow="0 1px 0 rgba(14,36,32,0.04), 0 4px 20px rgba(14,36,32,0.04)"
        align="center"
        justify="space-between"
        px={{ base: "20px", md: "42px" }}
      >
        <HStack gap="4">
          <Link href="/" color="#2da08b" _hover={{ color: "#1a8070" }} transition="color 0.15s ease">
            <FontAwesomeIcon icon={faArrowLeft} />
          </Link>
          <Box>
            <Heading size="lg" letterSpacing="-0.04em" color="#0e2420">
              User Access
            </Heading>
          </Box>
        </HStack>
        <Button
          bg="linear-gradient(135deg, #1a8070 0%, #0f5a52 100%)"
          color="white"
          borderRadius="9px"
          fontWeight="700"
          boxShadow="0 3px 12px rgba(26,128,112,0.28)"
          _hover={{ boxShadow: "0 5px 20px rgba(26,128,112,0.42)", transform: "translateY(-1px)" }}
          _active={{ transform: "translateY(0)" }}
          transition="all 0.18s ease"
          onClick={openAddModal}
        >
          <FontAwesomeIcon icon={faPlus} />
          &nbsp; Create Staff Account
        </Button>
      </Flex>

      {/* Main Content */}
      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>
        {/* Staff Accounts Table */}
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="14px" boxShadow="0 2px 12px rgba(14,36,32,0.04)" overflow="hidden">
          <Box p="5" borderBottom="1px solid #edf2f0">
            <HStack justify="space-between">
              <HStack gap="3">
                <Flex w="34px" h="34px" bg="#e9f1ef" color="#126b68" borderRadius="9px" align="center" justify="center">
                  <FontAwesomeIcon icon={faShieldHalved} />
                </Flex>
                <Box>
                  <Heading size="sm">Staff Accounts</Heading>
                </Box>
              </HStack>
            </HStack>
          </Box>

          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg="#fafcfb">
                  <Table.ColumnHeader>Name / Username</Table.ColumnHeader>
                  <Table.ColumnHeader>Role</Table.ColumnHeader>
                  <Table.ColumnHeader>Created Date</Table.ColumnHeader>
                  <Table.ColumnHeader>Status</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Action</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {users.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={5}>
                      <Text py="8" textAlign="center" color="#77908b">
                        No user accounts found.
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  visibleUsers.map((user) => (
                    <Table.Row key={user.id} _hover={{ bg: "#f9fbfa" }}>
                      <Table.Cell>
                        <HStack gap="3">
                          <Flex w="28px" h="28px" bg="#f5f7f8" color="#126b68" borderRadius="full" align="center" justify="center">
                            <FontAwesomeIcon icon={faUser} size="xs" />
                          </Flex>
                          <Box>
                            <Text fontWeight="700">{user.name || user.username}</Text>
                            {user.name && <Text fontSize="xs" color="#77908b">{user.username}</Text>}
                          </Box>
                        </HStack>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge colorPalette={user.role === "MANAGEMENT" ? "purple" : user.role === "LAB" ? "teal" : user.role === "MEDICAL_STORE" ? "orange" : "blue"} borderRadius="full">
                          {user.role}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell fontSize="sm">{user.createdAt.slice(0, 10)}</Table.Cell>
                      <Table.Cell>
                        <Badge colorPalette={user.active ? "green" : "gray"} borderRadius="full">
                          {user.active ? "Active" : "Inactive"}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell textAlign="right">
                        <HStack gap="2" justify="flex-end">
                          <Button
                            size="xs"
                            variant="outline"
                            borderColor="#c8dad5"
                            color="#126b68"
                            loading={resettingId === user.id}
                            onClick={() => confirmResetPassword(user)}
                          >
                            <FontAwesomeIcon icon={faKey} />
                            &nbsp; Reset Password
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            borderColor="#d5dfdc"
                            color={user.active ? "#a34258" : "#22633e"}
                            onClick={() => void toggle(user)}
                          >
                            {user.active ? "Deactivate" : "Activate"}
                          </Button>
                        </HStack>
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table.Root>
          </Box>
          <Flex
            px="5"
            py="4"
            borderTop="1px solid #edf2f0"
            justify="space-between"
            align={{ base: "stretch", md: "center" }}
            direction={{ base: "column", md: "row" }}
            gap="3"
          >
            <Text fontSize="sm" color="#607d76">
              {users.length ? `Showing ${firstRecord}-${lastRecord} of ${users.length}` : "No records"}
            </Text>
            <HStack gap="2" flexWrap="wrap">
              <Text fontSize="sm" color="#607d76">Rows per page</Text>
              <NativeSelect.Root width="90px" size="sm">
                <NativeSelect.Field
                  value={String(pageSize)}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                >
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </NativeSelect.Field>
              </NativeSelect.Root>
              <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </Button>
              {Array.from({ length: pageCount }, (_, index) => index + 1).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={p === page ? "solid" : "outline"}
                  bg={p === page ? "#123d3b" : undefined}
                  color={p === page ? "white" : undefined}
                  onClick={() => setPage(p)}
                >
                  {p}
                </Button>
              ))}
              <Button size="sm" variant="outline" disabled={page === pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
                Next
              </Button>
            </HStack>
          </Flex>
        </Box>
      </Box>

      {/* Create Account Modal */}
      {showModal && (
        <Flex
          position="fixed"
          inset="0"
          bg="rgba(15, 30, 28, 0.55)"
          backdropFilter="blur(3px)"
          zIndex="100"
          align="center"
          justify="center"
          p="4"
        >
          <Box
            bg="white"
            borderRadius="16px"
            w="full"
            maxW="540px"
            boxShadow="0 20px 40px rgba(0,0,0,0.2)"
            overflow="hidden"
          >
            <Flex justify="space-between" align="center" px="28px" py="20px" bg="#123d3b" color="white">
              <HStack gap="3">
                <Flex w="36px" h="36px" bg="#d6e66c" color="#123d3b" borderRadius="10px" align="center" justify="center">
                  <FontAwesomeIcon icon={faShieldHalved} />
                </Flex>
                <Box>
                  <Heading size="sm">Create Staff Account</Heading>
                  <Text fontSize="xs" color="#a8c5bd">
                    Assign username, secure password, and role.
                  </Text>
                </Box>
              </HStack>
              <Button
                variant="ghost"
                color="white"
                _hover={{ bg: "#255d58" }}
                p="2"
                minW="auto"
                onClick={() => setShowModal(false)}
              >
                <FontAwesomeIcon icon={faXmark} size="lg" />
              </Button>
            </Flex>

            <form onSubmit={submit}>
              <Box p="28px" maxH="75vh" overflowY="auto">


                <Grid templateColumns="1fr" gap="5">
                  <Field.Root required>
                    <Field.Label fontWeight="700">Full Name</Field.Label>
                    <Input
                      placeholder="e.g. Ali Raza"
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label fontWeight="700">Username</Field.Label>
                    <Input
                      placeholder="e.g. frontdesk_ali"
                      value={form.username}
                      onChange={(event) => setForm({ ...form, username: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label fontWeight="700">Password</Field.Label>
                    <Input
                      type="password"
                      minLength={8}
                      placeholder="At least 8 characters"
                      value={form.password}
                      onChange={(event) => setForm({ ...form, password: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label fontWeight="700">Role</Field.Label>
                    <NativeSelect.Root>
                      <NativeSelect.Field
                        value={form.role}
                        onChange={(event) => setForm({ ...form, role: event.target.value })}
                      >
                        <option value="OPERATOR">Operator (Counter operations)</option>
                        <option value="LAB">Lab (View & upload test results)</option>
                        <option value="MEDICAL_STORE">Medical Store (Manage pharmacy stock & sales)</option>
                        <option value="MANAGEMENT">Management (Full access & reports)</option>
                      </NativeSelect.Field>
                    </NativeSelect.Root>
                  </Field.Root>
                </Grid>
              </Box>

              <Flex justify="flex-end" gap="3" px="28px" py="18px" bg="#f7faf9" borderTop="1px solid #e2e9e6">
                <Button variant="outline" borderColor="#c8dad5" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={saving} bg="#123d3b" color="white" _hover={{ bg: "#255d58" }}>
                  Create Account
                </Button>
              </Flex>
            </form>
          </Box>
        </Flex>
      )}

      {/* Password Reset Result */}
      {resetResult && (
        <Flex position="fixed" inset="0" bg="rgba(15, 30, 28, 0.55)" backdropFilter="blur(3px)" zIndex="100" align="center" justify="center" p="4">
          <Box bg="white" borderRadius="16px" w="full" maxW="440px" boxShadow="0 20px 40px rgba(0,0,0,0.2)" overflow="hidden">
            <Flex justify="space-between" align="center" px="28px" py="20px" bg="#123d3b" color="white">
              <HStack gap="3">
                <Flex w="36px" h="36px" bg="#d6e66c" color="#123d3b" borderRadius="10px" align="center" justify="center">
                  <FontAwesomeIcon icon={faKey} />
                </Flex>
                <Heading size="sm">Password Reset</Heading>
              </HStack>
              <Button variant="ghost" color="white" _hover={{ bg: "#255d58" }} p="2" minW="auto" onClick={() => setResetResult(null)}>
                <FontAwesomeIcon icon={faXmark} size="lg" />
              </Button>
            </Flex>
            <Box p="28px">
              <Text fontSize="sm" color="#556e68" mb="4">
                Give <strong>{resetResult.user}</strong> this one-time password. They&apos;ll be asked to set their own password the next time they sign in.
              </Text>
              <Box bg="#f5f7f8" border="1px solid #e1e9e6" borderRadius="8px" p="4" textAlign="center">
                <Text fontSize="xs" color="#77908b" textTransform="uppercase" letterSpacing="0.06em" mb="1">One-time password</Text>
                <Text fontSize="xl" fontWeight="800" color="#123d3b" fontFamily="mono">{resetResult.password}</Text>
              </Box>
            </Box>
            <Flex justify="flex-end" gap="3" px="28px" py="18px" bg="#f7faf9" borderTop="1px solid #e2e9e6">
              <Button bg="#123d3b" color="white" _hover={{ bg: "#255d58" }} onClick={() => setResetResult(null)}>
                Done
              </Button>
            </Flex>
          </Box>
        </Flex>
      )}
    </Box>
  );
}
