"use client";

import { FormEvent, useEffect, useState } from "react";
import { Badge, Box, Button, Field, Flex, Grid, Heading, HStack, Input, Link, NativeSelect, Table, Text } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faPen, faPlus, faUserTie, faXmark } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";
import { getPaymentCycleInfo, type PaymentCycleStatus } from "../../lib/payment-cycle";

const paymentStatusCopy: Record<PaymentCycleStatus, { label: string; palette: string }> = {
  not_set: { label: "Not set", palette: "gray" },
  paid: { label: "Paid this month", palette: "green" },
  due_today: { label: "Due today", palette: "orange" },
  overdue: { label: "Overdue", palette: "red" },
  upcoming: { label: "Upcoming", palette: "blue" },
};

function formatMobileInput(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("923") && digits.length >= 11) {
    digits = "0" + digits.slice(2);
  }
  digits = digits.slice(0, 11);
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

function isValidMobile(mobile: string) {
  return /^03\d{2}-\d{7}$/.test(mobile);
}

function ordinal(day: number) {
  if (day % 10 === 1 && day !== 11) return `${day}st`;
  if (day % 10 === 2 && day !== 12) return `${day}nd`;
  if (day % 10 === 3 && day !== 13) return `${day}rd`;
  return `${day}th`;
}

type Employee = {
  id: number;
  name: string;
  designation: string;
  contact: string | null;
  joiningDate: string | null;
  monthlySalary: string;
  paymentCycleDay: number | null;
  active: boolean;
  lastSalaryPayoutAt: string | null;
  lastSalaryPayoutAmount: number | null;
};

