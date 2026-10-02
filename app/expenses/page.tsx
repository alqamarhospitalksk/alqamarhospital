"use client";

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
} from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faCoins, faXmark } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";
import { LedgerDateFilter, localDateString } from "../ledger-date-filter";

type ExpenseTransaction = {
  id: number;
  category: string;
  amount: string;
  method: string;
  expenseDate: string;
  note: string | null;
  doctor: string | null;
  employee: string | null;
};

const expenseCategories = ["GENERAL", "INVENTORY", "MEDICAL_STORE_WASTAGE", "SUPPLIER_REFUND", "SUPPLIER_PAYMENT", "LABORATORY", "ECO", "ECG", "X-RAY", "ULTRASOUND", "OT"];
const emptyExpense = {
  category: "GENERAL",
  amount: "",
  method: "CASH",
  expenseDate: new Date().toISOString().slice(0, 10),
  note: "",
};

export default function ExpensesPage() {
  const [transactions, setTransactions] = useState<ExpenseTransaction[]>([]);
  const [expenseForm, setExpenseForm] = useState(emptyExpense);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [ledgerFrom, setLedgerFrom] = useState(() => localDateString(90));
  const [ledgerTo, setLedgerTo] = useState(() => localDateString(0));

  async function load(from = ledgerFrom, to = ledgerTo) {
    const response = await fetch(`/api/finance?ledger=expenses&ledgerFrom=${from}&ledgerTo=${to}`);
    const data = await response.json();
    if (!response.ok) {
      toast.error(data.error ?? "Unable to load expense data.");
      return;
    }
    setTransactions((data.expenses ?? []).filter((e: ExpenseTransaction) => expenseCategories.includes(e.category)));
  }

  useEffect(() => {
    void load();
  }, []);

  function openExpenseModal() {
    setExpenseForm({ ...emptyExpense, expenseDate: new Date().toISOString().slice(0, 10) });
    setShowExpenseModal(true);
  }

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "EXPENSE",
          ...expenseForm,
          amount: Number(expenseForm.amount),
          doctorId: null,
          employeeId: null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Unable to record expense.");
        return;
      }
      toast.success(`${expenseForm.category.replaceAll("_", " ")} expense recorded successfully.`);
      setExpenseForm({ ...emptyExpense, expenseDate: new Date().toISOString().slice(0, 10) });
      setShowExpenseModal(false);
      await load();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setSaving(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(transactions.length / pageSize));
  const visibleTransactions = transactions.slice((page - 1) * pageSize, page * pageSize);
  const firstRecord = transactions.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRecord = Math.min(page * pageSize, transactions.length);

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
              Expenses
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
          onClick={openExpenseModal}
        >
          <FontAwesomeIcon icon={faCoins} />
          &nbsp; Record Expense
        </Button>
      </Flex>

      {/* Main Content */}
      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>

        {/* Expense Ledger Table */}
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="14px" boxShadow="0 2px 12px rgba(14,36,32,0.04)" overflow="hidden">
          <Box p="5" borderBottom="1px solid #edf2f0">
            <HStack justify="space-between">
              <HStack gap="3">
                <Flex w="34px" h="34px" bg="#f8e8d8" color="#b26732" borderRadius="9px" align="center" justify="center">
                  <FontAwesomeIcon icon={faCoins} />
                </Flex>
                <Box>
                  <Heading size="sm">Expense Ledger</Heading>
                </Box>
              </HStack>
              <LedgerDateFilter
                from={ledgerFrom}
                to={ledgerTo}
                onChange={(from, to) => {
                  setLedgerFrom(from);
                  setLedgerTo(to);
                  setPage(1);
                  if (from && to && from <= to) void load(from, to);
                }}
              />
            </HStack>
          </Box>

          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg="#fafcfb">
                  <Table.ColumnHeader>Category</Table.ColumnHeader>
                  <Table.ColumnHeader>Note</Table.ColumnHeader>
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
                        No expenses recorded yet.
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  visibleTransactions.map((expense) => (
                    <Table.Row key={expense.id} _hover={{ bg: "#f9fbfa" }}>
                      <Table.Cell>
                        <Badge colorPalette="purple" borderRadius="full">
                          {expense.category.replaceAll("_", " ")}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell fontSize="sm" color="#556e68">
                        {expense.note ?? "No note"}
                      </Table.Cell>
                      <Table.Cell fontWeight="800" color="#123d3b">
                        PKR {expense.amount}
                      </Table.Cell>
                      <Table.Cell fontSize="sm">{expense.expenseDate.slice(0, 10)}</Table.Cell>
                      <Table.Cell>
                        <Badge colorPalette="orange" borderRadius="full">
                          {expense.method.replaceAll("_", " ")}
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
              {transactions.length ? `Showing ${firstRecord}-${lastRecord} of ${transactions.length}` : "No records"}
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

      {/* Record Expense Modal */}
      {showExpenseModal && (
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
          <Box bg="white" borderRadius="16px" w="full" maxW="580px" boxShadow="0 20px 40px rgba(0,0,0,0.2)" overflow="hidden">
            <Flex justify="space-between" align="center" px="28px" py="20px" bg="#123d3b" color="white">
              <HStack gap="3">
                <Flex w="36px" h="36px" bg="#d6e66c" color="#123d3b" borderRadius="10px" align="center" justify="center">
                  <FontAwesomeIcon icon={faCoins} />
                </Flex>
                <Box>
                  <Heading size="sm">Record Clinic Expense</Heading>
                  <Text fontSize="xs" color="#a8c5bd">
                    Transaction will be recorded in the clinic expense ledger.
                  </Text>
                </Box>
              </HStack>
              <Button variant="ghost" color="white" _hover={{ bg: "#255d58" }} p="2" minW="auto" onClick={() => setShowExpenseModal(false)}>
                <FontAwesomeIcon icon={faXmark} size="lg" />
              </Button>
            </Flex>

            <form onSubmit={submitExpense}>
              <Box p="28px" maxH="75vh" overflowY="auto">
                <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap="4">
                  <Field.Root required>
                    <Field.Label fontWeight="700">Category</Field.Label>
                    <NativeSelect.Root>
                      <NativeSelect.Field
                        value={expenseForm.category}
                        onChange={(event) => setExpenseForm({ ...expenseForm, category: event.target.value })}
                      >
                        {expenseCategories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat.replaceAll("_", " ")}
                          </option>
                        ))}
                      </NativeSelect.Field>
                    </NativeSelect.Root>
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label fontWeight="700">Amount (PKR)</Field.Label>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="5000"
                      value={expenseForm.amount}
                      onChange={(event) => setExpenseForm({ ...expenseForm, amount: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label fontWeight="700">Date</Field.Label>
                    <Input type="date" value={expenseForm.expenseDate} onChange={(event) => setExpenseForm({ ...expenseForm, expenseDate: event.target.value })} />
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label fontWeight="700">Payment Method</Field.Label>
                    <NativeSelect.Root>
                      <NativeSelect.Field value={expenseForm.method} onChange={(event) => setExpenseForm({ ...expenseForm, method: event.target.value })}>
                        <option value="CASH">Cash</option>
                        <option value="CARD">Card</option>
                        <option value="BANK_TRANSFER">Bank transfer</option>
                        <option value="ONLINE">Online</option>
                      </NativeSelect.Field>
                    </NativeSelect.Root>
                  </Field.Root>

                  <Field.Root gridColumn={{ md: "span 2" }}>
                    <Field.Label fontWeight="700">Note / Reference</Field.Label>
                    <Textarea placeholder="e.g. Utility bill payment or vendor receipt #" value={expenseForm.note} onChange={(event) => setExpenseForm({ ...expenseForm, note: event.target.value })} />
                  </Field.Root>
                </Grid>
              </Box>

              <Flex justify="flex-end" gap="3" px="28px" py="18px" bg="#f7faf9" borderTop="1px solid #e2e9e6">
                <Button variant="outline" borderColor="#c8dad5" onClick={() => setShowExpenseModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={saving} bg="#123d3b" color="white" _hover={{ bg: "#255d58" }}>
                  Record Expense
                </Button>
              </Flex>
            </form>
          </Box>
        </Flex>
      )}
    </Box>
  );
}
