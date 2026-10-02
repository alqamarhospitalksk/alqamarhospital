"use client";

import { useEffect, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  Grid,
  Heading,
  HStack,
  Input,
  Link,
  NativeSelect,
  Table,
  Text,
} from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faCheck,
  faClockRotateLeft,
  faHospital,
  faKitMedical,
  faPrint,
  faUser,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";

type Patient = {
  id: number;
  mrNumber: string;
  name: string;
  fatherName?: string;
  mobile?: string | null;
  gender?: string;
  cnic?: string | null;
  dateOfBirth?: string | null;
};
type HospitalSettings = { name: string; address: string | null; phone: string | null; email: string | null; logoDataUrl?: string | null };
type Visit = {
  visitNumber: string;
  dailyToken: number;
  reason: string;
  amount: string;
  paymentMethod: string;
  patient: {
    name: string;
    mrNumber: string;
    fatherName?: string;
    gender?: string;
    cnic?: string | null;
    dateOfBirth?: string | null;
  };
};

function computeAge(dob?: string | null) {
  if (!dob) return "";
  const birthDate = new Date(dob);
  const now = new Date();
  if (isNaN(birthDate.getTime())) return "";
  let years = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) years--;
  if (years >= 1) return `${years} Yrs`;
  let months = now.getMonth() - birthDate.getMonth() + (now.getFullYear() - birthDate.getFullYear()) * 12;
  if (now.getDate() < birthDate.getDate()) months--;
  if (months >= 1) return `${months} Mos`;
  const days = Math.floor((now.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24));
  return `${days} Days`;
}

