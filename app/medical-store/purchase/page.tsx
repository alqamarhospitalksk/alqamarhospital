"use client";
import { DateInput } from "../../date-input";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Box, Button, Flex, Heading, HStack, Input, NativeSelect, Table, Text } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBoxesStacked, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";

type PackagingLevel = { level: number; name: string; unitsInLevel: number; cumulativeUnits: number };
type Medicine = { id: number; name: string; unit: string; packagingLevels: PackagingLevel[]; lastPurchaseCostPerPack: number | null; lastPurchaseUnitsPerPack: number | null };
type Supplier = { id: number; name: string };
type PurchaseLine = {
  medicineItemId: string;
  search: string;
  batchNumber: string;
  levelName: string;
  quantityAtLevel: string;
  totalCost: string;
  salePriceOverride: string;
  expiryDate: string;
};
type PurchaseHistoryItem = {
  id: number;
  purchaseNumber: string;
  supplier: string;
  totalCost: string;
  createdAt: string;
  createdBy: string;
  batches: { medicineName: string; batchNumber: string | null; packsReceived: string | null; receivedLevelName: string | null; quantityReceived: string; expiryDate: string }[];
};

const emptyLine: PurchaseLine = { medicineItemId: "", search: "", batchNumber: "", levelName: "", quantityAtLevel: "", totalCost: "", salePriceOverride: "", expiryDate: "" };

function levelOptions(medicine: Medicine | undefined) {
  if (!medicine) return [];
  // Sorted by actual pack size (cumulativeUnits), not the stored level index — guarantees
  // the biggest pack (e.g. Carton) always comes first and the base unit always comes last,
  // regardless of what order the levels happened to be entered in on the Catalog page.
  const packLevels = medicine.packagingLevels.slice().sort((a, b) => b.cumulativeUnits - a.cumulativeUnits).map((l) => ({ name: l.name, cumulativeUnits: l.cumulativeUnits }));
  return [...packLevels, { name: medicine.unit, cumulativeUnits: 1 }];
}

