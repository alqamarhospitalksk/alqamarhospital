"use client";
import { DateInput } from "../date-input";
import { formatDate } from "../../lib/format-date";

import { FormEvent, useEffect, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Field,
  Flex,
  Grid,
  Heading,
  HStack,
  Input,
  Link,
  NativeSelect,
  Table,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faCoins, faTriangleExclamation, faUserDoctor, faXmark } from "@fortawesome/free-solid-svg-icons";
import { LedgerDateFilter, localDateString } from "../ledger-date-filter";
import { toast } from "react-toastify";
import { getPaymentCycleInfo, type PaymentCycleStatus } from "../../lib/payment-cycle";

type Employee = {
  id: number;
  name: string;
  designation: string;
  contact: string | null;
  joiningDate: string | null;
  monthlySalary: string;
  paymentCycleDay: number | null;
  lastSalaryPayoutAt: string | null;
  lastSalaryPayoutAmount: number | null;
  active: boolean;
};

const paymentStatusCopy: Record<Exclude<PaymentCycleStatus, "not_set" | "paid">, { label: string; palette: string }> = {
  due_today: { label: "Due today", palette: "orange" },
  overdue: { label: "Overdue", palette: "red" },
  upcoming: { label: "Due soon", palette: "blue" },
};
type Doctor = { id: number; name: string };
type DoctorSummary = {
  id: number;
  name: string;
  specialization: string;
  consultationFee: string;
  splitType: string;
  splitValue: string;
  totalCollected: number;
  hospitalShare: number;
  diagnosticShare: number;
  doctorShare: number;
  paidToDate: number;
  balanceDue: number;
};

type PayoutTransaction = {
  id: number;
  category: string;
  amount: string;
  method: string;
  expenseDate: string;
  note: string | null;
  doctor: string | null;
  employee: string | null;
  baseAmount: string | null;
  incentiveAmount: string | null;
  deductionAmount: string | null;
};

const payoutCategories = ["DOCTOR_PAYOUT", "SALARY"];
const emptyPayout = {
  category: "DOCTOR_PAYOUT",
  amount: "",
  method: "CASH",
  expenseDate: new Date().toISOString().slice(0, 10),
  doctorId: "",
  employeeId: "",
  note: "",
  incentiveAmount: "",
  incentiveNote: "",
  deductionAmount: "",
  deductionNote: "",
};

