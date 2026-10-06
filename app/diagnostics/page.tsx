"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Field,
  Flex,
  Grid,
  Heading,
  HStack,
  Input,
  Link,
  NativeSelect,
  SimpleGrid,
  Table,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faBan,
  faCheck,
  faClockRotateLeft,
  faFlask,
  faPrint,
  faUser,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";

const moduleOptions = ["LABORATORY", "ECO", "X-RAY", "ECG", "ULTRASOUND"];
const moduleCopyLabels: Record<string, string> = {
  LABORATORY: "Lab",
  "X-RAY": "X-Ray",
  ECG: "ECG",
  ECO: "ECO",
  ULTRASOUND: "Ultrasound",
};
type Item = { id: number; name: string; price: string };
type HospitalSettings = { name: string; logoDataUrl?: string | null };
type Visit = {
  opdNumber: string;
  patient: { name: string; mrNumber: string };
  doctor: { name: string; specialization: string };
};
type TodayVisit = { opdNumber: string; patientName: string; mrNumber: string; doctorName: string };
type Receipt = {
  id: number;
  receiptNumber: string;
  module: string;
  moduleToken: number;
  subtotal?: string;
  discount?: string;
  discountReason?: string | null;
  total: string;
  paymentMethod: string;
  status: string;
  result?: string | null;
  opdNumber?: string;
  createdAt?: string;
  patient: { name: string; mrNumber: string; fatherName?: string; gender?: string };
  doctor: { name: string; specialization?: string };
  items: { name: string; price: string }[];
};

