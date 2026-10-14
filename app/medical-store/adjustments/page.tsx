"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge, Box, Button, Field, Flex, Grid, Heading, HStack, Input, NativeSelect, Table, Text, Textarea } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";

type Medicine = { id: number; name: string; unit: string };
type Batch = { id: number; batchNumber: string | null; quantityRemaining: string; expiryDate: string; purchasePrice: string };
type AdjustmentHistoryItem = {
  id: number;
  medicineName: string;
  batchNumber: string | null;
  type: string;
  quantity: string;
  reason: string | null;
  adjustedBy: string;
  createdAt: string;
};

const types = [
  { value: "DAMAGE", label: "Damage" },
  { value: "EXPIRED", label: "Expired" },
  { value: "RETURN", label: "Return to Supplier" },
  { value: "CORRECTION", label: "Stock Correction" },
];

const typeColor: Record<string, string> = {
  DAMAGE: "orange",
  EXPIRED: "red",
  RETURN: "purple",
  CORRECTION: "blue",
  STOCK_COUNT: "teal",
};

export default function StockAdjustmentsPage() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [history, setHistory] = useState<AdjustmentHistoryItem[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

  const [medicineItemId, setMedicineItemId] = useState("");
  const [medicineSearch, setMedicineSearch] = useState("");
  const [batchId, setBatchId] = useState("");
  const [type, setType] = useState("DAMAGE");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Rendered via a portal so it can never be clipped by a scrolling ancestor, matching the
  // medicine search used on the Sell and Purchase pages.
  const [showMedicineDropdown, setShowMedicineDropdown] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const medicineInputRef = useRef<HTMLInputElement | null>(null);

  function openMedicineSearch() {
    const el = medicineInputRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      setDropdownRect({ top: rect.bottom, left: rect.left, width: rect.width });
    }
    setShowMedicineDropdown(true);
  }

  useEffect(() => {
    if (!showMedicineDropdown) return;
    const close = () => setShowMedicineDropdown(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [showMedicineDropdown]);

  async function load() {
    try {
      const [medRes, adjRes] = await Promise.all([
        fetch("/api/medical-store/medicines"),
        fetch("/api/medical-store/adjustments"),
      ]);
      const medData = await medRes.json();
      const adjData = await adjRes.json();
      if (medRes.ok) setMedicines(medData.items ?? []);
      if (adjRes.ok) setHistory(adjData.adjustments ?? []);
    } catch {
      toast.error("Unable to reach the clinic server.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setBatchId("");
    if (!medicineItemId) {
      setBatches([]);
      return;
    }
    let cancelled = false;
    setLoadingBatches(true);
    (async () => {
      try {
        const res = await fetch(`/api/medical-store/medicines/${medicineItemId}/batches`);
        const data = await res.json();
        if (!cancelled && res.ok) setBatches(data.batches ?? []);
      } catch {
        if (!cancelled) toast.error("Unable to load batches for this medicine.");
      } finally {
        if (!cancelled) setLoadingBatches(false);
      }
    })();
    return () => { cancelled = true; };
  }, [medicineItemId]);

  const medicine = medicines.find((m) => String(m.id) === medicineItemId);
  const batch = batches.find((b) => String(b.id) === batchId);

  function resetForm() {
    setMedicineItemId(""); setMedicineSearch(""); setBatchId(""); setBatches([]); setType("DAMAGE"); setQuantity(""); setReason("");
  }

  function selectMedicine(m: Medicine) {
    setMedicineItemId(String(m.id));
    setMedicineSearch(m.name);
    setShowMedicineDropdown(false);
  }

  async function submit() {
    if (!batchId) {
      toast.error("Select a medicine and batch to adjust.");
      return;
    }
    if (!Number(quantity) || Number(quantity) <= 0) {
      toast.error("Enter a valid quantity to remove.");
      return;
    }
    if (batch && Number(quantity) > Number(batch.quantityRemaining)) {
      toast.error(`Only ${batch.quantityRemaining} ${medicine?.unit.toLowerCase() ?? "units"} remaining in this batch.`);
      return;
    }
    if (!reason.trim()) {
      toast.error("Enter a reason for this adjustment.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/medical-store/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: Number(batchId), type, quantity: Number(quantity), reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Unable to record the adjustment.");
        return;
      }
      toast.success("Stock adjustment recorded.");
      resetForm();
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
            Stock Adjustments
          </Heading>
        </Box>
      </Flex>

      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" p={{ base: "20px", md: "28px" }} mb="8">
          <HStack mb="5">
            <Flex w="36px" h="36px" bg="#e9f1ef" color="#b26732" borderRadius="9px" align="center" justify="center">
              <FontAwesomeIcon icon={faTriangleExclamation} />
            </Flex>
            <Heading size="sm">Adjust Stock</Heading>
          </HStack>
          <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap="5" mb="5">
            <Field.Root required>
              <Field.Label fontWeight="700">Medicine</Field.Label>
              <Box position="relative">
                <Input
                  ref={medicineInputRef}
                  placeholder="Search medicine…"
                  value={medicineSearch}
                  bg={medicineItemId ? "#f0faf7" : "white"}
                  borderColor={medicineItemId ? "#126b68" : undefined}
                  onChange={(e) => {
                    setMedicineSearch(e.target.value);
                    setMedicineItemId("");
                    openMedicineSearch();
                  }}
                  onFocus={openMedicineSearch}
                  onBlur={() => setTimeout(() => setShowMedicineDropdown(false), 150)}
                />
                {showMedicineDropdown && dropdownRect && createPortal(
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
                    {medicines.filter((m) => m.name.toLowerCase().includes(medicineSearch.trim().toLowerCase())).length === 0 ? (
                      <Box px="3" py="2"><Text fontSize="xs" color="#77908b">No medicines found.</Text></Box>
                    ) : (
                      medicines
                        .filter((m) => m.name.toLowerCase().includes(medicineSearch.trim().toLowerCase()))
                        .map((m) => (
                          <Box
                            key={m.id}
                            px="3"
                            py="2"
                            cursor="pointer"
                            _hover={{ bg: "#f0faf7" }}
                            borderBottom="1px solid #f0f4f3"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => selectMedicine(m)}
                          >
                            <Text fontSize="sm" fontWeight="700" color="#123d3b">{m.name}</Text>
                          </Box>
                        ))
                    )}
                  </Box>,
                  document.body
                )}
              </Box>
            </Field.Root>

            <Field.Root required>
              <Field.Label fontWeight="700">Batch</Field.Label>
              <NativeSelect.Root>
                <NativeSelect.Field value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                  <option value="">{loadingBatches ? "Loading batches…" : medicineItemId ? "Select batch" : "Select a medicine first"}</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.batchNumber || `Batch #${b.id}`} — {b.quantityRemaining} left — exp {new Date(b.expiryDate).toLocaleDateString("en-GB")}
                    </option>
                  ))}
                </NativeSelect.Field>
              </NativeSelect.Root>
              {batch && (
                <Text fontSize="10px" color="#77908b" mt="1">
                  {batch.quantityRemaining} {medicine?.unit.toLowerCase()} remaining in this batch.
                </Text>
              )}
            </Field.Root>

            <Field.Root required>
              <Field.Label fontWeight="700">Adjustment Type</Field.Label>
              <NativeSelect.Root>
                <NativeSelect.Field value={type} onChange={(e) => setType(e.target.value)}>
                  {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </NativeSelect.Field>
              </NativeSelect.Root>
            </Field.Root>

            <Field.Root required>
              <Field.Label fontWeight="700">Quantity to Remove {medicine ? `(${medicine.unit.toLowerCase()})` : ""}</Field.Label>
              <Input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 5" />
            </Field.Root>
          </Grid>

          <Field.Root required mb="5">
            <Field.Label fontWeight="700">Reason</Field.Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Carton dropped and 5 bottles broke in storage" rows={2} />
          </Field.Root>

          <Button bg="#123d3b" color="white" _hover={{ bg: "#255d58" }} loading={saving} onClick={submit}>
            Record Adjustment
          </Button>
        </Box>

        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
          <Box p="5" borderBottom="1px solid #edf2f0">
            <Heading size="sm">Recent Adjustments</Heading>
          </Box>
          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg="#fafcfb">
                  <Table.ColumnHeader>Medicine</Table.ColumnHeader>
                  <Table.ColumnHeader>Batch</Table.ColumnHeader>
                  <Table.ColumnHeader>Type</Table.ColumnHeader>
                  <Table.ColumnHeader>Quantity</Table.ColumnHeader>
                  <Table.ColumnHeader>Reason</Table.ColumnHeader>
                  <Table.ColumnHeader>By</Table.ColumnHeader>
                  <Table.ColumnHeader>Date</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {history.length === 0 ? (
                  <Table.Row><Table.Cell colSpan={7}><Text py="8" textAlign="center" color="#77908b">No adjustments recorded yet.</Text></Table.Cell></Table.Row>
                ) : (
                  visibleHistory.map((a) => (
                    <Table.Row key={a.id} _hover={{ bg: "#f9fbfa" }}>
                      <Table.Cell fontWeight="700" fontSize="sm">{a.medicineName}</Table.Cell>
                      <Table.Cell fontSize="xs" color="#556e68">{a.batchNumber || "—"}</Table.Cell>
                      <Table.Cell>
                        <Badge colorPalette={typeColor[a.type] ?? "gray"} borderRadius="full">{a.type}</Badge>
                      </Table.Cell>
                      <Table.Cell fontWeight="700" color="#a34258">-{a.quantity}</Table.Cell>
                      <Table.Cell fontSize="xs" color="#556e68" maxW="240px">{a.reason || "—"}</Table.Cell>
                      <Table.Cell fontSize="xs">{a.adjustedBy}</Table.Cell>
                      <Table.Cell fontSize="xs">{new Date(a.createdAt).toLocaleString("en-GB", { hour12: true })}</Table.Cell>
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