export default function EmergencyPage() {
  const [historyVisits, setHistoryVisits] = useState<Visit[]>([]);
  const [hospitalSettings, setHospitalSettings] = useState<HospitalSettings | null>(null);
  const [patientId, setPatientId] = useState("");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [visit, setVisit] = useState<Visit | null>(null);
  const [showSlipModal, setShowSlipModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);

  // Patient search combobox state — same behavior as OPD Desk / OT.
  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isSearchingPatients, setIsSearchingPatients] = useState(false);
  const patientSearchRef = useRef<HTMLDivElement>(null);

  async function loadInitialData() {
    try {
      const [historyRes, settingsRes] = await Promise.all([
        fetch("/api/emergency"),
        fetch("/api/hospital-settings"),
      ]);
      const historyResult = await historyRes.json();
      if (historyRes.ok) setHistoryVisits(historyResult.visits ?? []);
      if (settingsRes.ok) setHospitalSettings((await settingsRes.json()).settings);
    } catch {
      toast.error("Unable to load the emergency visit register.");
    }
  }

  useEffect(() => {
    void loadInitialData();
  }, []);

  // Patient search handler — debounced partial search
  useEffect(() => {
    const q = patientSearch.trim();
    if (!q) {
      setPatientResults([]);
      setShowPatientDropdown(false);
      return;
    }
    if (selectedPatient && q === `${selectedPatient.mrNumber} · ${selectedPatient.name}`) {
      return;
    }
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
      if (patientSearchRef.current && !patientSearchRef.current.contains(e.target as Node)) {
        setShowPatientDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function createVisit() {
    if (!reason.trim()) {
      toast.error("Enter the reason for this minor emergency visit.");
      return;
    }
    setVisit(null);
    setSaving(true);
    try {
      const response = await fetch("/api/emergency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, reason: reason.trim(), amount: Number(amount || 0), paymentMethod }),
      });
      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error ?? "Unable to record the emergency visit.");
        return;
      }
      setVisit(result.visit);
      setShowSlipModal(true);
      setPatientId(""); setReason(""); setAmount(""); setPaymentMethod("CASH");
      setPatientSearch(""); setSelectedPatient(null); setPatientResults([]);
      await loadInitialData();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setSaving(false);
    }
  }

  function openVisitSlipModal(selectedVisit: Visit) {
    setVisit(selectedVisit);
    setShowSlipModal(true);
  }

  // Thermal-style receipt copies (Minor OT Copy / Patient Copy) — same 80mm pop-up
  // format the OPD Desk uses, separate from the full "Print Slip" page above.
  function printCopy(copyType: "MINOR_OT" | "PATIENT") {
    if (!visit) return;
    const escapeHtml = (value: string) =>
      value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);

    const clinicName = hospitalSettings?.name || "CareLedger Clinic";
    const date = new Date().toLocaleDateString("en-PK");
    const age = computeAge(visit.patient.dateOfBirth);
    const copyLabel = copyType === "MINOR_OT" ? "Minor OT Copy" : "Patient Copy";

    const method = visit.paymentMethod || "CASH";
    const isFree = method === "FREE";
    const paymentLabels: Record<string, string> = { CASH: "Cash", CARD: "Card", BANK_TRANSFER: "Bank Transfer", ONLINE: "Online", FREE: "Free" };
    const paymentLabel = paymentLabels[method] ?? method;

    const printWindow = window.open("", `emergency-${copyType.toLowerCase()}-copy`, "width=420,height=800");
    if (!printWindow) {
      toast.error("Allow pop-ups to print the emergency receipt.");
      return;
    }
    printWindow.addEventListener("load", () => {
      printWindow.focus();
      printWindow.print();
      printWindow.addEventListener("afterprint", () => printWindow.close(), { once: true });
    }, { once: true });
    printWindow.document.write(`<!doctype html><html><head><title>Emergency ${escapeHtml(copyLabel)} ${escapeHtml(visit.visitNumber)}</title><style>
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
      .footer { text-align: center; font-size: 8pt; margin-top: 5mm; }
    </style></head><body><main class="receipt">
      <div class="center clinic">${escapeHtml(clinicName.toUpperCase())}</div>
      <div class="center subtitle">MINOR EMERGENCY SLIP</div>
      <div class="center copy-label">${escapeHtml(copyLabel.toUpperCase())}</div>
      <div class="meta">Visit #: ${escapeHtml(visit.visitNumber)}<br>Date: ${escapeHtml(date)}</div>
      <div class="rule"></div>
      <div class="token">TOKEN #${escapeHtml(String(visit.dailyToken))}</div>
      <div class="patient"><strong>Patient:</strong> ${escapeHtml(visit.patient.name)}<br><strong>MR #:</strong> ${escapeHtml(visit.patient.mrNumber)}<br><strong>Father Name:</strong> ${escapeHtml(visit.patient.fatherName || "-")}<br><strong>Age:</strong> ${escapeHtml(age || "-")} &nbsp; <strong>Gender:</strong> ${escapeHtml(visit.patient.gender || "-")}</div>
      <div class="rule"></div>
      <div class="patient"><strong>Reason:</strong> ${escapeHtml(visit.reason)}</div>
      <div class="rule"></div>
      <div class="row total"><span>AMOUNT</span><span>${isFree ? "FREE" : `${escapeHtml(visit.amount)} PKR`}</span></div>
      <div class="row"><span>Payment</span><strong>${escapeHtml(paymentLabel)}</strong></div>
      <div class="footer">Thank you</div>
    </main></body></html>`);
    printWindow.document.close();
  }

  const filteredHistory = historyVisits.filter((v) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      v.visitNumber.toLowerCase().includes(q) ||
      v.patient.name.toLowerCase().includes(q) ||
      v.patient.mrNumber.toLowerCase().includes(q) ||
      v.reason.toLowerCase().includes(q)
    );
  });
  const historyPageCount = Math.max(1, Math.ceil(filteredHistory.length / historyPageSize));
  const visibleHistory = filteredHistory.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize);
  const firstHistoryRecord = filteredHistory.length === 0 ? 0 : (historyPage - 1) * historyPageSize + 1;
  const lastHistoryRecord = Math.min(historyPage * historyPageSize, filteredHistory.length);

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
              Minor Emergency
            </Heading>
          </Box>
        </HStack>
      </Flex>

      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>
        {/* Create Slip Form */}
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="14px" boxShadow="0 2px 12px rgba(14,36,32,0.04)" p={{ base: "20px", md: "28px" }} mb="8">
          <HStack mb="2">
            <Flex w="36px" h="36px" bg="#e9f1ef" color="#126b68" borderRadius="9px" align="center" justify="center">
              <FontAwesomeIcon icon={faKitMedical} />
            </Flex>
            <Heading size="sm">Record Minor Emergency Visit</Heading>
          </HStack>

          <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }} gap="5" mb="5">
            <Box position="relative" ref={patientSearchRef}>
              <Text fontSize="sm" fontWeight="700" mb="2">
                Select Patient
              </Text>
              <Box position="relative">
                <Input
                  placeholder="Search by MR number or patient name…"
                  value={patientSearch}
                  onChange={(e) => {
                    setPatientSearch(e.target.value);
                    if (selectedPatient) {
                      setSelectedPatient(null);
                      setPatientId("");
                    }
                  }}
                  onFocus={() => {
                    if (patientResults.length > 0) setShowPatientDropdown(true);
                  }}
                  bg={selectedPatient ? "#f0faf7" : "white"}
                  borderColor={selectedPatient ? "#126b68" : undefined}
                  fontSize="sm"
                />
                {isSearchingPatients && (
                  <Box position="absolute" right="12px" top="50%" transform="translateY(-50%)" fontSize="11px" color="#77908b">
                    …
                  </Box>
                )}
              </Box>

              {showPatientDropdown && (
                <Box
                  position="absolute"
                  top="100%"
                  left="0"
                  right="0"
                  mt="1"
                  bg="white"
                  border="1.5px solid #126b68"
                  borderRadius="10px"
                  boxShadow="0 8px 24px rgba(18,59,59,0.15)"
                  zIndex="50"
                  maxH="240px"
                  overflowY="auto"
                >
                  {patientResults.length === 0 ? (
                    <Box px="4" py="3">
                      <Text fontSize="sm" color="#77908b">No patients found for &ldquo;{patientSearch}&rdquo;</Text>
                    </Box>
                  ) : (
                    patientResults.map((p) => (
                      <Box
                        key={p.id}
                        px="4"
                        py="2.5"
                        cursor="pointer"
                        _hover={{ bg: "#f0faf7" }}
                        borderBottom="1px solid #f0f4f3"
                        onClick={() => {
                          setSelectedPatient(p);
                          setPatientId(String(p.id));
                          setPatientSearch(`${p.mrNumber} · ${p.name}`);
                          setShowPatientDropdown(false);
                        }}
                      >
                        <Text fontSize="sm" fontWeight="700" color="#123d3b">
                          {p.mrNumber}
                        </Text>
                        <Text fontSize="xs" color="#506c65">
                          {p.name} &nbsp;·&nbsp; S/O {p.fatherName}
                          {p.cnic ? <> &nbsp;·&nbsp; {p.cnic}</> : null}
                        </Text>
                      </Box>
                    ))
                  )}
                </Box>
              )}

              {!patientSearch && (
                <Text fontSize="10px" color="#77908b" mt="1">
                  Type MR number or patient name to search
                </Text>
              )}
            </Box>

            <Box>
              <Text fontSize="sm" fontWeight="700" mb="2">
                Reason
              </Text>
              <Input
                placeholder="e.g. Minor cut, patient declined full consultation"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                fontSize="sm"
              />
            </Box>

            <Box>
              <Text fontSize="sm" fontWeight="700" mb="2">
                Amount (PKR)
              </Text>
              <Input
                type="number"
                min="0"
                placeholder="e.g. 100"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </Box>

            <Box>
              <Text fontSize="sm" fontWeight="700" mb="2">
                Payment Method
              </Text>
              <NativeSelect.Root>
                <NativeSelect.Field value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                  <option value="ONLINE">Online</option>
                </NativeSelect.Field>
              </NativeSelect.Root>
            </Box>
          </Grid>

          <Flex justify="flex-end">
            <Button
              onClick={createVisit}
              loading={saving}
              disabled={!patientId || !reason.trim()}
              bg="linear-gradient(135deg, #1a8070 0%, #0f5a52 100%)"
              color="white"
              h="46px"
              px="28px"
              borderRadius="9px"
              fontWeight="700"
              boxShadow="0 3px 12px rgba(26,128,112,0.28)"
              _hover={{ boxShadow: "0 5px 20px rgba(26,128,112,0.42)", transform: "translateY(-1px)" }}
              _active={{ transform: "translateY(0)" }}
              transition="all 0.18s ease"
            >
              <FontAwesomeIcon icon={faCheck} />
              &nbsp; Generate & View Slip
            </Button>
          </Flex>
        </Box>

        {/* History Table */}
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="14px" boxShadow="0 2px 12px rgba(14,36,32,0.04)" overflow="hidden">
          <Box p="5" borderBottom="1px solid #edf2f0">
            <Flex justify="space-between" align="center" direction={{ base: "column", sm: "row" }} gap="4">
              <HStack gap="3">
                <Flex w="34px" h="34px" bg="#e9f1ef" color="#126b68" borderRadius="9px" align="center" justify="center">
                  <FontAwesomeIcon icon={faClockRotateLeft} />
                </Flex>
                <Box>
                  <Heading size="sm">Minor Emergency History</Heading>
                </Box>
              </HStack>

              <Input
                placeholder="Search history by patient, MR, visit #, or reason..."
                value={searchFilter}
                onChange={(event) => {
                  setSearchFilter(event.target.value);
                  setHistoryPage(1);
                }}
                maxW="340px"
                size="sm"
                borderRadius="8px"
              />
            </Flex>
          </Box>

          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg="#fafcfb">
                  <Table.ColumnHeader>Visit Number</Table.ColumnHeader>
                  <Table.ColumnHeader>Token #</Table.ColumnHeader>
                  <Table.ColumnHeader>Patient Details</Table.ColumnHeader>
                  <Table.ColumnHeader>Reason</Table.ColumnHeader>
                  <Table.ColumnHeader>Amount</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Action</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {filteredHistory.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={6}>
                      <Text py="8" textAlign="center" color="#77908b">
                        No minor emergency visits found in history.
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  visibleHistory.map((item) => (
                    <Table.Row key={item.visitNumber} _hover={{ bg: "#f9fbfa" }}>
                      <Table.Cell fontWeight="800" color="#126b68">
                        {item.visitNumber}
                      </Table.Cell>
                      <Table.Cell>
                        <Badge bg="#dce96f" color="#123d3b" fontWeight="800" borderRadius="full" px="2">
                          #{item.dailyToken}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Text fontWeight="700" fontSize="sm">
                          {item.patient.name}
                        </Text>
                        <Text fontSize="xs" color="#77908b">
                          MR: {item.patient.mrNumber}
                        </Text>
                      </Table.Cell>
                      <Table.Cell fontSize="sm" color="#556e68" maxW="260px">
                        {item.reason}
                      </Table.Cell>
                      <Table.Cell fontWeight="800" color="#123d3b">
                        PKR {item.amount}
                      </Table.Cell>
                      <Table.Cell textAlign="right">
                        <Button
                          size="xs"
                          variant="outline"
                          borderColor="#c8dad5"
                          color="#126b68"
                          onClick={() => openVisitSlipModal(item)}
                        >
                          <FontAwesomeIcon icon={faPrint} />
                          &nbsp; View / Print
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

      {/* Emergency Slip Modal */}
      {showSlipModal && visit && (
        <Flex
          className="print-modal-overlay"
          position="fixed"
          inset="0"
          bg="rgba(15, 30, 28, 0.55)"
          backdropFilter="blur(3px)"
          zIndex="100"
          align="center"
          justify="center"
          p="4"
        >
          <Box className="print-modal-card" bg="white" borderRadius="16px" w="full" maxW="820px" boxShadow="0 20px 40px rgba(0,0,0,0.2)" overflow="hidden">
            <Flex justify="space-between" align="center" px="28px" py="14px" bg="#123d3b" color="white" className="no-print">
              <HStack gap="3">
                <Flex w="32px" h="32px" bg="#d6e66c" color="#123d3b" borderRadius="9px" align="center" justify="center">
                  <FontAwesomeIcon icon={faKitMedical} size="sm" />
                </Flex>
                <Heading size="sm">Emergency Slip Preview</Heading>
              </HStack>
              <Button variant="ghost" color="white" _hover={{ bg: "#255d58" }} p="2" minW="auto" onClick={() => setShowSlipModal(false)}>
                <FontAwesomeIcon icon={faXmark} size="lg" />
              </Button>
            </Flex>

            <Box className="print-modal-body" p={{ base: "20px", md: "28px" }} maxH="80vh" overflowY="auto">
              <Box
                className="printable-slip full-page-slip"
                p="4"
                bg="white"
                display="flex"
                flexDirection="column"
                minH={{ base: "auto", md: "760px" }}
              >
                {/* Bordered content area — header, token, patient info, blank space */}
                <Box
                  position="relative"
                  border="2px solid #123d3b"
                  borderRadius="12px"
                  bg="white"
                  p="4"
                  flex="1"
                  display="flex"
                  flexDirection="column"
                  overflow="hidden"
                >
                  {/* Watermark — pre-faded, fully-opaque image so it survives printing */}
                  <Flex className="slip-watermark" position="absolute" inset="0" align="center" justify="center" pointerEvents="none" zIndex="0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/images/watermark-print.png"
                      alt=""
                      style={{ width: "300px", height: "300px", objectFit: "contain" }}
                    />
                  </Flex>

                  <Box position="relative" zIndex="1" display="flex" flexDirection="column" flex="1">
                    {/* Header: logo + hospital name (left) · token (centre) · visit meta (right) */}
                    <Grid templateColumns="1fr auto 1fr" gap="3" alignItems="center" pb="0" mb="3" className="slip-header-grid">
                      <HStack gap="3" ml="3" mt="2" className="slip-inset-block slip-doctor-en">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={hospitalSettings?.logoDataUrl || "/images/logo.png"}
                          alt="Hospital logo"
                          style={{ width: 56, height: 56, objectFit: "contain" }}
                        />
                        <Box textAlign="left">
                          <Text fontSize="sm" fontWeight="900" color="#123d3b" whiteSpace="nowrap">
                            {hospitalSettings?.name || "CareLedger Clinic"}
                          </Text>
                          <Text fontSize="9px" color="#77908b" textTransform="uppercase" letterSpacing="0.1em">
                            Minor Emergency Slip
                          </Text>
                        </Box>
                      </HStack>

                      <HStack bg="#dce96f" borderRadius="10px" py="1.5" px="6" gap="2">
                        <Text fontSize="9px" textTransform="uppercase" fontWeight="900" color="#46633e" letterSpacing="0.08em">
                          Token Number
                        </Text>
                        <Heading size="lg" color="#123d3b" lineHeight="1.2">
                          #{visit.dailyToken}
                        </Heading>
                      </HStack>

                      <Box textAlign="right" mr="3" mt="2" className="slip-inset-block slip-doctor-ur">
                        <Text fontSize="xs" fontWeight="900" color="#123d3b">
                          Visit #: {visit.visitNumber}
                        </Text>
                        <Text fontSize="10px" color="#77908b">
                          Date: {new Date().toLocaleDateString("en-PK")}
                        </Text>
                      </Box>
                    </Grid>

                    {/* Patient Details — single line */}
                    <Box mb="3" ml="3" className="slip-inset-block">
                      <Text fontSize="9px" color="#77908b" textTransform="uppercase" letterSpacing="0.06em" mb="1.5">
                        Patient Information
                      </Text>
                      <HStack columnGap="4" rowGap="0.5" wrap="wrap" fontSize="xs" color="#123d3b">
                        <Text>
                          MR #: <Box as="span" fontWeight="800">{visit.patient.mrNumber}</Box>
                        </Text>
                        <Text>
                          Visit #: <Box as="span" fontWeight="800">{visit.visitNumber}</Box>
                        </Text>
                        <Text>
                          Name: <Box as="span" fontWeight="800">{visit.patient.name}</Box>
                        </Text>
                        <Text>
                          Father Name: <Box as="span" fontWeight="800">{visit.patient.fatherName || "—"}</Box>
                        </Text>
                        <Text>
                          Age: <Box as="span" fontWeight="800">{computeAge(visit.patient.dateOfBirth)}</Box>
                        </Text>
                        <Text>
                          Gender: <Box as="span" fontWeight="800">{visit.patient.gender || "—"}</Box>
                        </Text>
                        <Text>
                          Date: <Box as="span" fontWeight="800">{new Date().toLocaleDateString("en-PK")}</Box>
                        </Text>
                      </HStack>
                    </Box>

                    {/* Divider line below Patient Information */}
                    <Box borderTop="1px solid #dbe5e1" mb="3" />

                    {/* Big blank space for the doctor's notes / treatment */}
                    <Box flex="1" />
                  </Box>
                </Box>

                {/* Footer: hospital name + address — below the bordered box */}
                <Box pt="3" textAlign="center">
                  <Text fontSize="9px" color="#556e68">
                    <Box as="span" fontWeight="800" color="#123d3b">
                      {hospitalSettings?.name || "CareLedger Clinic"}
                    </Box>
                    {[hospitalSettings?.address, hospitalSettings?.phone, hospitalSettings?.email]
                      .filter(Boolean)
                      .map((part) => `  •  ${part}`)
                      .join("")}
                  </Text>
                </Box>
              </Box>
            </Box>

            <Flex justify="flex-end" gap="2" px="28px" py="16px" bg="#f7faf9" borderTop="1px solid #e2e9e6" className="no-print" wrap="wrap">
              <Button size="sm" flexShrink="0" variant="outline" borderColor="#c8dad5" onClick={() => setShowSlipModal(false)}>
                Close
              </Button>
              <Button size="sm" flexShrink="0" variant="outline" borderColor="#c8dad5" color="#126b68" onClick={() => printCopy("MINOR_OT")}>
                <FontAwesomeIcon icon={faKitMedical} />
                &nbsp; Print Minor OT Receipt
              </Button>
              <Button size="sm" flexShrink="0" variant="outline" borderColor="#c8dad5" color="#126b68" onClick={() => printCopy("PATIENT")}>
                <FontAwesomeIcon icon={faUser} />
                &nbsp; Print Patient Receipt
              </Button>
              <Button size="sm" flexShrink="0" bg="#123d3b" color="white" _hover={{ bg: "#255d58" }} onClick={() => window.print()}>
                <FontAwesomeIcon icon={faPrint} />
                &nbsp; Print Slip
              </Button>
            </Flex>
          </Box>
        </Flex>
      )}
    </Box>
  );
}