export default function DiagnosticsPage() {
  const router = useRouter();
  const [serviceModule, setServiceModule] = useState("LABORATORY");
  const [opdNumber, setOpdNumber] = useState("");
  const [todayVisits, setTodayVisits] = useState<TodayVisit[]>([]);
  const [opdSearch, setOpdSearch] = useState("");
  const [opdResults, setOpdResults] = useState<TodayVisit[] | null>(null);
  const [showOpdDropdown, setShowOpdDropdown] = useState(false);
  const [searchingOpd, setSearchingOpd] = useState(false);
  const opdSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [catalog, setCatalog] = useState<Item[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [testSearch, setTestSearch] = useState("");
  const [visit, setVisit] = useState<Visit | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [discount, setDiscount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [receiptsHistory, setReceiptsHistory] = useState<Receipt[]>([]);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [cancelModalReceipt, setCancelModalReceipt] = useState<Receipt | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelAction, setCancelAction] = useState("CANCEL");

  const [resultText, setResultText] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);
  const [hospitalSettings, setHospitalSettings] = useState<HospitalSettings | null>(null);

  // Two-copy thermal receipts (Department Copy / Patient Copy).
  function printDiagnosticCopy(copyType: "DEPARTMENT" | "PATIENT") {
    if (!receipt) return;
    const escapeHtml = (value: string) =>
      value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);

    const clinicName = hospitalSettings?.name || "Al Qamar Hospital";
    const date = receipt.createdAt ? receipt.createdAt.slice(0, 10) : new Date().toLocaleDateString("en-PK");
    const moduleLabel = moduleCopyLabels[receipt.module] ?? receipt.module;
    const copyLabel = copyType === "DEPARTMENT" ? `${moduleLabel} Copy` : "Patient Copy";
    const tests = receipt.items.map((item) => `<div class="row"><span>${escapeHtml(item.name)}</span><strong>PKR ${escapeHtml(item.price)}</strong></div>`).join("");
    const discount = Number(receipt.discount || 0) > 0 ? `<div class="row discount"><span>Discount</span><strong>- PKR ${escapeHtml(receipt.discount ?? "0")}</strong></div>` : "";

    const printWindow = window.open("", `diagnostic-${copyType.toLowerCase()}-copy`, "width=420,height=800");
    if (!printWindow) {
      toast.error("Allow pop-ups to print the diagnostic receipt.");
      return;
    }
    printWindow.addEventListener("load", () => {
      printWindow.focus();
      printWindow.print();
      printWindow.addEventListener("afterprint", () => printWindow.close(), { once: true });
    }, { once: true });
    printWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(receipt.module)} ${escapeHtml(copyLabel)} ${escapeHtml(receipt.receiptNumber)}</title><style>
      @page { size: 80mm auto; margin: 0; }
      * { box-sizing: border-box; }
      html, body { width: 80mm; margin: 0; padding: 0; background: #fff; color: #000; }
      body { font-family: Arial, sans-serif; font-size: 10pt; line-height: 1.3; padding: 4mm; }
      .receipt { width: 72mm; }
      .center { text-align: center; }
      .clinic { font-size: 14pt; font-weight: 800; }
      .subtitle { font-size: 9pt; font-weight: 700; margin-top: 1mm; }
      .copy-label { font-size: 9pt; font-weight: 700; margin-top: 1mm; text-decoration: underline; }
      .meta { font-size: 8pt; margin-top: 2mm; }
      .rule { border-top: 1px dashed #000; margin: 3mm 0; }
      .token { text-align: center; font-size: 13pt; font-weight: 800; margin: 2mm 0; }
      .patient { font-size: 10pt; margin: 2mm 0; }
      .row { display: flex; justify-content: space-between; gap: 4mm; padding: 1mm 0; }
      .row span { overflow-wrap: anywhere; }
      .total { font-size: 9pt; font-weight: 700; letter-spacing: 0.04em; }
      .discount { color: #000; }
      .footer { text-align: center; font-size: 8pt; margin-top: 5mm; }
    </style></head><body><main class="receipt">
      <div class="center clinic">${escapeHtml(clinicName.toUpperCase())}</div>
      <div class="center subtitle">${escapeHtml(receipt.module)} DEPARTMENT RECEIPT</div>
      <div class="center copy-label">${escapeHtml(copyLabel.toUpperCase())}</div>
      <div class="meta">Receipt #: ${escapeHtml(receipt.receiptNumber)}<br>Date: ${escapeHtml(date)}<br>OPD #: ${escapeHtml(receipt.opdNumber ?? "-")}</div>
      <div class="rule"></div>
      <div class="token">TOKEN #${escapeHtml(String(receipt.moduleToken))}</div>
      <div class="patient"><strong>Patient:</strong> ${escapeHtml(receipt.patient.name)}<br><strong>MR #:</strong> ${escapeHtml(receipt.patient.mrNumber)}<br><strong>Doctor:</strong> ${escapeHtml(receipt.doctor.name)}</div>
      <div class="rule"></div>
      <strong>TESTS</strong>${tests}
      <div class="rule"></div>
      ${discount}<div class="row total"><span>TOTAL (${escapeHtml(receipt.status)})</span><span>PKR ${escapeHtml(receipt.total)}</span></div>
      <div class="row"><span>Payment</span><strong>${escapeHtml(receipt.paymentMethod.replaceAll("_", " "))}</strong></div>
      <div class="footer">Thank you</div>
    </main></body></html>`);
    printWindow.document.close();
  }

  async function loadData(nextModule: string, nextOpd: string) {
    try {
      const response = await fetch(
        `/api/diagnostics?module=${encodeURIComponent(nextModule)}&opdNumber=${encodeURIComponent(nextOpd)}`
      );
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Unable to load diagnostic data.");
        return;
      }
      setCatalog(data.catalog);
      setVisit(data.visit);
      setTodayVisits(data.todayVisits ?? []);
      setSelected([]);
      setTestSearch("");
    } catch {
      toast.error("Unable to connect to clinic server.");
    }
  }

  async function loadHistory() {
    try {
      const response = await fetch("/api/diagnostics?history=true");
      const data = await response.json();
      if (response.ok) setReceiptsHistory(data.receipts ?? []);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    async function loadInitial() {
      await Promise.all([
        loadData("LABORATORY", ""),
        loadHistory(),
        (async () => {
          try {
            const res = await fetch("/api/hospital-settings");
            if (res.ok) {
              const data = await res.json();
              setHospitalSettings(data.settings);
            }
          } catch { /* ignore */ }
        })(),
      ]);
    }
    void loadInitial();
  }, []);

  // Typing clears the picked visit and searches (debounced); an empty box falls back to today's visits.
  function onOpdSearchChange(value: string) {
    setOpdSearch(value);
    setShowOpdDropdown(true);
    if (opdNumber) {
      setOpdNumber("");
      setVisit(null);
    }
    if (opdSearchTimer.current) clearTimeout(opdSearchTimer.current);
    const q = value.trim();
    if (!q) {
      setOpdResults(null);
      setSearchingOpd(false);
      return;
    }
    setSearchingOpd(true);
    opdSearchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/diagnostics?search=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (res.ok) setOpdResults(data.visits ?? []);
      } catch { /* ignore */ } finally {
        setSearchingOpd(false);
      }
    }, 250);
  }

  function selectVisit(item: TodayVisit) {
    setOpdNumber(item.opdNumber);
    setOpdSearch(`${item.opdNumber} · ${item.patientName}`);
    setShowOpdDropdown(false);
    setReceipt(null);
    void loadData(serviceModule, item.opdNumber);
  }

  async function createReceipt() {
    if (Number(discount || 0) > 0 && !discountReason.trim()) {
      toast.error("Please provide a reason note for the discount.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module: serviceModule,
          opdNumber,
          itemIds: selected,
          paymentMethod,
          discount: Number(discount || 0),
          discountReason,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Unable to create receipt.");
        return;
      }
      setReceipt(data.receipt);
      setResultText(data.receipt.result ?? "");
      setShowReceiptModal(true);
      toast.success(`Receipt ${data.receipt.receiptNumber} generated.`);
      setSelected([]);
      setDiscount("");
      setDiscountReason("");
      await loadHistory();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setLoading(false);
    }
  }

  async function saveResult() {
    if (!receipt || !resultText.trim()) return;
    try {
      const response = await fetch(`/api/diagnostics/${receipt.id}/result`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result: resultText }),
      });
      const data = await response.json();
      if (response.ok) {
        toast.success("Diagnostic result saved to patient record.");
        setReceipt({ ...receipt, result: resultText });
        await loadHistory();
      } else {
        toast.error(data.error ?? "Unable to save result.");
      }
    } catch {
      toast.error("Unable to reach the clinic server.");
    }
  }

  async function submitCancellation() {
    if (!cancelModalReceipt || !cancelReason.trim()) {
      toast.error("A cancellation/refund reason is required.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/diagnostics/${cancelModalReceipt.id}/cancel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: cancelAction, reason: cancelReason }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Unable to process cancellation.");
        return;
      }
      toast.success(`Receipt ${cancelModalReceipt.receiptNumber} is now ${data.receipt.status}.`);
      setCancelModalReceipt(null);
      setCancelReason("");
      if (receipt && receipt.id === cancelModalReceipt.id) {
        setReceipt({ ...receipt, status: data.receipt.status });
      }
      await loadHistory();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setLoading(false);
    }
  }

  function openReceiptModal(r: Receipt) {
    setReceipt(r);
    setResultText(r.result ?? "");
    setShowReceiptModal(true);
  }

  const subtotal = selected.reduce(
    (sum, id) => sum + Number(catalog.find((item) => item.id === id)?.price ?? 0),
    0
  );
  const total = Math.max(0, subtotal - Number(discount || 0));
  // Filters the test list as you type (any part of the name, any case). Ticked tests stay ticked
  // and counted in the bill even while the search hides them.
  const testQuery = testSearch.trim().toLowerCase();
  const filteredCatalog = testQuery ? catalog.filter((item) => item.name.toLowerCase().includes(testQuery)) : catalog;
  const title = serviceModule === "LABORATORY" ? "laboratory" : serviceModule.toLowerCase();

  const filteredHistory = receiptsHistory.filter((r) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      r.receiptNumber.toLowerCase().includes(q) ||
      (r.opdNumber && r.opdNumber.toLowerCase().includes(q)) ||
      r.patient.name.toLowerCase().includes(q) ||
      r.patient.mrNumber.toLowerCase().includes(q) ||
      r.doctor.name.toLowerCase().includes(q)
    );
  });
  const historyPageCount = Math.max(1, Math.ceil(filteredHistory.length / historyPageSize));
  const visibleHistory = filteredHistory.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize);
  const firstHistoryRecord = filteredHistory.length === 0 ? 0 : (historyPage - 1) * historyPageSize + 1;
  const lastHistoryRecord = Math.min(historyPage * historyPageSize, filteredHistory.length);

  return (
    <Box minH="100vh" bg="#eef2f0" color="#0e2420">
      {/* Sticky Top Navigation Header */}
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
              Tests Counter
            </Heading>
          </Box>
        </HStack>
      </Flex>

      {/* Main Content */}
      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>

        {/* Module Selector Tabs */}
        <HStack gap="2" mb="5" overflowX="auto">
          {moduleOptions.map((option) => (
            <Button
              key={option}
              size="sm"
              variant={serviceModule === option ? "solid" : "outline"}
              bg={serviceModule === option ? "linear-gradient(135deg, #1a8070 0%, #0f5a52 100%)" : "white"}
              color={serviceModule === option ? "white" : "#506c65"}
              borderColor={serviceModule === option ? "transparent" : "#c8dad5"}
              borderRadius="8px"
              fontWeight="700"
              boxShadow={serviceModule === option ? "0 2px 8px rgba(26,128,112,0.25)" : "none"}
              onClick={() => {
                setServiceModule(option);
                void loadData(option, opdNumber);
              }}
            >
              {option.replace("LABORATORY", "LAB")}
            </Button>
          ))}
        </HStack>


        {/* Counter Form Container */}
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="14px" boxShadow="0 2px 12px rgba(14,36,32,0.04)" p={{ base: "20px", md: "28px" }} mb="8">
          <HStack mb="6">
            <Flex w="36px" h="36px" bg="#e9f1ef" color="#126b68" borderRadius="9px" align="center" justify="center">
              <FontAwesomeIcon icon={faFlask} />
            </Flex>
            <Box>
              <Heading size="sm">New {title} receipt</Heading>
            </Box>
          </HStack>

          <Box position="relative" mb="6" maxW="560px">
            <Text fontSize="sm" fontWeight="700" mb="2">
              OPD Number
            </Text>
            <Input
              placeholder="Search by OPD number, patient name or MR number…"
              value={opdSearch}
              bg={visit ? "#f0faf7" : undefined}
              borderColor={visit ? "#126b68" : undefined}
              onChange={(event) => onOpdSearchChange(event.target.value)}
              onFocus={() => setShowOpdDropdown(true)}
              onBlur={() => setTimeout(() => setShowOpdDropdown(false), 150)}
            />
            {searchingOpd && <Text position="absolute" right="3" top="44px" fontSize="11px" color="#77908b">…</Text>}
            {showOpdDropdown && !visit && (() => {
              const list = opdResults ?? todayVisits;
              return (
                <Box position="absolute" top="100%" left="0" right="0" mt="1" bg="white" border="1.5px solid #126b68" borderRadius="10px" boxShadow="0 8px 24px rgba(18,59,59,0.15)" zIndex="50" maxH="260px" overflowY="auto">
                  {opdResults == null && list.length > 0 && (
                    <Text px="4" pt="2" pb="1" fontSize="10px" fontWeight="700" color="#77908b" textTransform="uppercase" letterSpacing="0.06em">Today&apos;s OPD visits</Text>
                  )}
                  {list.length === 0 ? (
                    <Box px="4" py="3"><Text fontSize="sm" color="#77908b">{opdResults == null ? "No OPD visits today. Type to search older visits." : "No matching OPD visits."}</Text></Box>
                  ) : (
                    list.map((item) => (
                      <Box
                        key={item.opdNumber}
                        px="4"
                        py="2.5"
                        cursor="pointer"
                        _hover={{ bg: "#f0faf7" }}
                        borderBottom="1px solid #f0f4f3"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectVisit(item)}
                      >
                        <Text fontSize="sm" fontWeight="700" color="#123d3b">{item.opdNumber}</Text>
                        <Text fontSize="xs" color="#506c65">{item.patientName} · MR {item.mrNumber} · Dr. {item.doctorName}</Text>
                      </Box>
                    ))
                  )}
                </Box>
              );
            })()}
          </Box>

          {visit && (
            <Box bg="#f5f7f8" borderRadius="8px" p="4" mb="6" border="1px solid #e1e9e6">
              <HStack justify="space-between">
                <Box>
                  <Text fontSize="xs" color="#77908b">
                    Patient Name
                  </Text>
                  <Text fontWeight="800" color="#123d3b">
                    {visit.patient.name}
                  </Text>
                  <Text fontSize="xs" color="#607d76">
                    MR: {visit.patient.mrNumber}
                  </Text>
                </Box>
                <Box textAlign="right">
                  <Text fontSize="xs" color="#77908b">
                    Referring Doctor
                  </Text>
                  <Text fontWeight="800" color="#123d3b">
                    {visit.doctor.name}
                  </Text>
                  <Text fontSize="xs" color="#607d76">
                    {visit.doctor.specialization}
                  </Text>
                </Box>
              </HStack>
            </Box>
          )}

          <Text fontSize="sm" fontWeight="700" mb="3">
            Select Tests to Bill ({serviceModule})
          </Text>
          {catalog.length > 0 && (
            <Box mb="3">
              <Flex gap="3" align="center" wrap="wrap">
                <Box position="relative" flex="1" minW="220px">
                  <Input
                    placeholder={`Search ${title} tests by name…`}
                    value={testSearch}
                    autoComplete="off"
                    onChange={(event) => setTestSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setTestSearch("");
                    }}
                    fontSize="sm"
                  />
                </Box>
                {testSearch && (
                  <Button size="sm" variant="outline" borderColor="#c8dad5" color="#126b68" onClick={() => setTestSearch("")}>
                    Clear
                  </Button>
                )}
              </Flex>
              <Text fontSize="xs" color="#607d76" mt="2">
                {testQuery ? `Showing ${filteredCatalog.length} of ${catalog.length} tests` : `${catalog.length} tests`}
                {selected.length > 0 ? ` · ${selected.length} selected` : ""}
              </Text>
            </Box>
          )}
          <SimpleGrid columns={{ base: 1, md: 2 }} gap="3" mb="6">
            {catalog.length === 0 ? (
              <Text color="#77908b" fontSize="sm">
                No tests active in this module catalog.
              </Text>
            ) : filteredCatalog.length === 0 ? (
              <Text color="#77908b" fontSize="sm">
                No tests found for &ldquo;{testSearch}&rdquo;.
              </Text>
            ) : (
              filteredCatalog.map((item) => (
                <Checkbox.Root
                  key={item.id}
                  checked={selected.includes(item.id)}
                  onCheckedChange={(details) =>
                    setSelected(
                      details.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id)
                    )
                  }
                  p="3"
                  border="1px solid #e1e9e6"
                  borderRadius="8px"
                  _hover={{ bg: "#f8faf9" }}
                >
                  <Checkbox.HiddenInput />
                  <Checkbox.Control />
                  <Checkbox.Label flex="1">
                    <Flex justify="space-between">
                      <Text fontWeight="600">{item.name}</Text>
                      <Text fontWeight="800" color="#126b68">
                        PKR {item.price}
                      </Text>
                    </Flex>
                  </Checkbox.Label>
                </Checkbox.Root>
              ))
            )}
          </SimpleGrid>

          {/* Billing & Discount Bar */}
          <Flex
            justify="space-between"
            align="center"
            borderTop="1px solid #edf2f0"
            pt="5"
            gap="4"
            direction={{ base: "column", md: "row" }}
          >
            <HStack flex="1" gap="3">
              <Input
                type="number"
                min="0"
                placeholder="Discount (PKR)"
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
                w="140px"
              />
              <Input
                placeholder="Discount reason (Required if discount > 0)"
                value={discountReason}
                onChange={(event) => setDiscountReason(event.target.value)}
                flex="1"
              />
            </HStack>

            <HStack gap="3">
              <NativeSelect.Root>
                <NativeSelect.Field value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                  <option value="ONLINE">Online</option>
                </NativeSelect.Field>
              </NativeSelect.Root>

              <Text fontWeight="900" whiteSpace="nowrap" fontSize="lg" color="#123d3b">
                PKR {total.toFixed(2)}
              </Text>
              <Button
                onClick={createReceipt}
                loading={loading}
                disabled={!visit || selected.length === 0}
                bg="linear-gradient(135deg, #1a8070 0%, #0f5a52 100%)"
                color="white"
                borderRadius="9px"
                fontWeight="700"
                boxShadow="0 3px 12px rgba(26,128,112,0.28)"
                _hover={{ boxShadow: "0 5px 20px rgba(26,128,112,0.42)", transform: "translateY(-1px)" }}
                _active={{ transform: "translateY(0)" }}
                transition="all 0.18s ease"
              >
                <FontAwesomeIcon icon={faCheck} />
                &nbsp; Generate Receipt
              </Button>
            </HStack>
          </Flex>
        </Box>

        {/* Diagnostic Receipt History Table */}
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="14px" boxShadow="0 2px 12px rgba(14,36,32,0.04)" overflow="hidden">
          <Box p="5" borderBottom="1px solid #edf2f0">
            <Flex justify="space-between" align="center" direction={{ base: "column", sm: "row" }} gap="4">
              <HStack gap="3">
                <Flex w="34px" h="34px" bg="#e9f1ef" color="#126b68" borderRadius="9px" align="center" justify="center">
                  <FontAwesomeIcon icon={faClockRotateLeft} />
                </Flex>
                <Box>
                  <Heading size="sm">Tests Receipt History</Heading>
                </Box>
              </HStack>

              <Input
                placeholder="Search history by receipt #, OPD #, patient, or doctor..."
                value={searchFilter}
                onChange={(event) => {
                  setSearchFilter(event.target.value);
                  setHistoryPage(1);
                }}
                maxW="360px"
                size="sm"
                borderRadius="8px"
              />
            </Flex>
          </Box>

          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg="#fafcfb">
                  <Table.ColumnHeader>Receipt #</Table.ColumnHeader>
                  <Table.ColumnHeader>Token #</Table.ColumnHeader>
                  <Table.ColumnHeader>Module</Table.ColumnHeader>
                  <Table.ColumnHeader>Patient</Table.ColumnHeader>
                  <Table.ColumnHeader>Doctor</Table.ColumnHeader>
                  <Table.ColumnHeader>Amount</Table.ColumnHeader>
                  <Table.ColumnHeader>Status</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Actions</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {filteredHistory.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={8}>
                      <Text py="8" textAlign="center" color="#77908b">
                        No diagnostic receipts found in history.
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  visibleHistory.map((item) => (
                    <Table.Row key={item.id} _hover={{ bg: "#f9fbfa" }}>
                      <Table.Cell fontWeight="800" color="#126b68">
                        {item.receiptNumber}
                      </Table.Cell>
                      <Table.Cell>
                        <Badge bg="#dce96f" color="#123d3b" fontWeight="800" borderRadius="full" px="2">
                          #{item.moduleToken}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell fontSize="xs" fontWeight="700">
                        {item.module}
                      </Table.Cell>
                      <Table.Cell>
                        <Text fontWeight="700" fontSize="sm">
                          {item.patient.name}
                        </Text>
                        <Text fontSize="xs" color="#77908b">
                          MR: {item.patient.mrNumber}
                        </Text>
                      </Table.Cell>
                      <Table.Cell fontSize="sm">{item.doctor.name}</Table.Cell>
                      <Table.Cell fontWeight="800" color="#123d3b">
                        PKR {item.total}
                      </Table.Cell>
                      <Table.Cell>
                        <Badge
                          colorPalette={
                            item.status === "PAID" ? "green" : item.status === "REFUNDED" ? "orange" : "red"
                          }
                          borderRadius="full"
                        >
                          {item.status}
                        </Badge>
                      </Table.Cell>

                      <Table.Cell textAlign="right">
                        <HStack justify="flex-end" gap="2">
                          <Button size="xs" variant="outline" borderColor="#c8dad5" color="#126b68" onClick={() => openReceiptModal(item)}>
                            <FontAwesomeIcon icon={faPrint} />
                            &nbsp; View / Print
                          </Button>
                          {item.status === "PAID" && (
                            <Button
                              size="xs"
                              variant="outline"
                              borderColor="#f2c8d0"
                              color="#a34258"
                              onClick={() => {
                                setCancelModalReceipt(item);
                                setCancelReason("");
                                setCancelAction("CANCEL");
                              }}
                            >
                              <FontAwesomeIcon icon={faBan} />
                              &nbsp; Refund
                            </Button>
                          )}
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
              <Button
                size="sm"
                variant="outline"
                disabled={historyPage === 1}
                onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
              >
                Previous
              </Button>
              {Array.from({ length: historyPageCount }, (_, index) => index + 1).map((page) => (
                <Button
                  key={page}
                  size="sm"
                  variant={page === historyPage ? "solid" : "outline"}
                  bg={page === historyPage ? "#123d3b" : undefined}
                  color={page === historyPage ? "white" : undefined}
                  onClick={() => setHistoryPage(page)}
                >
                  {page}
                </Button>
              ))}
              <Button
                size="sm"
                variant="outline"
                disabled={historyPage === historyPageCount}
                onClick={() => setHistoryPage((page) => Math.min(historyPageCount, page + 1))}
              >
                Next
              </Button>
            </HStack>
          </Flex>
        </Box>
      </Box>

      {/* Diagnostic Receipt & Result Printable Modal */}
      {showReceiptModal && receipt && (
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
            maxW="760px"
            boxShadow="0 20px 40px rgba(0,0,0,0.2)"
            overflow="hidden"
          >
            <Flex justify="space-between" align="center" px="28px" py="14px" bg="#123d3b" color="white" className="no-print">
              <HStack gap="3">
                <Flex w="32px" h="32px" bg="#d6e66c" color="#123d3b" borderRadius="9px" align="center" justify="center">
                  <FontAwesomeIcon icon={faFlask} size="sm" />
                </Flex>
                <Heading size="sm">Receipt Preview</Heading>
              </HStack>
              <Button variant="ghost" color="white" _hover={{ bg: "#255d58" }} p="2" minW="auto" onClick={() => setShowReceiptModal(false)}>
                  <FontAwesomeIcon icon={faXmark} size="lg" />
                </Button>
            </Flex>

            <Box p={{ base: "20px", md: "28px" }} maxH="80vh" overflowY="auto">
              {/* Printable Receipt Layout */}
              <Box className="printable-slip diagnostic-printable-slip" p="4" border="2px solid #123d3b" borderRadius="12px" bg="white">
                <Flex justify="space-between" align="center" borderBottom="2px solid #123d3b" pb="3" mb="4">
                  <HStack gap="3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={hospitalSettings?.logoDataUrl || "/images/logo.png"}
                      alt="Hospital logo"
                      style={{ width: 40, height: 40, objectFit: "contain" }}
                    />
                    <Box>
                      <Text fontSize="lg" fontWeight="900" color="#123d3b">
                        {(hospitalSettings?.name || "Al Qamar Hospital").toUpperCase()}
                      </Text>
                      <Text fontSize="10px" color="#556e68" textTransform="uppercase" letterSpacing="0.1em">
                        {receipt.module} DEPARTMENT RECEIPT
                      </Text>
                    </Box>
                  </HStack>
                  <Box textAlign="right">
                    <Text fontSize="xs" fontWeight="800" color="#123d3b">
                      Receipt #: {receipt.receiptNumber}
                    </Text>
                    <Text fontSize="10px" color="#77908b">
                      Date: {receipt.createdAt ? receipt.createdAt.slice(0, 10) : new Date().toLocaleDateString("en-PK")}
                    </Text>
                  </Box>
                </Flex>

                <Flex bg="#dce96f" borderRadius="10px" p="4" justify="space-between" mb="5" align="center">
                  <Box>
                    <Text fontSize="10px" color="#46633e" textTransform="uppercase" fontWeight="900" letterSpacing="0.08em">
                      Token Number
                    </Text>
                    <Heading size="2xl" color="#123d3b" lineHeight="1">
                      #{receipt.moduleToken}
                    </Heading>
                  </Box>
                  <Box textAlign="right">
                    <Text fontSize="xs" color="#46633e" fontWeight="700">
                      Patient Details
                    </Text>
                    <Text fontSize="sm" fontWeight="800" color="#123d3b">
                      {receipt.patient.name}
                    </Text>
                    <Text fontSize="xs" color="#123d3b">
                      MR #: {receipt.patient.mrNumber}
                    </Text>
                  </Box>
                </Flex>

                <Box mb="4" fontSize="xs" color="#556e68">
                  <Text>
                    <strong>Referring Doctor:</strong> {receipt.doctor.name}
                  </Text>
                  {receipt.opdNumber && (
                    <Text mt="1">
                      <strong>Linked OPD #:</strong> {receipt.opdNumber}
                    </Text>
                  )}
                </Box>

                <Text fontSize="xs" textTransform="uppercase" fontWeight="800" color="#123d3b" mb="2">
                  Billed Diagnostic Tests
                </Text>
                <Box borderTop="1px solid #123d3b" borderBottom="1px solid #123d3b" py="2" mb="3">
                  {receipt.items.map((item) => (
                    <Flex key={item.name} justify="space-between" py="1" fontSize="sm">
                      <Text fontWeight="600">{item.name}</Text>
                      <Text fontWeight="700">PKR {item.price}</Text>
                    </Flex>
                  ))}
                </Box>

                {Number(receipt.discount || 0) > 0 && (
                  <Flex justify="space-between" fontSize="xs" color="#a34258" mb="2">
                    <Text fontWeight="700">Discount ({receipt.discountReason ?? "Approved"})</Text>
                    <Text fontWeight="700">- PKR {receipt.discount}</Text>
                  </Flex>
                )}

                <Flex justify="space-between" pt="2" borderTop="1px solid #123d3b">
                  <Text fontSize="xs" fontWeight="700" letterSpacing="0.04em">
                    Total Amount ({receipt.status})
                  </Text>
                  <Text fontSize="xs" fontWeight="700" letterSpacing="0.04em" color="#123d3b">
                    PKR {receipt.total}
                  </Text>
                </Flex>

                <Flex justify="space-between" mt="2" fontSize="xs" color="#556e68">
                  <Text>Payment Method</Text>
                  <Text fontWeight="700">{receipt.paymentMethod.replaceAll("_", " ")}</Text>
                </Flex>

                {/* Technician Report Result Card Display */}
                {receipt.result && (
                  <Box mt="6" pt="4" borderTop="2px dashed #123d3b">
                    <Text fontSize="xs" fontWeight="900" color="#123d3b" textTransform="uppercase" mb="2">
                      Formal Diagnostic Result Report
                    </Text>
                    <Box bg="#f8faf9" p="4" borderRadius="8px" border="1px solid #c8dad5" fontSize="sm" whiteSpace="pre-wrap">
                      {receipt.result}
                    </Box>
                    <Flex justify="space-between" align="end" mt="6" pt="2">
                      <Text fontSize="9px" color="#77908b">Diagnostic Technician / Pathologist Sign</Text>
                      <Box w="140px" borderBottom="1px solid #123d3b" />
                    </Flex>
                  </Box>
                )}
              </Box>


            </Box>

            <Flex justify="flex-end" gap="2" px="28px" py="16px" bg="#f7faf9" borderTop="1px solid #e2e9e6" className="no-print" wrap="nowrap" overflowX="auto">
              <Button size="sm" flexShrink="0" variant="outline" borderColor="#c8dad5" onClick={() => setShowReceiptModal(false)}>
                Close
              </Button>
              <Button size="sm" flexShrink="0" variant="outline" borderColor="#c8dad5" color="#126b68" onClick={() => printDiagnosticCopy("DEPARTMENT")}>
                <FontAwesomeIcon icon={faFlask} />
                &nbsp; Print {moduleCopyLabels[receipt.module] ?? receipt.module} Copy
              </Button>
              <Button size="sm" flexShrink="0" variant="outline" borderColor="#c8dad5" color="#126b68" onClick={() => printDiagnosticCopy("PATIENT")}>
                <FontAwesomeIcon icon={faUser} />
                &nbsp; Print Patient Copy
              </Button>
            </Flex>
          </Box>
        </Flex>
      )}

      {/* Cancellation / Refund Modal */}
      {cancelModalReceipt && (
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
          <Box bg="white" borderRadius="16px" w="full" maxW="520px" boxShadow="0 20px 40px rgba(0,0,0,0.2)" overflow="hidden">
            <Flex justify="space-between" align="center" px="28px" py="20px" bg="#a34258" color="white">
              <HStack gap="3">
                <Flex w="36px" h="36px" bg="#fbecef" color="#a34258" borderRadius="10px" align="center" justify="center">
                  <FontAwesomeIcon icon={faBan} />
                </Flex>
                <Box>
                  <Heading size="sm">Cancel or Refund Receipt</Heading>
                  <Text fontSize="xs" color="#f5d6dc">
                    Receipt #{cancelModalReceipt.receiptNumber} · PKR {cancelModalReceipt.total}
                  </Text>
                </Box>
              </HStack>
              <Button variant="ghost" color="white" _hover={{ bg: "#b84f66" }} p="2" minW="auto" onClick={() => setCancelModalReceipt(null)}>
                <FontAwesomeIcon icon={faXmark} size="lg" />
              </Button>
            </Flex>

            <Box p="28px">

              <VStack align="stretch" gap="4">
                <Field.Root required>
                  <Field.Label fontWeight="700">Action Type</Field.Label>
                  <NativeSelect.Root>
                    <NativeSelect.Field value={cancelAction} onChange={(event) => setCancelAction(event.target.value)}>
                      <option value="CANCEL">Cancel Receipt</option>
                      <option value="REFUND">Refund Cash to Patient</option>
                    </NativeSelect.Field>
                  </NativeSelect.Root>
                </Field.Root>

                <Field.Root required>
                  <Field.Label fontWeight="700">Reason Note (Logged for Management Review)</Field.Label>
                  <Textarea
                    placeholder="e.g. Patient cancelled test before sample collection / Duplicate payment error"
                    value={cancelReason}
                    onChange={(event) => setCancelReason(event.target.value)}
                    rows={3}
                  />
                </Field.Root>
              </VStack>
            </Box>

            <Flex justify="flex-end" gap="3" px="28px" py="18px" bg="#f7faf9" borderTop="1px solid #e2e9e6">
              <Button variant="outline" borderColor="#c8dad5" onClick={() => setCancelModalReceipt(null)}>
                Dismiss
              </Button>
              <Button bg="#a34258" color="white" loading={loading} _hover={{ bg: "#b84f66" }} onClick={submitCancellation}>
                Confirm {cancelAction === "REFUND" ? "Refund" : "Cancellation"}
              </Button>
            </Flex>
          </Box>
        </Flex>
      )}
    </Box>
  );
}
