"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge, Box, Button, Field, Flex, Heading, HStack, Input, NativeSelect, Table, Text, Textarea } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";

type SaleItem = { id: number; batchId: number; name: string; quantity: string; unitPrice: string; total: string; returnedQuantity?: string };
type Sale = { id: number; saleNumber: string; customerName: string; total: string; items: SaleItem[] };
type ReturnHistoryItem = {
  id: number;
  returnNumber: string;
  saleNumber: string;
  reason: string;
  restock: boolean;
  totalRefund: string;
  createdBy: string;
  createdAt: string;
  items: { medicineName: string; quantity: string; unitPrice: string; total: string }[];
};

export default function SaleReturnPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [history, setHistory] = useState<ReturnHistoryItem[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);
  const [saleId, setSaleId] = useState("");
  const [saleSearch, setSaleSearch] = useState("");
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [restock, setRestock] = useState(true);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Rendered via a portal so it can never be clipped by a scrolling ancestor, matching the
  // medicine search used on the Sell/Purchase/Adjustments pages.
  const [showSaleDropdown, setShowSaleDropdown] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const saleInputRef = useRef<HTMLInputElement | null>(null);

  function openSaleSearch() {
    const el = saleInputRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      setDropdownRect({ top: rect.bottom, left: rect.left, width: rect.width });
    }
    setShowSaleDropdown(true);
  }

  useEffect(() => {
    if (!showSaleDropdown) return;
    const close = () => setShowSaleDropdown(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [showSaleDropdown]);

  async function load() {
    try {
      const [saleRes, returnRes] = await Promise.all([
        fetch("/api/medical-store/sales"),
        fetch("/api/medical-store/sale-returns"),
      ]);
      const saleData = await saleRes.json();
      const returnData = await returnRes.json();
      if (saleRes.ok) setSales(saleData.sales ?? []);
      if (returnRes.ok) setHistory(returnData.returns ?? []);
    } catch {
      toast.error("Unable to reach the clinic server.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const sale = sales.find((s) => String(s.id) === saleId);

  function selectSale(s: Sale) {
    setSaleId(String(s.id));
    setSaleSearch(`${s.saleNumber} — ${s.customerName}`);
    setQuantities({});
    setShowSaleDropdown(false);
  }

  async function submit() {
    if (!sale) {
      toast.error("Select a sale to return items from.");
      return;
    }
    const items = Object.entries(quantities)
      .map(([saleItemId, qty]) => ({ saleItemId: Number(saleItemId), quantity: Number(qty) }))
      .filter((i) => i.quantity > 0);
    if (items.length === 0) {
      toast.error("Enter a quantity to return for at least one item.");
      return;
    }
    if (!reason.trim()) {
      toast.error("Enter a reason for this return.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/medical-store/sale-returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleId: sale.id, reason: reason.trim(), restock, items }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Unable to record the return.");
        return;
      }
      toast.success(`Return ${data.return.returnNumber} recorded — refund PKR ${data.return.totalRefund}.`);
      setSaleId(""); setSaleSearch(""); setQuantities({}); setReason(""); setRestock(true);
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
            Sale Returns
          </Heading>
        </Box>
      </Flex>

      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" p={{ base: "20px", md: "28px" }} mb="8">
          <HStack mb="5">
            <Flex w="36px" h="36px" bg="#e9f1ef" color="#a34258" borderRadius="9px" align="center" justify="center">
              <FontAwesomeIcon icon={faRotateLeft} />
            </Flex>
            <Heading size="sm">Return Sold Medicine</Heading>
          </HStack>

          <Field.Root required mb="5" maxW="420px">
            <Field.Label fontWeight="700">Sale</Field.Label>
            <Box position="relative">
              <Input
                ref={saleInputRef}
                placeholder="Search by sale # or customer name…"
                value={saleSearch}
                bg={saleId ? "#f0faf7" : "white"}
                borderColor={saleId ? "#126b68" : undefined}
                onChange={(e) => {
                  setSaleSearch(e.target.value);
                  setSaleId("");
                  openSaleSearch();
                }}
                onFocus={openSaleSearch}
                onBlur={() => setTimeout(() => setShowSaleDropdown(false), 150)}
              />
              {showSaleDropdown && dropdownRect && createPortal(
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
                  {sales.filter((s) => `${s.saleNumber} ${s.customerName}`.toLowerCase().includes(saleSearch.trim().toLowerCase())).length === 0 ? (
                    <Box px="3" py="2"><Text fontSize="xs" color="#77908b">No sales found.</Text></Box>
                  ) : (
                    sales
                      .filter((s) => `${s.saleNumber} ${s.customerName}`.toLowerCase().includes(saleSearch.trim().toLowerCase()))
                      .map((s) => (
                        <Box
                          key={s.id}
                          px="3"
                          py="2"
                          cursor="pointer"
                          _hover={{ bg: "#f0faf7" }}
                          borderBottom="1px solid #f0f4f3"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectSale(s)}
                        >
                          <Text fontSize="sm" fontWeight="700" color="#123d3b">{s.saleNumber} — {s.customerName}</Text>
                          <Text fontSize="xs" color="#77908b">PKR {s.total}</Text>
                        </Box>
                      ))
                  )}
                </Box>,
                document.body
              )}
            </Box>
          </Field.Root>

          {sale && (
            <>
              <Box overflowX="auto" mb="5">
                <Table.Root size="sm">
                  <Table.Header>
                    <Table.Row bg="#fafcfb">
                      <Table.ColumnHeader>Medicine</Table.ColumnHeader>
                      <Table.ColumnHeader>Sold Quantity</Table.ColumnHeader>
                      <Table.ColumnHeader>Already Returned</Table.ColumnHeader>
                      <Table.ColumnHeader>Returnable</Table.ColumnHeader>
                      <Table.ColumnHeader>Unit Price</Table.ColumnHeader>
                      <Table.ColumnHeader>Return Quantity</Table.ColumnHeader>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {sale.items.map((item) => {
                      const returnedQty = Number(item.returnedQuantity ?? 0);
                      const returnable = Number(item.quantity) - returnedQty;
                      return (
                        <Table.Row key={item.id}>
                          <Table.Cell fontWeight="700" fontSize="sm">{item.name}</Table.Cell>
                          <Table.Cell fontSize="sm">{item.quantity}</Table.Cell>
                          <Table.Cell fontSize="sm">{returnedQty}</Table.Cell>
                          <Table.Cell fontSize="sm" fontWeight="700" color={returnable > 0 ? "#126b68" : "#a34258"}>{returnable}</Table.Cell>
                          <Table.Cell fontSize="sm">PKR {item.unitPrice}</Table.Cell>
                          <Table.Cell w="120px">
                            <Input
                              size="sm"
                              type="number"
                              min="0"
                              max={returnable}
                              disabled={returnable <= 0}
                              value={quantities[item.id] ?? ""}
                              onChange={(e) => {
                                const value = Math.min(Number(e.target.value) || 0, returnable);
                                setQuantities((prev) => ({ ...prev, [item.id]: value > 0 ? String(value) : "" }));
                              }}
                            />
                          </Table.Cell>
                        </Table.Row>
                      );
                    })}
                  </Table.Body>
                </Table.Root>
              </Box>

              <HStack mb="5" gap="3">
                <Button size="sm" variant={restock ? "solid" : "outline"} bg={restock ? "#126b68" : undefined} color={restock ? "white" : "#126b68"} borderColor="#c8dad5" onClick={() => setRestock(true)}>
                  Return to Sellable Stock
                </Button>
                <Button size="sm" variant={!restock ? "solid" : "outline"} bg={!restock ? "#a34258" : undefined} color={!restock ? "white" : "#a34258"} borderColor="#c8dad5" onClick={() => setRestock(false)}>
                  Quarantine / Damaged
                </Button>
              </HStack>

              <Field.Root required mb="5" maxW="500px">
                <Field.Label fontWeight="700">Reason</Field.Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Patient did not need the full course" rows={2} />
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
                  <Table.ColumnHeader>Sale #</Table.ColumnHeader>
                  <Table.ColumnHeader>Items</Table.ColumnHeader>
                  <Table.ColumnHeader>Refund</Table.ColumnHeader>
                  <Table.ColumnHeader>Stock</Table.ColumnHeader>
                  <Table.ColumnHeader>Reason</Table.ColumnHeader>
                  <Table.ColumnHeader>Date</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {history.length === 0 ? (
                  <Table.Row><Table.Cell colSpan={7}><Text py="8" textAlign="center" color="#77908b">No sale returns recorded yet.</Text></Table.Cell></Table.Row>
                ) : (
                  visibleHistory.map((r) => (
                    <Table.Row key={r.id} _hover={{ bg: "#f9fbfa" }}>
                      <Table.Cell fontWeight="800" color="#126b68">{r.returnNumber}</Table.Cell>
                      <Table.Cell fontSize="sm">{r.saleNumber}</Table.Cell>
                      <Table.Cell fontSize="xs" color="#556e68">{r.items.map((i) => `${i.medicineName} x${i.quantity}`).join(", ")}</Table.Cell>
                      <Table.Cell fontWeight="700" color="#a34258">PKR {r.totalRefund}</Table.Cell>
                      <Table.Cell><Badge colorPalette={r.restock ? "green" : "orange"} borderRadius="full">{r.restock ? "Restocked" : "Quarantined"}</Badge></Table.Cell>
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