export default function PurchasePage() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [history, setHistory] = useState<PurchaseHistoryItem[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);
  const [supplierId, setSupplierId] = useState("");
  const [lines, setLines] = useState<PurchaseLine[]>([{ ...emptyLine }]);
  const [saving, setSaving] = useState(false);

  // Rendered via a portal (see openMedicineSearch below) rather than positioned relative to
  // its own input — the input sits inside a horizontally-scrolling table (`overflowX="auto"`),
  // and any `overflow-x` other than `visible` forces the browser to clip the Y axis too.
  const [openMedicineDropdown, setOpenMedicineDropdown] = useState<number | null>(null);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const medicineInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  function openMedicineSearch(index: number) {
    const el = medicineInputRefs.current.get(index);
    if (el) {
      const rect = el.getBoundingClientRect();
      setDropdownRect({ top: rect.bottom, left: rect.left, width: rect.width });
    }
    setOpenMedicineDropdown(index);
  }

  useEffect(() => {
    if (openMedicineDropdown === null) return;
    const close = () => setOpenMedicineDropdown(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [openMedicineDropdown]);

  async function load() {
    try {
      const [medRes, supRes, purRes] = await Promise.all([
        fetch("/api/medical-store/medicines"),
        fetch("/api/medical-store/suppliers"),
        fetch("/api/medical-store/purchases"),
      ]);
      const medData = await medRes.json();
      const supData = await supRes.json();
      const purData = await purRes.json();
      if (medRes.ok) setMedicines(medData.items ?? []);
      if (supRes.ok) setSuppliers(supData.suppliers ?? []);
      if (purRes.ok) setHistory(purData.purchases ?? []);
    } catch {
      toast.error("Unable to reach the clinic server.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function updateLine(index: number, patch: Partial<PurchaseLine>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function selectMedicine(index: number, medicineItemId: string) {
    const medicine = medicines.find((m) => String(m.id) === medicineItemId);
    const options = levelOptions(medicine);
    updateLine(index, {
      medicineItemId,
      search: medicine?.name ?? "",
      levelName: options[0]?.name ?? "",
      quantityAtLevel: "",
      totalCost: "",
    });
    setOpenMedicineDropdown(null);
  }

  function addLine() {
    setLines((prev) => [...prev, { ...emptyLine }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
    setOpenMedicineDropdown(null);
  }

  async function submit() {
    if (!supplierId) {
      toast.error("Select a supplier.");
      return;
    }
    const validLines = lines.filter((l) => l.medicineItemId && l.levelName && l.quantityAtLevel && l.totalCost && l.expiryDate);
    if (validLines.length === 0) {
      toast.error("Add at least one complete purchase line (medicine, packaging level, quantity, total cost, expiry).");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/medical-store/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: Number(supplierId),
          lines: validLines.map((l) => ({
            medicineItemId: Number(l.medicineItemId),
            batchNumber: l.batchNumber,
            levelName: l.levelName,
            quantityAtLevel: Number(l.quantityAtLevel),
            totalCost: Number(l.totalCost),
            salePriceOverride: l.salePriceOverride || undefined,
            expiryDate: l.expiryDate,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Unable to record purchase.");
        return;
      }
      toast.success(`Purchase ${data.purchase.purchaseNumber} recorded — PKR ${data.purchase.totalCost}.`);
      setSupplierId("");
      setLines([{ ...emptyLine }]);
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
            Purchase (Stock In)
          </Heading>
        </Box>
      </Flex>

      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" p={{ base: "20px", md: "28px" }} mb="8">
          <HStack mb="5">
            <Flex w="36px" h="36px" bg="#e9f1ef" color="#126b68" borderRadius="9px" align="center" justify="center">
              <FontAwesomeIcon icon={faBoxesStacked} />
            </Flex>
            <Heading size="sm">New Purchase</Heading>
          </HStack>
          <Box mb="4" maxW="360px">
            <Text fontSize="sm" fontWeight="700" mb="2">Supplier</Text>
            <NativeSelect.Root>
              <NativeSelect.Field value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Select supplier</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </NativeSelect.Field>
            </NativeSelect.Root>
          </Box>

          <Box overflowX="auto" mb="4">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg="#fafcfb">
                  <Table.ColumnHeader>Medicine</Table.ColumnHeader>
                  <Table.ColumnHeader>Batch #</Table.ColumnHeader>
                  <Table.ColumnHeader>Received As</Table.ColumnHeader>
                  <Table.ColumnHeader>Quantity</Table.ColumnHeader>
                  <Table.ColumnHeader whiteSpace="nowrap">Total Units</Table.ColumnHeader>
                  <Table.ColumnHeader whiteSpace="nowrap">Total Cost (PKR)</Table.ColumnHeader>
                  <Table.ColumnHeader whiteSpace="nowrap">Sale Price Override</Table.ColumnHeader>
                  <Table.ColumnHeader>Expiry Date</Table.ColumnHeader>
                  <Table.ColumnHeader></Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {lines.map((line, index) => {
                  const medicine = medicines.find((m) => String(m.id) === line.medicineItemId);
                  const options = levelOptions(medicine);
                  const chosen = options.find((o) => o.name === line.levelName);
                  const totalUnits = Number(line.quantityAtLevel || 0) * (chosen?.cumulativeUnits ?? 0);
                  const matches = medicines.filter((m) => m.name.toLowerCase().includes(line.search.trim().toLowerCase()));
                  return (
                    <Table.Row key={index}>
                      <Table.Cell minW="200px">
                        <Box position="relative">
                          <Input
                            ref={(el) => {
                              if (el) medicineInputRefs.current.set(index, el);
                              else medicineInputRefs.current.delete(index);
                            }}
                            size="sm"
                            placeholder="Search medicine…"
                            value={line.search}
                            bg={line.medicineItemId ? "#f0faf7" : "white"}
                            borderColor={line.medicineItemId ? "#126b68" : undefined}
                            onChange={(e) => {
                              updateLine(index, { search: e.target.value, medicineItemId: "" });
                              openMedicineSearch(index);
                            }}
                            onFocus={() => openMedicineSearch(index)}
                            onBlur={() => setTimeout(() => setOpenMedicineDropdown((cur) => (cur === index ? null : cur)), 150)}
                          />
                          {openMedicineDropdown === index && dropdownRect && createPortal(
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
                              {matches.length === 0 ? (
                                <Box px="3" py="2"><Text fontSize="xs" color="#77908b">No medicines found.</Text></Box>
                              ) : (
                                matches.map((m) => (
                                  <Box
                                    key={m.id}
                                    px="3"
                                    py="2"
                                    cursor="pointer"
                                    _hover={{ bg: "#f0faf7" }}
                                    borderBottom="1px solid #f0f4f3"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => selectMedicine(index, String(m.id))}
                                  >
                                    <Text fontSize="sm" fontWeight="700" color="#123d3b">{m.name}</Text>
                                  </Box>
                                ))
                              )}
                            </Box>,
                            document.body
                          )}
                        </Box>
                      </Table.Cell>
                      <Table.Cell><Input size="sm" value={line.batchNumber} onChange={(e) => updateLine(index, { batchNumber: e.target.value })} /></Table.Cell>
                      <Table.Cell w="130px">
                        <NativeSelect.Root size="sm">
                          <NativeSelect.Field value={line.levelName} onChange={(e) => updateLine(index, { levelName: e.target.value })}>
                            {options.length === 0 && <option value="">Select medicine first</option>}
                            {options.map((o) => <option key={o.name} value={o.name}>{o.name}</option>)}
                          </NativeSelect.Field>
                        </NativeSelect.Root>
                      </Table.Cell>
                      <Table.Cell w="90px">
                        <Input size="sm" type="number" min="0" value={line.quantityAtLevel} onChange={(e) => updateLine(index, { quantityAtLevel: e.target.value })} />
                      </Table.Cell>
                      <Table.Cell fontSize="xs" fontWeight="700" color="#126b68">
                        {totalUnits > 0 ? `${totalUnits} ${medicine?.unit.toLowerCase() ?? "units"}` : "—"}
                      </Table.Cell>
                      <Table.Cell w="130px">
                        <Input size="sm" type="number" min="0" step="0.01" value={line.totalCost} onChange={(e) => updateLine(index, { totalCost: e.target.value })} />
                        {medicine?.lastPurchaseCostPerPack != null && (
                          <Text fontSize="10px" color="#77908b" mt="1">Last paid: PKR {medicine.lastPurchaseCostPerPack} for {medicine.lastPurchaseUnitsPerPack} {medicine.unit.toLowerCase()}</Text>
                        )}
                      </Table.Cell>
                      <Table.Cell w="140px"><Input size="sm" type="number" min="0" step="0.01" placeholder="optional" value={line.salePriceOverride} onChange={(e) => updateLine(index, { salePriceOverride: e.target.value })} /></Table.Cell>
                      <Table.Cell w="160px"><DateInput size="sm" value={line.expiryDate} onChange={(e) => updateLine(index, { expiryDate: e.target.value })} /></Table.Cell>
                      <Table.Cell>
                        <Button size="xs" variant="ghost" color="#a34258" onClick={() => removeLine(index)} disabled={lines.length === 1}>
                          <FontAwesomeIcon icon={faTrash} />
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table.Root>
          </Box>

          <HStack justify="space-between">
            <Button size="sm" variant="outline" borderColor="#c8dad5" color="#126b68" onClick={addLine}>
              <FontAwesomeIcon icon={faPlus} />
              &nbsp; Add Line
            </Button>
            <Button bg="#123d3b" color="white" _hover={{ bg: "#255d58" }} loading={saving} onClick={submit}>
              Record Purchase
            </Button>
          </HStack>
        </Box>

        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
          <Box p="5" borderBottom="1px solid #edf2f0">
            <Heading size="sm">Recent Purchases</Heading>
          </Box>
          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg="#fafcfb">
                  <Table.ColumnHeader>Purchase #</Table.ColumnHeader>
                  <Table.ColumnHeader>Supplier</Table.ColumnHeader>
                  <Table.ColumnHeader>Items</Table.ColumnHeader>
                  <Table.ColumnHeader>Total Cost</Table.ColumnHeader>
                  <Table.ColumnHeader>Date</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {history.length === 0 ? (
                  <Table.Row><Table.Cell colSpan={5}><Text py="8" textAlign="center" color="#77908b">No purchases recorded yet.</Text></Table.Cell></Table.Row>
                ) : (
                  visibleHistory.map((p) => (
                    <Table.Row key={p.id} _hover={{ bg: "#f9fbfa" }}>
                      <Table.Cell fontWeight="800" color="#126b68">{p.purchaseNumber}</Table.Cell>
                      <Table.Cell fontSize="sm">{p.supplier}</Table.Cell>
                      <Table.Cell fontSize="xs" color="#556e68">
                        {p.batches
                          .map((b) => (b.packsReceived ? `${b.medicineName} (${b.packsReceived} ${b.receivedLevelName ?? "unit"} = ${b.quantityReceived})` : `${b.medicineName} (${b.quantityReceived})`))
                          .join(", ")}
                      </Table.Cell>
                      <Table.Cell fontWeight="800" color="#123d3b">PKR {p.totalCost}</Table.Cell>
                      <Table.Cell fontSize="sm">{new Date(p.createdAt).toLocaleDateString("en-GB")}</Table.Cell>
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
