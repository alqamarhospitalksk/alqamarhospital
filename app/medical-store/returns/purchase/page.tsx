"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Box, Button, Field, Flex, Heading, HStack, Input, NativeSelect, Table, Text, Textarea } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";

type Supplier = { id: number; name: string };
type Batch = { id: number; medicineName: string; batchNumber: string | null; quantityReceived: string; quantityRemaining: string; purchasePrice: string; expiryDate: string };
type Purchase = { id: number; supplierId: number; batches: Batch[] };
type ReturnHistoryItem = {
  id: number;
  returnNumber: string;
  supplier: string;
  reason: string;
  totalAmount: string;
  refundMode: string;
  createdBy: string;
  createdAt: string;
  items: { medicineName: string; batchNumber: string | null; quantity: string; unitCost: string; total: string }[];
};

export default function PurchaseReturnPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [history, setHistory] = useState<ReturnHistoryItem[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);
  const [supplierId, setSupplierId] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [reason, setReason] = useState("");
  const [refundMode, setRefundMode] = useState<"CASH" | "CREDIT">("CASH");
  const [saving, setSaving] = useState(false);

  // Rendered via a portal so it can never be clipped by a scrolling ancestor, matching the
  // medicine search used on the Sell/Purchase/Adjustments pages.
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const supplierInputRef = useRef<HTMLInputElement | null>(null);

  function openSupplierSearch() {
    const el = supplierInputRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      setDropdownRect({ top: rect.bottom, left: rect.left, width: rect.width });
    }
    setShowSupplierDropdown(true);
  }

  useEffect(() => {
    if (!showSupplierDropdown) return;
    const close = () => setShowSupplierDropdown(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [showSupplierDropdown]);

  async function load() {
    try {
      const [supRes, purRes, returnRes] = await Promise.all([
        fetch("/api/medical-store/suppliers"),
        fetch("/api/medical-store/purchases"),
        fetch("/api/medical-store/purchase-returns"),
      ]);
      const supData = await supRes.json();
      const purData = await purRes.json();
      const returnData = await returnRes.json();
      if (supRes.ok) {
        const loaded: Supplier[] = supData.suppliers ?? [];
        setSuppliers(loaded);
        // Opened from the Expiry Tracker's "Return to supplier" button — preselect that supplier.
        const preselect = new URLSearchParams(window.location.search).get("supplierId");
        const match = preselect ? loaded.find((s) => String(s.id) === preselect) : undefined;
        if (match) {
          setSupplierId(String(match.id));
          setSupplierSearch(match.name);
        }
      }
      if (purRes.ok) setPurchases(purData.purchases ?? []);
      if (returnRes.ok) setHistory(returnData.returns ?? []);
    } catch {
      toast.error("Unable to reach the clinic server.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const availableBatches = purchases
    .filter((p) => String(p.supplierId) === supplierId)
    .flatMap((p) => p.batches)
    .filter((b) => Number(b.quantityRemaining) > 0);

  function selectSupplier(s: Supplier) {
    setSupplierId(String(s.id));
    setSupplierSearch(s.name);
    setQuantities({});
    setShowSupplierDropdown(false);
  }

  async function submit() {
    if (!supplierId) {
      toast.error("Select a supplier.");
      return;
    }
    const items = Object.entries(quantities)
      .map(([batchId, qty]) => ({ batchId: Number(batchId), quantity: Number(qty) }))
      .filter((i) => i.quantity > 0);
    if (items.length === 0) {
      toast.error("Enter a quantity to return for at least one batch.");
      return;
    }
    if (!reason.trim()) {
      toast.error("Enter a reason for this return.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/medical-store/purchase-returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId: Number(supplierId), reason: reason.trim(), refundMode, items }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Unable to record the return.");
        return;
      }
      toast.success(`Return ${data.return.returnNumber} recorded — PKR ${data.return.totalAmount}.`);
      setSupplierId(""); setSupplierSearch(""); setQuantities({}); setReason(""); setRefundMode("CASH");
      await load();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setSaving(false);
    }
  }

  const historyPageCount = Math.max(1, Math.ceil(history.length / historyPageSize));
  const visibleHistory = history.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize);
  const firstHistoryRecord = history.length === 0 ? 0 : (historyPage - 1) * historyPageSize + 1;
  const lastHistoryRecord = Math.min(historyPage * historyPageSize, history.length);

  return (
    <Box minH="100vh" bg="#f5f7f8" color="#17252b">
      <Flex as="header" h="78px" bg="white" borderBottom="1px solid #e2e9e6" align="center" justify="space-between" px={{ base: "20px", md: "42px" }}>
        <Box>
          <Heading size="lg" letterSpacing="-0.04em">
            Purchase Returns
          </Heading>
        </Box>
      </Flex>

      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" p={{ base: "20px", md: "28px" }} mb="8">
          <HStack mb="5">
            <Flex w="36px" h="36px" bg="#e9f1ef" color="#a34258" borderRadius="9px" align="center" justify="center">
              <FontAwesomeIcon icon={faRotateLeft} />
            </Flex>
            <Heading size="sm">Return Stock to Supplier</Heading>
          </HStack>

          <Field.Root required mb="5" maxW="360px">
            <Field.Label fontWeight="700">Supplier</Field.Label>
            <Box position="relative">
              <Input
                ref={supplierInputRef}
                placeholder="Search supplier…"
                value={supplierSearch}
                bg={supplierId ? "#f0faf7" : "white"}
                borderColor={supplierId ? "#126b68" : undefined}
                onChange={(e) => {
                  setSupplierSearch(e.target.value);
                  setSupplierId("");
                  openSupplierSearch();
                }}
                onFocus={openSupplierSearch}
                onBlur={() => setTimeout(() => setShowSupplierDropdown(false), 150)}
              />
              {showSupplierDropdown && dropdownRect && createPortal(
                <Box
                  position="fixed"
                  top={`${dropdownRect.top}px`}
                  left={`${dropdownRect.left}px`}
                  width={`${dropdownRect.width}px`}
                  mt="1"
                  bg="white"
                  border="1.5px solid #126b68"
                  borderRadius="8px"
                  boxShadow="0 8px 24px rgba(18,59,59,0.15)"
                  zIndex="1000"
                >
                  {suppliers.filter((s) => s.name.toLowerCase().includes(supplierSearch.trim().toLowerCase())).length === 0 ? (
                    <Box px="3" py="2"><Text fontSize="xs" color="#77908b">No suppliers found.</Text></Box>
                  ) : (
                    suppliers
                      .filter((s) => s.name.toLowerCase().includes(supplierSearch.trim().toLowerCase()))
                      .map((s) => (
                        <Box
                          key={s.id}
                          px="3"
                          py="2"
                          cursor="pointer"
                          _hover={{ bg: "#f0faf7" }}
                          borderBottom="1px solid #f0f4f3"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectSupplier(s)}
                        >
                          <Text fontSize="sm" fontWeight="700" color="#123d3b">{s.name}</Text>
                        </Box>
                      ))
                  )}
                </Box>,
                document.body
              )}
            </Box>
          </Field.Root>

          {supplierId && (
            <>
              <Box overflowX="auto" mb="5">
                <Table.Root size="sm">
                  <Table.Header>
                    <Table.Row bg="#fafcfb">
                      <Table.ColumnHeader>Medicine</Table.ColumnHeader>
                      <Table.ColumnHeader>Batch #</Table.ColumnHeader>
                      <Table.ColumnHeader>Remaining</Table.ColumnHeader>
                      <Table.ColumnHeader>Unit Cost</Table.ColumnHeader>
                      <Table.ColumnHeader>Expiry</Table.ColumnHeader>
                      <Table.ColumnHeader>Return Quantity</Table.ColumnHeader>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {availableBatches.length === 0 ? (
                      <Table.Row><Table.Cell colSpan={6}><Text py="6" textAlign="center" color="#77908b">No batches with remaining stock from this supplier.</Text></Table.Cell></Table.Row>
                    ) : (
                      availableBatches.map((b) => (
                        <Table.Row key={b.id}>
                          <Table.Cell fontWeight="700" fontSize="sm">{b.medicineName}</Table.Cell>
                          <Table.Cell fontSize="xs" color="#556e68">{b.batchNumber || "—"}</Table.Cell>
                          <Table.Cell fontSize="sm">{b.quantityRemaining}</Table.Cell>
                          <Table.Cell fontSize="sm">PKR {b.purchasePrice}</Table.Cell>
                          <Table.Cell fontSize="sm">{new Date(b.expiryDate).toLocaleDateString("en-PK")}</Table.Cell>
                          <Table.Cell w="120px">
                            <Input
                              size="sm"
                              type="number"
                              min="0"
                              max={b.quantityRemaining}
                              value={quantities[b.id] ?? ""}
                              onChange={(e) => setQuantities((prev) => ({ ...prev, [b.id]: e.target.value }))}
                            />
                          </Table.Cell>
                        </Table.Row>
                      ))
                    )}
                  </Table.Body>
                </Table.Root>
              </Box>

              <Box mb="5">
                <Text fontSize="sm" fontWeight="700" mb="2">How is the supplier paying you back?</Text>
                <HStack gap="3" flexWrap="wrap">
                  <Button size="sm" variant={refundMode === "CASH" ? "solid" : "outline"} bg={refundMode === "CASH" ? "#126b68" : undefined} color={refundMode === "CASH" ? "white" : "#126b68"} borderColor="#c8dad5" onClick={() => setRefundMode("CASH")}>
                    Cash refund
                  </Button>
                  <Button size="sm" variant={refundMode === "CREDIT" ? "solid" : "outline"} bg={refundMode === "CREDIT" ? "#126b68" : undefined} color={refundMode === "CREDIT" ? "white" : "#126b68"} borderColor="#c8dad5" onClick={() => setRefundMode("CREDIT")}>
                    Deduct from what I owe
                  </Button>
                </HStack>
                <Text fontSize="xs" color="#77908b" mt="2">
                  {refundMode === "CASH" ? "The amount is added back to cash." : "No cash changes hands — the amount is taken off this supplier's balance on the Supplier Payments page."}
                </Text>
              </Box>

              <Field.Root required mb="5" maxW="500px">
                <Field.Label fontWeight="700">Reason</Field.Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Damaged in transit, discovered during stock check" rows={2} />
              </Field.Root>

              <Button bg="#123d3b" color="white" _hover={{ bg: "#255d58" }} loading={saving} onClick={submit}>
                Record Return
              </Button>
            </>
          )}
        </Box>

        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
          <Box p="5" borderBottom="1px solid #edf2f0">
            <Heading size="sm">Recent Returns</Heading>
          </Box>
          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg="#fafcfb">
                  <Table.ColumnHeader>Return #</Table.ColumnHeader>
                  <Table.ColumnHeader>Supplier</Table.ColumnHeader>
                  <Table.ColumnHeader>Items</Table.ColumnHeader>
                  <Table.ColumnHeader>Total</Table.ColumnHeader>
                  <Table.ColumnHeader>Reason</Table.ColumnHeader>
                  <Table.ColumnHeader>Date</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {history.length === 0 ? (
                  <Table.Row><Table.Cell colSpan={6}><Text py="8" textAlign="center" color="#77908b">No purchase returns recorded yet.</Text></Table.Cell></Table.Row>
                ) : (
                  visibleHistory.map((r) => (
                    <Table.Row key={r.id} _hover={{ bg: "#f9fbfa" }}>
                      <Table.Cell fontWeight="800" color="#126b68">{r.returnNumber}</Table.Cell>
                      <Table.Cell fontSize="sm">{r.supplier}</Table.Cell>
                      <Table.Cell fontSize="xs" color="#556e68">{r.items.map((i) => `${i.medicineName} x${i.quantity}`).join(", ")}</Table.Cell>
                      <Table.Cell fontWeight="700" color="#123d3b">
                        PKR {r.totalAmount}
                        <Text fontSize="10px" fontWeight="600" color="#77908b">{r.refundMode === "CREDIT" ? "Deducted from balance" : "Cash refund"}</Text>
                      </Table.Cell>
                      <Table.Cell fontSize="xs" color="#556e68" maxW="200px">{r.reason}</Table.Cell>
                      <Table.Cell fontSize="xs">{new Date(r.createdAt).toLocaleString("en-PK")}</Table.Cell>
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
              {history.length ? `Showing ${firstHistoryRecord}-${lastHistoryRecord} of ${history.length}` : "No records"}
            </Text>
            <HStack gap="2" flexWrap="wrap">
              <Text fontSize="sm" color="#607d76">Rows per page</Text>
              <NativeSelect.Root width="90px" size="sm">
                <NativeSelect.Field
                  value={String(historyPageSize)}
                  onChange={(event) => {
                    setHistoryPageSize(Number(event.target.value));
                    setHistoryPage(1);
                  }}
                >
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </NativeSelect.Field>
              </NativeSelect.Root>
              <Button size="sm" variant="outline" disabled={historyPage === 1} onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}>
                Previous
              </Button>
              {Array.from({ length: historyPageCount }, (_, index) => index + 1).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={p === historyPage ? "solid" : "outline"}
                  bg={p === historyPage ? "#123d3b" : undefined}
                  color={p === historyPage ? "white" : undefined}
                  onClick={() => setHistoryPage(p)}
                >
                  {p}
                </Button>
              ))}
              <Button size="sm" variant="outline" disabled={historyPage === historyPageCount} onClick={() => setHistoryPage((p) => Math.min(historyPageCount, p + 1))}>
                Next
              </Button>
            </HStack>
          </Flex>
        </Box>
      </Box>
    </Box>
  );
}