const emptyForm = { name: "", designation: "", contact: "", joiningDate: "", monthlySalary: "", paymentCycleDay: "" };

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  async function load() {
    const response = await fetch("/api/employees?includeInactive=1");
    const result = await response.json().catch(() => ({ error: "Unable to read the employees response." }));
    if (response.ok) setEmployees(result.employees);
    else toast.error(result.error ?? "Unable to load employees.");
  }

  useEffect(() => {
    void load();
  }, []);

  function openAddModal() {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEditModal(employee: Employee) {
    setEditingId(employee.id);
    setForm({
      name: employee.name,
      designation: employee.designation,
      contact: employee.contact ?? "",
      joiningDate: employee.joiningDate ? employee.joiningDate.slice(0, 10) : "",
      monthlySalary: employee.monthlySalary,
      paymentCycleDay: employee.paymentCycleDay ? String(employee.paymentCycleDay) : "",
    });
    setShowModal(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (form.contact && !isValidMobile(form.contact)) {
      toast.error("Invalid mobile number. Expected format: 0300-5676121.");
      return;
    }

    setSaving(true);
    try {
      const url = editingId ? `/api/employees/${editingId}` : "/api/employees";
      const method = editingId ? "PATCH" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          monthlySalary: Number(form.monthlySalary),
          paymentCycleDay: form.paymentCycleDay ? Number(form.paymentCycleDay) : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Unable to save employee.");
        return;
      }
      toast.success(editingId ? `Details for ${data.employee.name} updated successfully.` : `${data.employee.name} added to employee records.`);
      setForm(emptyForm);
      setEditingId(null);
      setShowModal(false);
      await load();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(employee: Employee) {
    const nextActive = !employee.active;
    if (!nextActive && !window.confirm(`Deactivate ${employee.name}? They'll no longer be selectable for new payouts, but existing payout history is kept.`)) return;
    setTogglingId(employee.id);
    try {
      const response = await fetch(`/api/employees/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Unable to update employee.");
        return;
      }
      toast.success(nextActive ? `${employee.name} reactivated.` : `${employee.name} deactivated.`);
      await load();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setTogglingId(null);
    }
  }

  const pageCount = Math.max(1, Math.ceil(employees.length / pageSize));
  const visibleEmployees = employees.slice((page - 1) * pageSize, page * pageSize);
  const firstRecord = employees.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRecord = Math.min(page * pageSize, employees.length);

  return (
    <Box minH="100vh" bg="#eef2f0" color="#0e2420">
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
              Employees
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
          &nbsp; Register Employee
        </Button>
      </Flex>

      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="14px" boxShadow="0 2px 12px rgba(14,36,32,0.04)" overflow="hidden">
          <Box px="24px" py="20px" borderBottom="1px solid #edf2f0">
            <HStack gap="3">
              <Flex w="34px" h="34px" bg="#e9f1ef" color="#126b68" borderRadius="9px" align="center" justify="center">
                <FontAwesomeIcon icon={faUserTie} />
              </Flex>
              <Heading size="sm">Employee Register</Heading>
            </HStack>
          </Box>
          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg="#fafcfb">
                  <Table.ColumnHeader>Employee</Table.ColumnHeader>
                  <Table.ColumnHeader>Contact</Table.ColumnHeader>
                  <Table.ColumnHeader>Monthly Salary</Table.ColumnHeader>
                  <Table.ColumnHeader>Payment Cycle</Table.ColumnHeader>
                  <Table.ColumnHeader>Payment Status</Table.ColumnHeader>
                  <Table.ColumnHeader>Status</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Actions</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {employees.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={7}>
                      <Text py="8" textAlign="center" color="#77908b">
                        No employees registered yet.
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  visibleEmployees.map((employee) => {
                    const cycleInfo = getPaymentCycleInfo(employee.paymentCycleDay, Number(employee.monthlySalary), employee.joiningDate, employee.lastSalaryPayoutAt, undefined, employee.lastSalaryPayoutAmount);
                    const cycleCopy = paymentStatusCopy[cycleInfo.status];
                    return (
                    <Table.Row key={employee.id} _hover={{ bg: "#f9fbfa" }} opacity={employee.active ? 1 : 0.6}>
                      <Table.Cell>
                        <Text fontWeight="700" fontSize="sm">{employee.name}</Text>
                        <Text color="#77908b" fontSize="xs">{employee.designation}</Text>
                      </Table.Cell>
                      <Table.Cell fontSize="sm">{employee.contact ?? "—"}</Table.Cell>
                      <Table.Cell fontWeight="800" color="#126b68">PKR {employee.monthlySalary}</Table.Cell>
                      <Table.Cell fontSize="sm">
                        {employee.paymentCycleDay ? `${ordinal(employee.paymentCycleDay)} of the month` : "Not set"}
                      </Table.Cell>
                      <Table.Cell>
                        <Badge colorPalette={cycleCopy.palette} borderRadius="full">
                          {cycleCopy.label}
                          {cycleInfo.status === "overdue" && cycleInfo.daysUntilDue !== null ? ` (${Math.abs(cycleInfo.daysUntilDue)}d)` : ""}
                          {cycleInfo.status === "upcoming" && cycleInfo.daysUntilDue !== null ? ` (${cycleInfo.daysUntilDue}d)` : ""}
                        </Badge>
                        {cycleInfo.proration && (
                          <Text fontSize="10px" color="#a0aeaa" mt="1">
                            Prorated: {cycleInfo.proration.daysWorked}/{cycleInfo.proration.totalDaysInCycle} days (PKR {cycleInfo.amountDue})
                          </Text>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <Badge colorPalette={employee.active ? "green" : "gray"} borderRadius="full">
                          {employee.active ? "Active" : "Inactive"}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell textAlign="right">
                        <HStack gap="2" justify="flex-end">
                          <Button
                            size="xs"
                            variant="outline"
                            borderColor="#c8dad5"
                            color="#126b68"
                            _hover={{ bg: "#eef6f4" }}
                            onClick={() => openEditModal(employee)}
                          >
                            <FontAwesomeIcon icon={faPen} />
                            &nbsp; Edit
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            borderColor={employee.active ? "#e3b8b8" : "#c8dad5"}
                            color={employee.active ? "#a34242" : "#22633e"}
                            loading={togglingId === employee.id}
                            onClick={() => void toggleActive(employee)}
                          >
                            {employee.active ? "Deactivate" : "Reactivate"}
                          </Button>
                        </HStack>
                      </Table.Cell>
                    </Table.Row>
                    );
                  })
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
              {employees.length ? `Showing ${firstRecord}-${lastRecord} of ${employees.length}` : "No records"}
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

      {showModal && (
        <Flex position="fixed" inset="0" bg="rgba(15, 30, 28, 0.55)" backdropFilter="blur(3px)" zIndex="100" align="center" justify="center" p="4">
          <Box bg="white" borderRadius="16px" w="full" maxW="580px" boxShadow="0 20px 40px rgba(0,0,0,0.2)" overflow="hidden">
            <Flex justify="space-between" align="center" px="28px" py="20px" bg="#123d3b" color="white">
              <HStack gap="3">
                <Flex w="36px" h="36px" bg="#d6e66c" color="#123d3b" borderRadius="10px" align="center" justify="center">
                  <FontAwesomeIcon icon={editingId ? faPen : faUserTie} />
                </Flex>
                <Box>
                  <Heading size="sm">{editingId ? "Edit Employee Record" : "Register Clinic Employee"}</Heading>
                  <Text fontSize="xs" color="#a8c5bd">
                    Salaries can be disbursed from the Payouts module.
                  </Text>
                </Box>
              </HStack>
              <Button variant="ghost" color="white" _hover={{ bg: "#255d58" }} p="2" minW="auto" onClick={() => setShowModal(false)}>
                <FontAwesomeIcon icon={faXmark} size="lg" />
              </Button>
            </Flex>

            <form onSubmit={submit}>
              <Box p="28px" maxH="75vh" overflowY="auto">
                <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap="5">
                  <Field.Root required>
                    <Field.Label fontWeight="700">Employee Name</Field.Label>
                    <Input placeholder="e.g. Tariq Mahmood" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label fontWeight="700">Designation</Field.Label>
                    <Input placeholder="e.g. Senior Nurse / Receptionist" value={form.designation} onChange={(event) => setForm({ ...form, designation: event.target.value })} />
                  </Field.Root>

                  <Field.Root gridColumn={{ md: "span 2" }}>
                    <Field.Label fontWeight="700">Contact Number</Field.Label>
                    <Input
                      placeholder="0300-5676121"
                      maxLength={12}
                      value={form.contact}
                      onChange={(event) => setForm({ ...form, contact: formatMobileInput(event.target.value) })}
                      borderColor={form.contact && !isValidMobile(form.contact) ? "#e53e3e" : undefined}
                    />
                    {form.contact && !isValidMobile(form.contact) ? (
                      <Text fontSize="xs" color="#e53e3e" mt="1" fontWeight="500">
                        Invalid mobile number. Format must be 0300-5676121 (11 digits starting with 03).
                      </Text>
                    ) : (
                      <Text fontSize="xs" color="#77908b" mt="1">
                        Format: 0300-5676121 (Pakistani mobile number)
                      </Text>
                    )}
                  </Field.Root>

                  <Field.Root>
                    <Field.Label fontWeight="700">Joining Date</Field.Label>
                    <Input type="date" value={form.joiningDate} onChange={(event) => setForm({ ...form, joiningDate: event.target.value })} />
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label fontWeight="700">Monthly Salary (PKR)</Field.Label>
                    <Input type="number" min="0" placeholder="45000" value={form.monthlySalary} onChange={(event) => setForm({ ...form, monthlySalary: event.target.value })} />
                  </Field.Root>

                  <Field.Root gridColumn={{ md: "span 2" }}>
                    <Field.Label fontWeight="700">Payment Cycle</Field.Label>
                    <Text fontSize="xs" color="#77908b" mt="-1" mb="1">
                      Which day of the month this employee&apos;s salary is due.
                    </Text>
                    <NativeSelect.Root>
                      <NativeSelect.Field
                        value={form.paymentCycleDay}
                        onChange={(event) => setForm({ ...form, paymentCycleDay: event.target.value })}
                      >
                        <option value="">Not set</option>
                        {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                          <option key={day} value={day}>{ordinal(day)} of the month</option>
                        ))}
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
                  {editingId ? "Save Changes" : "Save Employee"}
                </Button>
              </Flex>
            </form>
          </Box>
        </Flex>
      )}
    </Box>
  );
}
