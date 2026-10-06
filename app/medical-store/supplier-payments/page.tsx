"use client";
import { DateInput } from "../../date-input";

import { useEffect, useState } from "react";
import { Box, Button, Flex, Grid, Heading, HStack, Input, NativeSelect, Table, Text } from "@chakra-ui/react";
import { faCoins, faHandHoldingDollar, faTruckMedical } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";
import { StatCard } from "../../stat-card";
import { TablePagination } from "../../table-pagination";

type SupplierBalance = { id: number; name: string; active: boolean; purchased: number; paid: number; creditReturns: number; balance: number };
type Payment = { id: number; supplierName: string; amount: string; method: string; paidOn: string; note: string | null; createdBy: string; createdAt: string };

const money = (value: number) => `PKR ${value.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function SupplierPaymentsPage() {
  const [suppliers, setSuppliers] = useState<SupplierBalance[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [supplierId, setSupplierId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [paidOn, setPaidOn] = useState(today);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [balancePage, setBalancePage] = useState(1);
  const [balancePageSize, setBalancePageSize] = useState(10);
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentPageSize, setPaymentPageSize] = useState(10);

  async function load() {
    try {
      const res = await fetch("/api/medical-store/supplier-payments");
      const data = await res.json();
      if (res.ok) {
        setSuppliers(data.suppliers ?? []);
        setPayments(data.payments ?? []);
      } else toast.error(data.error ?? "Unable to load supplier balances.");
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function recordPayment() {
    if (!supplierId) {
      toast.error("Select a supplier.");
      return;
    }
    if (!(Number(amount) > 0)) {
      toast.error("Enter an amount greater than zero.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/medical-store/supplier-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId: Number(supplierId), amount: Number(amount), method, paidOn, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Unable to record the payment.");
        return;
      }
      toast.success(`Payment of ${money(Number(amount))} recorded.`);
      setAmount("");
      setNote("");
      await load();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setSaving(false);
    }
  }

  const totalOwed = suppliers.reduce((sum, s) => sum + Math.max(s.balance, 0), 0);
  const totalPaid = suppliers.reduce((sum, s) => sum + s.paid, 0);
  const selected = suppliers.find((s) => String(s.id) === supplierId);
  const visibleSuppliers = suppliers.slice((balancePage - 1) * balancePageSize, balancePage * balancePageSize);
  const visiblePayments = payments.slice((paymentPage - 1) * paymentPageSize, paymentPage * paymentPageSize);

  return (
    <Box minH="100vh" bg="#f5f7f8" color="#17252b">
      <Flex as="header" h="78px" bg="white" borderBottom="1px solid #e2e9e6" align="center" px={{ base: "20px", md: "42px" }}>
        <Heading size="lg" letterSpacing="-0.04em">Supplier Payments</Heading>
      </Flex>

      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>
        <Grid templateColumns={{ base: "1fr", sm: "repeat(3, 1fr)" }} gap="4" mb="6">
          <StatCard label="Total you owe suppliers" value={loading ? "…" : money(totalOwed)} icon={faTruckMedical} color="#a34258" valueColor={totalOwed > 0 ? "#a34258" : "#123d3b"} />
          <StatCard label="Total paid to suppliers" value={loading ? "…" : money(totalPaid)} icon={faHandHoldingDollar} color="#22633e" />
          <StatCard label="Suppliers with money due" value={loading ? "…" : suppliers.filter((s) => s.balance > 0).length} icon={faCoins} color="#b26732" />
        </Grid>

        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" p={{ base: "20px", md: "28px" }} mb="6">
          <Heading size="sm" mb="4">Record a Payment</Heading>
          <Grid templateColumns={{ base: "1fr", md: "2fr 1fr 1fr 1fr" }} gap="3" mb="3">
            <Box>
              <Text fontSize="sm" fontWeight="700" mb="2">Supplier</Text>
              <NativeSelect.Root>
                <NativeSelect.Field value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">Select a supplier…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </NativeSelect.Field>
              </NativeSelect.Root>
            </Box>
            <Box>
              <Text fontSize="sm" fontWeight="700" mb="2">Amount (PKR)</Text>
              <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Box>
            <Box>
              <Text fontSize="sm" fontWeight="700" mb="2">Paid by</Text>
              <NativeSelect.Root>
                <NativeSelect.Field value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                  <option value="CARD">Card</option>
                  <option value="ONLINE">Online</option>
                </NativeSelect.Field>
              </NativeSelect.Root>
            </Box>
            <Box>
              <Text fontSize="sm" fontWeight="700" mb="2">Date paid</Text>
              <DateInput value={paidOn} max={today()} onChange={(e) => setPaidOn(e.target.value)} />
            </Box>
          </Grid>
          <Box mb="4">
            <Text fontSize="sm" fontWeight="700" mb="2">Note (optional)</Text>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. cheque no. 1234, invoice PUR-..." />
          </Box>
          <HStack justify="space-between" flexWrap="wrap" gap="3">
            <Text fontSize="sm" color="#607d76">
              {selected ? <>Currently owed to {selected.name}: <Text as="span" fontWeight="800" color={selected.balance > 0 ? "#a34258" : "#22633e"}>{money(selected.balance)}</Text></> : "Payments are also added to Expenses."}
            </Text>
            <Button bg="#123d3b" color="white" _hover={{ bg: "#255d58" }} loading={saving} onClick={recordPayment}>
              Record Payment
            </Button>
          </HStack>
        </Box>

        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden" mb="6">
          <Box p="5" borderBottom="1px solid #edf2f0">
            <Heading size="sm">Supplier Balances</Heading>
          </Box>
          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>Supplier</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Bought</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Paid</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Returns deducted</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">You owe</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {suppliers.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={5}><Text py="8" textAlign="center" color="#77908b" fontSize="sm">{loading ? "Loading…" : "No suppliers yet."}</Text></Table.Cell>
                  </Table.Row>
                ) : (
                  visibleSuppliers.map((s) => (
                    <Table.Row key={s.id}>
                      <Table.Cell fontWeight="700" fontSize="sm">{s.name}{!s.active && <Text as="span" fontSize="xs" color="#77908b"> (inactive)</Text>}</Table.Cell>
                      <Table.Cell textAlign="right" fontSize="sm">{money(s.purchased)}</Table.Cell>
                      <Table.Cell textAlign="right" fontSize="sm">{money(s.paid)}</Table.Cell>
                      <Table.Cell textAlign="right" fontSize="sm">{money(s.creditReturns)}</Table.Cell>
                      <Table.Cell textAlign="right" fontSize="sm" fontWeight="800" color={s.balance > 0 ? "#a34258" : "#22633e"}>
                        {s.balance < 0 ? `${money(-s.balance)} (advance)` : money(s.balance)}
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table.Root>
          </Box>
          <TablePagination total={suppliers.length} page={balancePage} pageSize={balancePageSize} onPageChange={setBalancePage} onPageSizeChange={setBalancePageSize} />
        </Box>

        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
          <Box p="5" borderBottom="1px solid #edf2f0">
            <Heading size="sm">Recent Payments</Heading>
          </Box>
          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>Date paid</Table.ColumnHeader>
                  <Table.ColumnHeader>Supplier</Table.ColumnHeader>
                  <Table.ColumnHeader>Method</Table.ColumnHeader>
                  <Table.ColumnHeader>Note</Table.ColumnHeader>
                  <Table.ColumnHeader>By</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Amount</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {payments.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={6}><Text py="8" textAlign="center" color="#77908b" fontSize="sm">{loading ? "Loading…" : "No payments recorded yet."}</Text></Table.Cell>
                  </Table.Row>
                ) : (
                  visiblePayments.map((p) => (
                    <Table.Row key={p.id}>
                      <Table.Cell fontSize="sm">{new Date(p.paidOn).toLocaleDateString("en-GB", { timeZone: "UTC" })}</Table.Cell>
                      <Table.Cell fontSize="sm" fontWeight="700">{p.supplierName}</Table.Cell>
                      <Table.Cell fontSize="xs">{p.method.replaceAll("_", " ")}</Table.Cell>
                      <Table.Cell fontSize="xs" color="#556e68">{p.note ?? "—"}</Table.Cell>
                      <Table.Cell fontSize="xs">{p.createdBy}</Table.Cell>
                      <Table.Cell textAlign="right" fontWeight="800" color="#123d3b">{money(Number(p.amount))}</Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table.Root>
          </Box>
          <TablePagination total={payments.length} page={paymentPage} pageSize={paymentPageSize} onPageChange={setPaymentPage} onPageSizeChange={setPaymentPageSize} />
        </Box>
      </Box>
    </Box>
  );
}