const money = (val: number) => `PKR ${val.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;

type SummaryPeriod = "daily" | "weekly" | "monthly" | "custom";

function toDateStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function PayoutsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorSummaries, setDoctorSummaries] = useState<DoctorSummary[]>([]);
  const [summaryPeriod, setSummaryPeriod] = useState<SummaryPeriod>("daily");
  const [customStart, setCustomStart] = useState(() => toDateStr(new Date()));
  const [customEnd, setCustomEnd] = useState(() => toDateStr(new Date()));
  const [loadingSummaries, setLoadingSummaries] = useState(false);
  const [transactions, setTransactions] = useState<PayoutTransaction[]>([]);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPageSize, setLedgerPageSize] = useState(10);
  const [ledgerFrom, setLedgerFrom] = useState(() => localDateString(90));
  const [ledgerTo, setLedgerTo] = useState(() => localDateString(0));

  const [payoutForm, setPayoutForm] = useState(emptyPayout);
  const [showPayoutModal, setShowPayoutModal] = useState(false);

  const [saving, setSaving] = useState(false);

  async function load(period: SummaryPeriod = summaryPeriod, rangeStart = customStart, rangeEnd = customEnd, from = ledgerFrom, to = ledgerTo) {
    setLoadingSummaries(true);
    try {
      const query = `${period === "custom" ? `period=custom&start=${rangeStart}&end=${rangeEnd}` : `period=${period}`}&ledger=payouts&ledgerFrom=${from}&ledgerTo=${to}`;
      const response = await fetch(`/api/finance?${query}`);
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Unable to load payout data.");
        return;
      }
      setEmployees(data.employees);
      setDoctors(data.doctors);
      setDoctorSummaries(data.doctorSummaries ?? []);
      setTransactions((data.expenses ?? []).filter((e: PayoutTransaction) => payoutCategories.includes(e.category)));
    } finally {
      setLoadingSummaries(false);
    }
  }

  function changeSummaryPeriod(period: SummaryPeriod) {
    setSummaryPeriod(period);
    if (period !== "custom") void load(period);
  }

  useEffect(() => {
    void load("daily");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openPayoutModal(category = "DOCTOR_PAYOUT", docId = "", empId = "", presetAmount = "") {
    setPayoutForm({
      ...emptyPayout,
      category,
      amount: presetAmount,
      expenseDate: new Date().toISOString().slice(0, 10),
      doctorId: docId,
      employeeId: empId,
    });
    setShowPayoutModal(true);
  }

  async function submitPayout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "EXPENSE",
          ...payoutForm,
          amount: Number(payoutForm.amount),
          // For a SALARY payout, `amount` above is the base salary — the server recomputes
          // the real total from baseAmount + incentiveAmount - deductionAmount itself.
          baseAmount: payoutForm.category === "SALARY" ? payoutForm.amount : undefined,
          doctorId: payoutForm.doctorId ? Number(payoutForm.doctorId) : null,
          employeeId: payoutForm.employeeId ? Number(payoutForm.employeeId) : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Unable to record payout.");
        return;
      }
      toast.success(`${payoutForm.category.replaceAll("_", " ")} of ${money(Number(data.expense.amount))} recorded successfully.`);
      setPayoutForm({ ...emptyPayout, expenseDate: new Date().toISOString().slice(0, 10) });
      setShowPayoutModal(false);
      await load();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setSaving(false);
    }
  }

  const selectedDoctorSummary = doctorSummaries.find((d) => String(d.id) === payoutForm.doctorId);
  // Every employee with a payment cycle configured who hasn't been paid for it yet —
  // overdue, due today, or upcoming no matter how far out — so a newly added employee
  // (or one whose payday is weeks away) always shows up here, not just this week's.
  // Employees with no payment cycle set ("not_set") or already paid ("paid") are excluded.
  const dueEmployees = employees
    .map((employee) => ({ employee, cycle: getPaymentCycleInfo(employee.paymentCycleDay, Number(employee.monthlySalary), employee.joiningDate, employee.lastSalaryPayoutAt, undefined, employee.lastSalaryPayoutAmount) }))
    .filter((row): row is { employee: Employee; cycle: typeof row.cycle & { status: "due_today" | "overdue" | "upcoming" } } =>
      row.cycle.status === "due_today" || row.cycle.status === "overdue" || row.cycle.status === "upcoming"
    )
    .sort((a, b) => (a.cycle.daysUntilDue ?? 0) - (b.cycle.daysUntilDue ?? 0));
  const ledgerPageCount = Math.max(1, Math.ceil(transactions.length / ledgerPageSize));
  const visibleTransactions = transactions.slice((ledgerPage - 1) * ledgerPageSize, ledgerPage * ledgerPageSize);
  const firstLedgerRecord = transactions.length === 0 ? 0 : (ledgerPage - 1) * ledgerPageSize + 1;
  const lastLedgerRecord = Math.min(ledgerPage * ledgerPageSize, transactions.length);

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
              Payouts
            </Heading>
          </Box>
        </HStack>
        <HStack gap="3">
          <Button
            bg="linear-gradient(135deg, #1a8070 0%, #0f5a52 100%)"
            color="white"
            borderRadius="9px"
            fontWeight="700"
            boxShadow="0 3px 12px rgba(26,128,112,0.28)"
            _hover={{ boxShadow: "0 5px 20px rgba(26,128,112,0.42)", transform: "translateY(-1px)" }}
            _active={{ transform: "translateY(0)" }}
            transition="all 0.18s ease"
            onClick={() => openPayoutModal("DOCTOR_PAYOUT")}
          >
            <FontAwesomeIcon icon={faCoins} />
            &nbsp; Record Payout
          </Button>
        </HStack>
      </Flex>

      {/* Main Content */}
      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>

        {/* Doctor Split Fee Overview Table */}
        {doctorSummaries.length > 0 && (
          <Box bg="white" border="1px solid #e1e9e6" borderRadius="14px" boxShadow="0 2px 12px rgba(14,36,32,0.04)" p="20px" mb="6">
            <HStack justify="space-between" mb="4" flexWrap="wrap" gap="3">
              <HStack gap="3">
                <Flex w="34px" h="34px" bg="#123d3b" color="#d6e66c" borderRadius="8px" align="center" justify="center">
                  <FontAwesomeIcon icon={faUserDoctor} />
                </Flex>
                <Box>
                  <Heading size="sm">Doctor Split-Fee Summary</Heading>
                </Box>
              </HStack>
              <VStack gap="2" align="flex-end">
                <HStack gap="2" flexWrap="wrap">
                  {(["daily", "weekly", "monthly", "custom"] as const).map((p) => (
                    <Button
                      key={p}
                      size="sm"
                      variant={summaryPeriod === p ? "solid" : "outline"}
                      bg={summaryPeriod === p ? "linear-gradient(135deg, #1a8070 0%, #0f5a52 100%)" : "white"}
                      color={summaryPeriod === p ? "white" : "#3e5e58"}
                      borderColor={summaryPeriod === p ? "transparent" : "#c8dad5"}
                      borderRadius="8px"
                      fontWeight="700"
                      boxShadow={summaryPeriod === p ? "0 2px 8px rgba(26,128,112,0.25)" : "none"}
                      loading={loadingSummaries && summaryPeriod === p}
                      onClick={() => changeSummaryPeriod(p)}
                    >
                      {p === "daily" ? "Today" : p.charAt(0).toUpperCase() + p.slice(1)}
                    </Button>
                  ))}
                </HStack>
                {summaryPeriod === "custom" && (
                  <HStack gap="2" flexWrap="wrap">
                    <DateInput
                      size="sm"
value={customStart}
                      onChange={(event) => setCustomStart(event.target.value)}
                      w="150px"
                      borderRadius="8px"
                      bg="white"
                    />
                    <Text fontSize="sm" color="#77908b">to</Text>
                    <DateInput
                      size="sm"
value={customEnd}
                      onChange={(event) => setCustomEnd(event.target.value)}
                      w="150px"
                      borderRadius="8px"
                      bg="white"
                    />
                    <Button
                      size="sm"
                      bg="linear-gradient(135deg, #1a8070 0%, #0f5a52 100%)"
                      color="white"
                      borderRadius="8px"
                      fontWeight="700"
                      boxShadow="0 2px 8px rgba(26,128,112,0.25)"
                      loading={loadingSummaries}
                      onClick={() => void load("custom", customStart, customEnd)}
                    >
                      Apply
                    </Button>
                  </HStack>
                )}
              </VStack>
            </HStack>

            <Box overflowX="auto">
              <Table.Root size="sm">
                <Table.Header>
                  <Table.Row bg="#fafcfb">
                    <Table.ColumnHeader>Doctor Name</Table.ColumnHeader>
                    <Table.ColumnHeader>Split Rule</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right" whiteSpace="nowrap">Total Collected</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right" whiteSpace="nowrap">Hospital Share</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right" whiteSpace="nowrap">Diagnostic Referral Share</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right" whiteSpace="nowrap">Doctor Net Share</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right" whiteSpace="nowrap">Paid to Date</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right" whiteSpace="nowrap">Balance Due</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right">Action</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {doctorSummaries.map((doc) => (
                    <Table.Row key={doc.id} _hover={{ bg: "#f9fbfa" }}>
                      <Table.Cell fontWeight="700">{doc.name}</Table.Cell>
                      <Table.Cell fontSize="xs">
                        <Badge colorPalette="purple" borderRadius="full">
                          {doc.splitType === "PERCENTAGE" ? `${doc.splitValue}% Hospital` : `PKR ${doc.splitValue}/visit Hospital`}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell textAlign="right" fontWeight="600">{money(doc.totalCollected)}</Table.Cell>
                      <Table.Cell textAlign="right" color="#a34258" fontWeight="600">{money(doc.hospitalShare)}</Table.Cell>
                      <Table.Cell textAlign="right" color="#126b68" fontWeight="600">{money(doc.diagnosticShare)}</Table.Cell>
                      <Table.Cell textAlign="right" color="#22633e" fontWeight="700">{money(doc.doctorShare)}</Table.Cell>
                      <Table.Cell textAlign="right" color="#607d76">{money(doc.paidToDate)}</Table.Cell>
                      <Table.Cell textAlign="right" fontWeight="800" color={doc.balanceDue > 0 ? "#126b68" : "#556e68"}>
                        {money(doc.balanceDue)}
                      </Table.Cell>
                      <Table.Cell textAlign="right">
                        <Button
                          size="xs"
                          bg="#123d3b"
                          color="white"
                          _hover={{ bg: "#255d58" }}
                          onClick={() => openPayoutModal("DOCTOR_PAYOUT", String(doc.id), "", doc.balanceDue > 0 ? String(doc.balanceDue) : "")}
                        >
                          Payout
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </Box>
          </Box>
        )}

        {/* Employee Salary Due */}
        {dueEmployees.length > 0 && (
          <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden" mb="6">
            <Box p="5" borderBottom="1px solid #edf2f0">
              <HStack gap="3">
                <Flex w="34px" h="34px" bg="#f8e8d8" color="#b26732" borderRadius="9px" align="center" justify="center">
                  <FontAwesomeIcon icon={faTriangleExclamation} size="sm" />
                </Flex>
                <Box>
                  <Heading size="sm">Employee Salary Due</Heading>
                </Box>
              </HStack>
            </Box>
            <Box overflowX="auto">
              <Table.Root size="sm">
                <Table.Header>
                  <Table.Row bg="#fafcfb">
                    <Table.ColumnHeader>Employee</Table.ColumnHeader>
                    <Table.ColumnHeader>Amount Due</Table.ColumnHeader>
                    <Table.ColumnHeader>Due Date</Table.ColumnHeader>
                    <Table.ColumnHeader>Status</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right">Action</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {dueEmployees.map(({ employee, cycle }) => {
                    const copy = paymentStatusCopy[cycle.status];
                    const amountDue = cycle.amountDue ?? Number(employee.monthlySalary);
                    return (
                      <Table.Row key={employee.id} _hover={{ bg: "#f9fbfa" }}>
                        <Table.Cell>
                          <Text fontWeight="700" fontSize="sm">{employee.name}</Text>
                          <Text color="#77908b" fontSize="xs">{employee.designation}</Text>
                        </Table.Cell>
                        <Table.Cell fontWeight="700" color="#126b68">
                          {money(amountDue)}
                          {cycle.proration && (
                            <Text fontSize="10px" color="#a0aeaa" fontWeight="500">
                              Prorated · {cycle.proration.daysWorked}/{cycle.proration.totalDaysInCycle} days (joined mid-cycle)
                            </Text>
                          )}
                        </Table.Cell>
                        <Table.Cell fontSize="sm">{cycle.dueDate?.toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })}</Table.Cell>
                        <Table.Cell>
                          <Badge colorPalette={copy.palette} borderRadius="full">
                            {copy.label}
                            {cycle.status === "overdue" ? ` (${Math.abs(cycle.daysUntilDue ?? 0)}d)` : ""}
                            {cycle.status === "upcoming" ? ` (${cycle.daysUntilDue}d)` : ""}
                          </Badge>
                        </Table.Cell>
                        <Table.Cell textAlign="right">
                          <Button
                            size="xs"
                            bg="#123d3b"
                            color="white"
                            _hover={{ bg: "#255d58" }}
                            disabled={cycle.status === "upcoming"}
                            title={cycle.status === "upcoming" ? "Salary can only be paid on or after the due date" : undefined}
                            onClick={() => openPayoutModal("SALARY", "", String(employee.id), String(amountDue))}
                          >
                            Pay Now
                          </Button>
                          {cycle.status === "upcoming" && cycle.dueDate && (
                            <Text fontSize="10px" color="#77908b" mt="1">
                              Available from {cycle.dueDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replaceAll(" ", "-")}
                            </Text>
                          )}
                        </Table.Cell>
                      </Table.Row>
                    );
                  })}
                </Table.Body>
              </Table.Root>
            </Box>
          </Box>
        )}

        {/* Payout Ledger Table */}
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
          <Box p="5" borderBottom="1px solid #edf2f0">
            <HStack justify="space-between">
              <HStack gap="3">
                <Flex w="34px" h="34px" bg="#f8e8d8" color="#b26732" borderRadius="9px" align="center" justify="center">
                  <FontAwesomeIcon icon={faCoins} />
                </Flex>
                <Box>
                  <Heading size="sm">Payout Ledger</Heading>
                </Box>
              </HStack>
              <LedgerDateFilter
                from={ledgerFrom}
                to={ledgerTo}
                onChange={(from, to) => {
                  setLedgerFrom(from);
                  setLedgerTo(to);
                  setLedgerPage(1);
                  if (from && to && from <= to) void load(summaryPeriod, customStart, customEnd, from, to);
                }}
              />
            </HStack>
          </Box>

          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg="#fafcfb">
                  <Table.ColumnHeader>Category</Table.ColumnHeader>
                  <Table.ColumnHeader>Paid To</Table.ColumnHeader>
                  <Table.ColumnHeader>Amount</Table.ColumnHeader>
                  <Table.ColumnHeader>Date</Table.ColumnHeader>
                  <Table.ColumnHeader>Payment Method</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {transactions.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={5}>
                      <Text py="8" textAlign="center" color="#77908b">
                        No payouts recorded yet.
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  visibleTransactions.map((item) => (
                    <Table.Row key={item.id} _hover={{ bg: "#f9fbfa" }}>
                      <Table.Cell>
                        <Text fontWeight="700" fontSize="sm">
                          {item.category.replaceAll("_", " ")}
                        </Text>
                        <Text fontSize="xs" color="#77908b">
                          {item.note ?? "No note"}
                        </Text>
                      </Table.Cell>
                      <Table.Cell fontSize="sm">{item.doctor ?? item.employee ?? "—"}</Table.Cell>
                      <Table.Cell fontWeight="800" color="#123d3b">
                        PKR {item.amount}
                        {(Number(item.incentiveAmount) > 0 || Number(item.deductionAmount) > 0) && (
                          <Text fontSize="10px" color="#a0aeaa" fontWeight="500">
                            Base {item.baseAmount}
                            {Number(item.incentiveAmount) > 0 ? ` + ${item.incentiveAmount} incentive` : ""}
                            {Number(item.deductionAmount) > 0 ? ` − ${item.deductionAmount} deduction` : ""}
                          </Text>
                        )}
                      </Table.Cell>
                      <Table.Cell fontSize="sm">{formatDate(item.expenseDate)}</Table.Cell>
                      <Table.Cell>
                        <Badge colorPalette="orange" borderRadius="full">
                          {item.method.replaceAll("_", " ")}
                        </Badge>
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
              {transactions.length ? `Showing ${firstLedgerRecord}-${lastLedgerRecord} of ${transactions.length}` : "No records"}
            </Text>
            <HStack gap="2" flexWrap="wrap">
              <Text fontSize="sm" color="#607d76">Rows per page</Text>
              <NativeSelect.Root width="90px" size="sm">
                <NativeSelect.Field
                  value={String(ledgerPageSize)}
                  onChange={(event) => {
                    setLedgerPageSize(Number(event.target.value));
                    setLedgerPage(1);
                  }}
                >
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </NativeSelect.Field>
              </NativeSelect.Root>
              <Button size="sm" variant="outline" disabled={ledgerPage === 1} onClick={() => setLedgerPage((p) => Math.max(1, p - 1))}>
                Previous
              </Button>
              {Array.from({ length: ledgerPageCount }, (_, index) => index + 1).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={p === ledgerPage ? "solid" : "outline"}
                  bg={p === ledgerPage ? "#123d3b" : undefined}
                  color={p === ledgerPage ? "white" : undefined}
                  onClick={() => setLedgerPage(p)}
                >
                  {p}
                </Button>
              ))}
              <Button size="sm" variant="outline" disabled={ledgerPage === ledgerPageCount} onClick={() => setLedgerPage((p) => Math.min(ledgerPageCount, p + 1))}>
                Next
              </Button>
            </HStack>
          </Flex>
        </Box>
      </Box>

      {/* Record Payout Modal */}
      {showPayoutModal && (
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
          <Box bg="white" borderRadius="16px" w="full" maxW="600px" boxShadow="0 20px 40px rgba(0,0,0,0.2)" overflow="hidden">
            <Flex justify="space-between" align="center" px="28px" py="20px" bg="#123d3b" color="white">
              <HStack gap="3">
                <Flex w="36px" h="36px" bg="#d6e66c" color="#123d3b" borderRadius="10px" align="center" justify="center">
                  <FontAwesomeIcon icon={faCoins} />
                </Flex>
                <Box>
                  <Heading size="sm">Record Doctor or Salary Payout</Heading>
                  <Text fontSize="xs" color="#a8c5bd">
                    Transaction will be recorded in the clinic payout ledger.
                  </Text>
                </Box>
              </HStack>
              <Button variant="ghost" color="white" _hover={{ bg: "#255d58" }} p="2" minW="auto" onClick={() => setShowPayoutModal(false)}>
                <FontAwesomeIcon icon={faXmark} size="lg" />
              </Button>
            </Flex>

            <form onSubmit={submitPayout}>
              <Box p="28px" maxH="75vh" overflowY="auto">
                <VStack align="stretch" gap="4">
                  <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap="4">
                    <Field.Root required>
                      <Field.Label fontWeight="700">Category</Field.Label>
                      <NativeSelect.Root>
                        <NativeSelect.Field
                          value={payoutForm.category}
                          onChange={(event) => setPayoutForm({ ...payoutForm, category: event.target.value })}
                        >
                          {payoutCategories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat.replaceAll("_", " ")}
                            </option>
                          ))}
                        </NativeSelect.Field>
                      </NativeSelect.Root>
                    </Field.Root>

                    <Field.Root required>
                      <Field.Label fontWeight="700">{payoutForm.category === "SALARY" ? "Base Salary (PKR)" : "Amount (PKR)"}</Field.Label>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="5000"
                        value={payoutForm.amount}
                        onChange={(event) => setPayoutForm({ ...payoutForm, amount: event.target.value })}
                      />
                    </Field.Root>
                  </Grid>

                  {/* Doctor Split Payout Helper */}
                  {payoutForm.category === "DOCTOR_PAYOUT" && (
                    <VStack align="stretch" gap="3">
                      <Field.Root required>
                        <Field.Label fontWeight="700">Doctor</Field.Label>
                        <NativeSelect.Root>
                          <NativeSelect.Field
                            value={payoutForm.doctorId}
                            onChange={(event) => {
                              const dId = event.target.value;
                              const summary = doctorSummaries.find((d) => String(d.id) === dId);
                              setPayoutForm({
                                ...payoutForm,
                                doctorId: dId,
                                amount: summary && summary.balanceDue > 0 ? String(summary.balanceDue) : payoutForm.amount,
                              });
                            }}
                          >
                            <option value="">Select doctor</option>
                            {doctors.map((doctor) => (
                              <option key={doctor.id} value={doctor.id}>
                                {doctor.name}
                              </option>
                            ))}
                          </NativeSelect.Field>
                        </NativeSelect.Root>
                      </Field.Root>

                      {selectedDoctorSummary && (
                        <Flex bg="#f5f7f8" borderRadius="8px" p="3" justify="space-between" fontSize="xs">
                          <Box>
                            <Text color="#77908b">Doctor Net Share: <strong>{money(selectedDoctorSummary.doctorShare)}</strong></Text>
                            <Text color="#77908b">Paid to Date: <strong>{money(selectedDoctorSummary.paidToDate)}</strong></Text>
                          </Box>
                          <Box textAlign="right">
                            <Text color="#77908b">Net Balance Due:</Text>
                            <Text fontWeight="800" fontSize="sm" color="#126b68">{money(selectedDoctorSummary.balanceDue)}</Text>
                          </Box>
                        </Flex>
                      )}
                    </VStack>
                  )}

                  {payoutForm.category === "SALARY" && (
                    <VStack align="stretch" gap="3">
                      <Field.Root required>
                        <Field.Label fontWeight="700">Employee</Field.Label>
                        <NativeSelect.Root>
                          <NativeSelect.Field
                            value={payoutForm.employeeId}
                            onChange={(event) => {
                              const eId = event.target.value;
                              const emp = employees.find((e) => String(e.id) === eId);
                              setPayoutForm({
                                ...payoutForm,
                                employeeId: eId,
                                amount: emp ? emp.monthlySalary : payoutForm.amount,
                              });
                            }}
                          >
                            <option value="">Select employee</option>
                            {employees.map((employee) => (
                              <option key={employee.id} value={employee.id}>
                                {employee.name} · {employee.designation} (PKR {employee.monthlySalary}/mo)
                              </option>
                            ))}
                          </NativeSelect.Field>
                        </NativeSelect.Root>
                      </Field.Root>

                      <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap="4">
                        <Field.Root>
                          <Field.Label fontWeight="700">Incentive / Bonus (+PKR)</Field.Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0"
                            value={payoutForm.incentiveAmount}
                            onChange={(event) => setPayoutForm({ ...payoutForm, incentiveAmount: event.target.value })}
                          />
                        </Field.Root>
                        <Field.Root>
                          <Field.Label fontWeight="700">Incentive Reason</Field.Label>
                          <Input
                            placeholder="e.g. Performance bonus"
                            value={payoutForm.incentiveNote}
                            onChange={(event) => setPayoutForm({ ...payoutForm, incentiveNote: event.target.value })}
                          />
                        </Field.Root>
                      </Grid>

                      <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap="4">
                        <Field.Root>
                          <Field.Label fontWeight="700">Deduction — Leave / Other (−PKR)</Field.Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0"
                            value={payoutForm.deductionAmount}
                            onChange={(event) => setPayoutForm({ ...payoutForm, deductionAmount: event.target.value })}
                          />
                        </Field.Root>
                        <Field.Root>
                          <Field.Label fontWeight="700">Deduction Reason</Field.Label>
                          <Input
                            placeholder="e.g. 2 days unpaid leave"
                            value={payoutForm.deductionNote}
                            onChange={(event) => setPayoutForm({ ...payoutForm, deductionNote: event.target.value })}
                          />
                        </Field.Root>
                      </Grid>

                      <Flex bg="#f5f7f8" borderRadius="8px" p="3" justify="space-between" align="center">
                        <Text fontSize="xs" color="#77908b">
                          {money(Number(payoutForm.amount) || 0)}
                          {Number(payoutForm.incentiveAmount) > 0 ? ` + ${money(Number(payoutForm.incentiveAmount))} incentive` : ""}
                          {Number(payoutForm.deductionAmount) > 0 ? ` − ${money(Number(payoutForm.deductionAmount))} deduction` : ""}
                        </Text>
                        <Box textAlign="right">
                          <Text fontSize="xs" color="#77908b">Net Payable</Text>
                          <Text fontWeight="800" fontSize="sm" color="#126b68">
                            {money(Math.max(0, (Number(payoutForm.amount) || 0) + (Number(payoutForm.incentiveAmount) || 0) - (Number(payoutForm.deductionAmount) || 0)))}
                          </Text>
                        </Box>
                      </Flex>
                    </VStack>
                  )}

                  <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap="4">
                    <Field.Root required>
                      <Field.Label fontWeight="700">Date</Field.Label>
                      <DateInput value={payoutForm.expenseDate} onChange={(event) => setPayoutForm({ ...payoutForm, expenseDate: event.target.value })} />
                    </Field.Root>

                    <Field.Root required>
                      <Field.Label fontWeight="700">Payment Method</Field.Label>
                      <NativeSelect.Root>
                        <NativeSelect.Field value={payoutForm.method} onChange={(event) => setPayoutForm({ ...payoutForm, method: event.target.value })}>
                          <option value="CASH">Cash</option>
                          <option value="CARD">Card</option>
                          <option value="BANK_TRANSFER">Bank transfer</option>
                          <option value="ONLINE">Online</option>
                        </NativeSelect.Field>
                      </NativeSelect.Root>
                    </Field.Root>
                  </Grid>

                  <Field.Root>
                    <Field.Label fontWeight="700">Note / Reference</Field.Label>
                    <Textarea placeholder="e.g. Monthly salary for August" value={payoutForm.note} onChange={(event) => setPayoutForm({ ...payoutForm, note: event.target.value })} />
                  </Field.Root>
                </VStack>
              </Box>

              <Flex justify="flex-end" gap="3" px="28px" py="18px" bg="#f7faf9" borderTop="1px solid #e2e9e6">
                <Button variant="outline" borderColor="#c8dad5" onClick={() => setShowPayoutModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={saving} bg="#123d3b" color="white" _hover={{ bg: "#255d58" }}>
                  Record Payout
                </Button>
              </Flex>
            </form>
          </Box>
        </Flex>
      )}
    </Box>
  );
}
