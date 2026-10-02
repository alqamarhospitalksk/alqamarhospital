"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge, Box, Button, Flex, Heading, HStack, Input, NativeSelect, Table, Text } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCashRegister, faPlus, faPrint, faTrash, faXmark } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";

type Patient = { id: number; mrNumber: string; name: string; fatherName?: string; cnic?: string | null };
type PackagingLevel = { level: number; name: string; unitsInLevel: number; cumulativeUnits: number };
type Medicine = {
  id: number;
  name: string;
  unit: string;
  packagingLevels: PackagingLevel[];
  salePrice: string;
  totalQuantity: number;
  sellableBatches: { quantity: number; unitCost: number }[];
};

// What `units` will cost, drawing from batches the same way the sale does (earliest expiry
// first), so a line that spans two batches with different purchase prices is costed exactly.
function fefoCost(med: Medicine, units: number) {
  let remaining = units;
  let cost = 0;
  for (const batch of med.sellableBatches) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, batch.quantity);
    cost += take * batch.unitCost;
    remaining -= take;
  }
  return cost;
}
const pkr = (value: number) => `PKR ${value.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
type SaleLine = { medicineItemId: string; quantities: Record<string, string>; search: string };
type HospitalSettings = { name: string; logoDataUrl?: string | null };
type Sale = {
  saleNumber: string;
  dailyToken: number;
  subtotal: string;
  discount: string;
  total: string;
  paymentMethod: string;
  customerName: string;
  mrNumber: string | null;
  items: { name: string; quantity: string; unitPrice: string; total: string; costPriceAtSale?: string | null }[];
};
type SaleHistoryItem = Sale & { id: number; createdAt: string; status: string };
type HistoryRange = "ALL" | "TODAY" | "WEEK" | "MONTH";

const emptyLine: SaleLine = { medicineItemId: "", quantities: {}, search: "" };

function withinHistoryRange(createdAt: string, range: HistoryRange) {
  if (range === "ALL") return true;
  const date = new Date(createdAt);
  const now = new Date();
  if (range === "TODAY") {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  }
  const cutoff = new Date(now);
  if (range === "WEEK") cutoff.setDate(now.getDate() - 7);
  else cutoff.setMonth(now.getMonth() - 1);
  return date >= cutoff;
}

function levelOptions(medicine: Medicine | undefined) {
  if (!medicine) return [];
  // Sorted by actual pack size (cumulativeUnits), not the stored level index — guarantees
  // the biggest pack (e.g. Carton) always comes first and the base unit always comes last,
  // regardless of what order the levels happened to be entered in on the Catalog page.
  // Each input is keyed by its level, not its name: a pack level can share its name with the
  // base unit (or another level), and name keys would make those boxes share one value.
  const packLevels = medicine.packagingLevels.slice().sort((a, b) => b.cumulativeUnits - a.cumulativeUnits).map((l) => ({ key: `L${l.level}`, name: l.name, cumulativeUnits: l.cumulativeUnits }));
  return [...packLevels, { key: "BASE", name: medicine.unit, cumulativeUnits: 1 }];
}

export default function SellMedicinePage() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [history, setHistory] = useState<SaleHistoryItem[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);
  const [historyRange, setHistoryRange] = useState<HistoryRange>("ALL");
  const [hospitalSettings, setHospitalSettings] = useState<HospitalSettings | null>(null);

  const [patientId, setPatientId] = useState("");
  const [walkInName, setWalkInName] = useState("");
  const [useWalkIn, setUseWalkIn] = useState(false);
  const [lines, setLines] = useState<SaleLine[]>([{ ...emptyLine }]);
  const [discount, setDiscount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [saving, setSaving] = useState(false);

  const [sale, setSale] = useState<Sale | null>(null);
  const [showSlipModal, setShowSlipModal] = useState(false);

  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isSearchingPatients, setIsSearchingPatients] = useState(false);
  const [patientHistory, setPatientHistory] = useState<SaleHistoryItem[] | null>(null);

  async function loadPatientHistory(id: number) {
    setPatientHistory(null);
    try {
      const res = await fetch(`/api/medical-store/sales?patientId=${id}`);
      const data = await res.json();
      if (res.ok) setPatientHistory(data.sales ?? []);
    } catch { /* the sale itself doesn't depend on this panel */ }
  }
  const patientSearchRef = useRef<HTMLDivElement>(null);

  // The medicine search dropdown is rendered via a portal (see medicineInputRefs/dropdownRect
  // below) rather than positioned relative to its own input — the input sits inside a
  // horizontally-scrolling table (`overflowX="auto"`), and any `overflow-x` other than
  // `visible` forces the browser to clip the Y axis too, cutting the dropdown off.
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
      const [medRes, saleRes, settingsRes] = await Promise.all([
        fetch("/api/medical-store/medicines"),
        fetch("/api/medical-store/sales"),
        fetch("/api/hospital-settings"),
      ]);
      const medData = await medRes.json();
      const saleData = await saleRes.json();
      if (medRes.ok) setMedicines(medData.items ?? []);
      if (saleRes.ok) setHistory(saleData.sales ?? []);
      if (settingsRes.ok) setHospitalSettings((await settingsRes.json()).settings);
    } catch {
      toast.error("Unable to reach the clinic server.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const q = patientSearch.trim();
    if (!q) {
      setPatientResults([]);
      setShowPatientDropdown(false);
      return;
    }
    if (selectedPatient && q === `${selectedPatient.mrNumber} · ${selectedPatient.name}`) return;
    let cancelled = false;
    setIsSearchingPatients(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!cancelled && res.ok) {
          setPatientResults(data.patients ?? []);
          setShowPatientDropdown(true);
        }
      } catch { /* ignore */ } finally {
        if (!cancelled) setIsSearchingPatients(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [patientSearch, selectedPatient]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (patientSearchRef.current && !patientSearchRef.current.contains(e.target as Node)) setShowPatientDropdown(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function updateLine(index: number, patch: Partial<SaleLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }
  function selectMedicine(index: number, medicineItemId: string) {
    const medicine = medicines.find((m) => String(m.id) === medicineItemId);
    const options = levelOptions(medicine);
    const baseOption = options[options.length - 1];
    updateLine(index, {
      medicineItemId,
      quantities: baseOption ? { [baseOption.key]: "1" } : {},
      search: medicine?.name ?? "",
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

  function lineUnits(line: SaleLine, med: Medicine | undefined) {
    const options = levelOptions(med);
    return options.reduce((sum, opt) => sum + Number(line.quantities[opt.key] || 0) * opt.cumulativeUnits, 0);
  }

  const subtotal = lines.reduce((sum, l) => {
    const med = medicines.find((m) => String(m.id) === l.medicineItemId);
    return sum + (med ? Number(med.salePrice) * lineUnits(l, med) : 0);
  }, 0);
  const total = Math.max(0, subtotal - Number(discount || 0));

  function resetForm() {
    setPatientId(""); setWalkInName(""); setUseWalkIn(false);
    setLines([{ ...emptyLine }]);
    setDiscount(""); setDiscountReason(""); setPaymentMethod("CASH");
    setPatientSearch(""); setSelectedPatient(null); setPatientResults([]); setPatientHistory(null);
  }

  async function submitSale() {
    const validLines = lines.filter((l) => {
      const med = medicines.find((m) => String(m.id) === l.medicineItemId);
      return l.medicineItemId && lineUnits(l, med) > 0;
    });
    if (validLines.length === 0) {
      toast.error("Add at least one medicine to sell.");
      return;
    }
    if (!useWalkIn && !patientId) {
      toast.error("Select a patient or switch to walk-in customer.");
      return;
    }
    if (useWalkIn && !walkInName.trim()) {
      toast.error("Enter the walk-in customer's name.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/medical-store/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: useWalkIn ? null : Number(patientId),
          customerName: useWalkIn ? walkInName.trim() : null,
          lines: validLines.map((l) => {
            const med = medicines.find((m) => String(m.id) === l.medicineItemId);
            return { medicineItemId: Number(l.medicineItemId), quantity: lineUnits(l, med) };
          }),
          discount: Number(discount || 0),
          discountReason,
          paymentMethod,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Unable to record sale.");
        return;
      }
      toast.success(`Sale ${data.sale.saleNumber} recorded — PKR ${data.sale.total}.`);
      setSale(data.sale);
      setShowSlipModal(true);
      resetForm();
      await load();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setSaving(false);
    }
  }

  function printReceipt(s: Sale) {
    const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
    const clinicName = hospitalSettings?.name || "CareLedger Clinic";
    const date = new Date().toLocaleDateString("en-PK");
    const rows = s.items.map((i) => `<div class="row"><span>${escapeHtml(i.name)} x${escapeHtml(i.quantity)}</span><strong>PKR ${escapeHtml(i.total)}</strong></div>`).join("");
    const discountRow = Number(s.discount) > 0 ? `<div class="row discount"><span>Discount</span><strong>- PKR ${escapeHtml(s.discount)}</strong></div>` : "";

    const printWindow = window.open("", "medicine-sale-receipt", "width=420,height=800");
    if (!printWindow) {
      toast.error("Allow pop-ups to print the receipt.");
      return;
    }
    printWindow.addEventListener("load", () => {
      printWindow.focus();
      printWindow.print();
      printWindow.addEventListener("afterprint", () => printWindow.close(), { once: true });
    }, { once: true });
    printWindow.document.write(`<!doctype html><html><head><title>Medicine Sale ${escapeHtml(s.saleNumber)}</title><style>
      @page { size: 80mm auto; margin: 0; }
      * { box-sizing: border-box; }
      html, body { width: 80mm; margin: 0; padding: 0; background: #fff; color: #000; }
      body { font-family: Arial, sans-serif; font-size: 10pt; line-height: 1.3; padding: 4mm; }
      .receipt { width: 72mm; }
      .center { text-align: center; }
      .clinic { font-size: 14pt; font-weight: 800; }
      .subtitle { font-size: 9pt; font-weight: 700; margin-top: 1mm; }
      .meta { font-size: 8pt; margin-top: 2mm; }
      .rule { border-top: 1px dashed #000; margin: 3mm 0; }
      .token { text-align: center; font-size: 13pt; font-weight: 800; margin: 2mm 0; }
      .row { display: flex; justify-content: space-between; gap: 4mm; padding: 1mm 0; }
      .total { font-size: 12pt; font-weight: 800; }
      .footer { text-align: center; font-size: 8pt; margin-top: 5mm; }
    </style></head><body><main class="receipt">
      <div class="center clinic">${escapeHtml(clinicName.toUpperCase())}</div>
      <div class="center subtitle">MEDICAL STORE RECEIPT</div>
      <div class="meta">Sale #: ${escapeHtml(s.saleNumber)}<br>Date: ${escapeHtml(date)}</div>
      <div class="rule"></div>
      <div class="token">TOKEN #${escapeHtml(String(s.dailyToken))}</div>
      <div class="meta"><strong>Customer:</strong> ${escapeHtml(s.customerName)}${s.mrNumber ? ` (MR #: ${escapeHtml(s.mrNumber)})` : ""}</div>
      <div class="rule"></div>
      ${rows}
      <div class="rule"></div>
      ${discountRow}<div class="row total"><span>TOTAL</span><span>PKR ${escapeHtml(s.total)}</span></div>
      <div class="row"><span>Payment</span><strong>${escapeHtml(s.paymentMethod.replaceAll("_", " "))}</strong></div>
      <div class="footer">Thank you</div>
    </main></body></html>`);
    printWindow.document.close();
  }

  const filteredHistory = history.filter((s) => withinHistoryRange(s.createdAt, historyRange));
  const historyPageCount = Math.max(1, Math.ceil(filteredHistory.length / historyPageSize));
  const visibleHistory = filteredHistory.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize);
  const firstHistoryRecord = filteredHistory.length === 0 ? 0 : (historyPage - 1) * historyPageSize + 1;
  const lastHistoryRecord = Math.min(historyPage * historyPageSize, filteredHistory.length);

  return (
    <Box minH="100vh" bg="#f5f7f8" color="#17252b">
      <Flex as="header" h="78px" bg="white" borderBottom="1px solid #e2e9e6" align="center" justify="space-between" px={{ base: "20px", md: "42px" }}>
        <Box>
          <Heading size="lg" letterSpacing="-0.04em">
            Sell Medicine
          </Heading>
        </Box>
      </Flex>

      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" p={{ base: "20px", md: "28px" }} mb="8">
          <HStack mb="5" justify="space-between">
            <HStack>
              <Flex w="36px" h="36px" bg="#e9f1ef" color="#126b68" borderRadius="9px" align="center" justify="center">
                <FontAwesomeIcon icon={faCashRegister} />
              </Flex>
              <Heading size="sm">New Sale</Heading>
            </HStack>
            <Button size="xs" variant="outline" borderColor="#c8dad5" color="#126b68" onClick={() => setUseWalkIn((v) => !v)}>
              {useWalkIn ? "Switch to registered patient" : "Switch to walk-in customer"}
            </Button>
          </HStack>

          {useWalkIn ? (
            <Box mb="5" maxW="360px">
              <Text fontSize="sm" fontWeight="700" mb="2">Walk-in Customer Name</Text>
              <Input placeholder="Customer name" value={walkInName} onChange={(e) => setWalkInName(e.target.value)} />
            </Box>
          ) : (
            <Box position="relative" mb="5" maxW="360px" ref={patientSearchRef}>
              <Text fontSize="sm" fontWeight="700" mb="2">Select Patient</Text>
              <Input
                placeholder="Search by MR number or patient name…"
                value={patientSearch}
                onChange={(e) => {
                  setPatientSearch(e.target.value);
                  if (selectedPatient) { setSelectedPatient(null); setPatientId(""); setPatientHistory(null); }
                }}
                onFocus={() => { if (patientResults.length > 0) setShowPatientDropdown(true); }}
                bg={selectedPatient ? "#f0faf7" : "white"}
                borderColor={selectedPatient ? "#126b68" : undefined}
                fontSize="sm"
              />
              {isSearchingPatients && <Text position="absolute" right="3" top="38px" fontSize="11px" color="#77908b">…</Text>}
              {showPatientDropdown && (
                <Box position="absolute" top="100%" left="0" right="0" mt="1" bg="white" border="1.5px solid #126b68" borderRadius="10px" boxShadow="0 8px 24px rgba(18,59,59,0.15)" zIndex="50" maxH="220px" overflowY="auto">
                  {patientResults.length === 0 ? (
                    <Box px="4" py="3"><Text fontSize="sm" color="#77908b">No patients found.</Text></Box>
                  ) : (
                    patientResults.map((p) => (
                      <Box key={p.id} px="4" py="2.5" cursor="pointer" _hover={{ bg: "#f0faf7" }} borderBottom="1px solid #f0f4f3"
                        onClick={() => { setSelectedPatient(p); setPatientId(String(p.id)); setPatientSearch(`${p.mrNumber} · ${p.name}`); setShowPatientDropdown(false); void loadPatientHistory(p.id); }}>
                        <Text fontSize="sm" fontWeight="700" color="#123d3b">{p.mrNumber}</Text>
                        <Text fontSize="xs" color="#506c65">{p.name} · S/O {p.fatherName}</Text>
                      </Box>
                    ))
                  )}
                </Box>
              )}
            </Box>
          )}

          {!useWalkIn && selectedPatient && (
            <Box mb="5" bg="#fafcfb" border="1px solid #e1e9e6" borderRadius="10px" p="4" maxW="720px">
              <Text fontSize="xs" fontWeight="700" color="#607d76" textTransform="uppercase" letterSpacing="0.06em" mb="2">
                {selectedPatient.name}&apos;s previous purchases
              </Text>
              {patientHistory == null ? (
                <Text fontSize="sm" color="#77908b">Loading…</Text>
              ) : patientHistory.length === 0 ? (
                <Text fontSize="sm" color="#77908b">No medicines bought before.</Text>
              ) : (
                <Box maxH="200px" overflowY="auto">
                  {patientHistory.map((s) => (
                    <Flex key={s.id} justify="space-between" gap="4" py="1.5" borderBottom="1px solid #edf2f0" fontSize="sm">
                      <Box minW="0">
                        <Text fontSize="xs" color="#77908b">{new Date(s.createdAt).toLocaleDateString("en-PK")} · {s.saleNumber}</Text>
                        <Text>{s.items.map((i) => `${i.name} ×${i.quantity}`).join(", ")}</Text>
                      </Box>
                      <Text fontWeight="700" whiteSpace="nowrap">PKR {s.total}</Text>
                    </Flex>
                  ))}
                </Box>
              )}
            </Box>
          )}

          <Box overflowX="auto" mb="4">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg="#fafcfb">
                  <Table.ColumnHeader>Medicine</Table.ColumnHeader>
                  <Table.ColumnHeader>Available</Table.ColumnHeader>
                  <Table.ColumnHeader>Price</Table.ColumnHeader>
                  <Table.ColumnHeader>Cost / Margin</Table.ColumnHeader>
                  <Table.ColumnHeader>Quantity (by level)</Table.ColumnHeader>
                  <Table.ColumnHeader>Total Units</Table.ColumnHeader>
                  <Table.ColumnHeader>Line Total</Table.ColumnHeader>
                  <Table.ColumnHeader></Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {lines.map((line, index) => {
                  const med = medicines.find((m) => String(m.id) === line.medicineItemId);
                  const options = levelOptions(med);
                  const units = lineUnits(line, med);
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
                                    <Text fontSize="xs" color="#77908b">{m.totalQuantity} {m.unit.toLowerCase()} available · PKR {m.salePrice}</Text>
                                  </Box>
                                ))
                              )}
                            </Box>,
                            document.body
                          )}
                        </Box>
                      </Table.Cell>
                      <Table.Cell fontSize="sm">{med ? `${med.totalQuantity} ${med.unit.toLowerCase()}` : "—"}</Table.Cell>
                      <Table.Cell fontSize="sm">{med ? `PKR ${med.salePrice}` : "—"}</Table.Cell>
                      <Table.Cell fontSize="sm" whiteSpace="nowrap">
                        {!med || med.sellableBatches.length === 0 ? (
                          "—"
                        ) : units > 0 ? (
                          (() => {
                            const cost = fefoCost(med, units);
                            const margin = Number(med.salePrice) * units - cost;
                            return (
                              <>
                                <Text>{pkr(cost)}</Text>
                                <Text fontSize="xs" fontWeight="700" color={margin >= 0 ? "#22633e" : "#a34258"}>Margin {pkr(margin)}</Text>
                              </>
                            );
                          })()
                        ) : (
                          <Text color="#607d76">{pkr(med.sellableBatches[0].unitCost)} / {med.unit.toLowerCase()}</Text>
                        )}
                      </Table.Cell>
                      <Table.Cell minW="220px">
                        <HStack gap="2" flexWrap="wrap">
                          {options.map((opt) => (
                            <Box key={opt.key}>
                              <Input
                                size="xs"
                                type="number"
                                min="0"
                                w="56px"
                                value={line.quantities[opt.key] ?? ""}
                                onChange={(e) => updateLine(index, { quantities: { ...line.quantities, [opt.key]: e.target.value } })}
                              />
                              <Text fontSize="9px" color="#77908b" textAlign="center">{opt.name}{opt.key !== "BASE" && options.some((o) => o.key !== opt.key && o.name === opt.name) ? ` (×${opt.cumulativeUnits})` : ""}</Text>
                            </Box>
                          ))}
                          {options.length === 0 && <Text fontSize="xs" color="#a0aeaa">Select a medicine</Text>}
                        </HStack>
                      </Table.Cell>
                      <Table.Cell fontSize="sm" fontWeight="700" color="#126b68">
                        {units > 0 ? `${units} ${med?.unit.toLowerCase() ?? "units"}` : "—"}
                      </Table.Cell>
                      <Table.Cell fontWeight="700">{med ? `PKR ${(Number(med.salePrice) * units).toFixed(2)}` : "—"}</Table.Cell>
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

          <Button size="sm" variant="outline" borderColor="#c8dad5" color="#126b68" onClick={addLine} mb="5">
            <FontAwesomeIcon icon={faPlus} />
            &nbsp; Add Line
          </Button>

          <HStack gap="3" mb="5" flexWrap="wrap" align="end">
            <Box>
              <Text fontSize="sm" fontWeight="700" mb="2">Discount (PKR)</Text>
              <Input type="number" min="0" w="140px" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </Box>
            <Box flex="1" minW="200px">
              <Text fontSize="sm" fontWeight="700" mb="2">Discount Reason</Text>
              <Input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="Required if discount > 0" />
            </Box>
            <Box>
              <Text fontSize="sm" fontWeight="700" mb="2">Payment Method</Text>
              <NativeSelect.Root w="180px">
                <NativeSelect.Field value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                  <option value="ONLINE">Online</option>
                </NativeSelect.Field>
              </NativeSelect.Root>
            </Box>
          </HStack>

          <Flex justify="space-between" align="center" bg="#f5f7f8" p="4" borderRadius="8px">
            <Text fontWeight="800" fontSize="lg" color="#123d3b">Total: PKR {total.toFixed(2)}</Text>
            <Button bg="#123d3b" color="white" _hover={{ bg: "#255d58" }} loading={saving} onClick={submitSale}>
              <FontAwesomeIcon icon={faCashRegister} />
              &nbsp; Complete Sale
            </Button>
          </Flex>
        </Box>

        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
          <Flex p="5" borderBottom="1px solid #edf2f0" justify="space-between" align="center" flexWrap="wrap" gap="3">
            <Heading size="sm">Recent Sales</Heading>
            <NativeSelect.Root width="140px" size="sm">
              <NativeSelect.Field
                value={historyRange}
                onChange={(event) => {
                  setHistoryRange(event.target.value as HistoryRange);
                  setHistoryPage(1);
                }}
              >
                <option value="ALL">All time</option>
                <option value="TODAY">Today</option>
                <option value="WEEK">Weekly</option>
                <option value="MONTH">Monthly</option>
              </NativeSelect.Field>
            </NativeSelect.Root>
          </Flex>
          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg="#fafcfb">
                  <Table.ColumnHeader>Sale #</Table.ColumnHeader>
                  <Table.ColumnHeader>Token #</Table.ColumnHeader>
                  <Table.ColumnHeader>Customer</Table.ColumnHeader>
                  <Table.ColumnHeader>Total</Table.ColumnHeader>
                  <Table.ColumnHeader>Status</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Action</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {filteredHistory.length === 0 ? (
                  <Table.Row><Table.Cell colSpan={6}><Text py="8" textAlign="center" color="#77908b">{history.length === 0 ? "No sales recorded yet." : "No sales in this period."}</Text></Table.Cell></Table.Row>
                ) : (
                  visibleHistory.map((s) => (
                    <Table.Row key={s.id} _hover={{ bg: "#f9fbfa" }}>
                      <Table.Cell fontWeight="800" color="#126b68">{s.saleNumber}</Table.Cell>
                      <Table.Cell><Badge bg="#dce96f" color="#123d3b" fontWeight="800" borderRadius="full" px="2">#{s.dailyToken}</Badge></Table.Cell>
                      <Table.Cell fontSize="sm">{s.customerName}</Table.Cell>
                      <Table.Cell fontWeight="800" color="#123d3b">PKR {s.total}</Table.Cell>
                      <Table.Cell><Badge colorPalette={s.status === "PAID" ? "green" : "red"} borderRadius="full">{s.status}</Badge></Table.Cell>
                      <Table.Cell textAlign="right">
                        <Button size="xs" variant="outline" borderColor="#c8dad5" color="#126b68" onClick={() => printReceipt(s)}>
                          <FontAwesomeIcon icon={faPrint} />
                          &nbsp; Print
                        </Button>
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
              {filteredHistory.length ? `Showing ${firstHistoryRecord}-${lastHistoryRecord} of ${filteredHistory.length}` : "No records"}
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

      {showSlipModal && sale && (
        <Flex position="fixed" inset="0" bg="rgba(15, 30, 28, 0.55)" backdropFilter="blur(3px)" zIndex="100" align="center" justify="center" p="4">
          <Box bg="white" borderRadius="16px" w="full" maxW="480px" boxShadow="0 20px 40px rgba(0,0,0,0.2)" overflow="hidden">
            <Flex justify="space-between" align="center" px="24px" py="16px" bg="#123d3b" color="white">
              <Heading size="sm">Sale {sale.saleNumber}</Heading>
              <Button variant="ghost" color="white" _hover={{ bg: "#255d58" }} p="2" minW="auto" onClick={() => setShowSlipModal(false)}>
                <FontAwesomeIcon icon={faXmark} size="lg" />
              </Button>
            </Flex>
            <Box p="24px">
              <Text fontSize="sm" color="#556e68" mb="2">Token #{sale.dailyToken} · {sale.customerName}</Text>
              {sale.items.map((i, idx) => (
                <Flex key={idx} justify="space-between" fontSize="sm" py="1">
                  <Text>{i.name} x{i.quantity}</Text>
                  <Text fontWeight="700">PKR {i.total}</Text>
                </Flex>
              ))}
              <Flex justify="space-between" borderTop="1px solid #e2e9e6" mt="2" pt="2" fontWeight="800">
                <Text>Total</Text>
                <Text color="#123d3b">PKR {sale.total}</Text>
              </Flex>
            </Box>
            <Flex justify="flex-end" gap="3" px="24px" py="14px" bg="#f7faf9" borderTop="1px solid #e2e9e6">
              <Button variant="outline" borderColor="#c8dad5" onClick={() => setShowSlipModal(false)}>Close</Button>
              <Button bg="#123d3b" color="white" _hover={{ bg: "#255d58" }} onClick={() => printReceipt(sale)}>
                <FontAwesomeIcon icon={faPrint} />
                &nbsp; Print Receipt
              </Button>
            </Flex>
          </Box>
        </Flex>
      )}
    </Box>
  );
}
