"use client";
import { DateInput, DateTimeInput } from "../date-input";

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
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faBed,
  faCheck,
  faClipboardList,
  faFlask,
  faPlus,
  faPrint,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";

type Patient = { id: number; mrNumber: string; name: string; fatherName?: string; cnic?: string | null };
type Doctor = { id: number; name: string; specialization: string; consultationFee: string; availability: string | null; availabilityDays: number[]; availabilityFrom: string | null; availabilityTo: string | null };
type BedSuggestion = { id: number; name: string; roomType: string; dailyRate: string };
type OtCase = {
  id: number;
  caseNumber: string;
  status: string;
  admissionDate?: string;
  patient: { name: string; mrNumber: string; fatherName?: string };
  doctor: { name: string; specialization?: string };
  roomBed: { name: string; roomType?: string; dailyRate?: string };
  doctorFee?: string;
  theaterFee?: string;
  anesthesiaFee?: string;
  roomFee?: string;
  hospitalFee?: string;
  otMedicineFee?: string;
  otMedicineNote?: string | null;
  homeMedicineFee?: string;
  homeMedicineNote?: string | null;
  recommendations?: string | null;
  total: string;
  lastInvoicedAt?: string | null;
  lineItems?: { description: string; quantity: string; unitPrice: string; total: string; createdAt?: string }[];
  payments?: { method: string; amount?: string; status?: string; createdAt?: string }[];
  paymentMethod?: string | null;
  // From /api/ot/all: what has been paid so far and what is still outstanding.
  paid?: number;
  balance?: number;
};

const paymentMethodLabels: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank Transfer",
  ONLINE: "Online",
};
type HospitalSettings = { name: string; logoDataUrl?: string | null };

type Period = "today" | "weekly" | "monthly" | "custom";

function toDateStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function periodRange(period: "today" | "weekly" | "monthly") {
  const now = new Date();
  const end = toDateStr(now);
  if (period === "today") return { start: end, end };
  if (period === "weekly") {
    const day = now.getDay(); // 0 = Sunday
    const diffToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);
    return { start: toDateStr(monday), end };
  }
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: toDateStr(firstOfMonth), end };
}

export default function OtPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [bedSuggestions, setBedSuggestions] = useState<BedSuggestion[]>([]);
  const [hospitalSettings, setHospitalSettings] = useState<HospitalSettings | null>(null);
  const [allCases, setAllCases] = useState<OtCase[]>([]);
  const [casesPage, setCasesPage] = useState(1);
  const [casesPageSize, setCasesPageSize] = useState(10);
  const [period, setPeriod] = useState<Period>("today");
  const [rangeStart, setRangeStart] = useState(toDateStr(new Date()));
  const [rangeEnd, setRangeEnd] = useState(toDateStr(new Date()));

  function changePeriod(next: "today" | "weekly" | "monthly") {
    const range = periodRange(next);
    setPeriod(next);
    setRangeStart(range.start);
    setRangeEnd(range.end);
    setCasesPage(1);
  }

  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [doctorFee, setDoctorFee] = useState("");
  const [roomLabel, setRoomLabel] = useState("");
  const [procedureName, setProcedureName] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [procedureAt, setProcedureAt] = useState("");
  const [theaterFee, setTheaterFee] = useState("");
  const [anesthesiaFee, setAnesthesiaFee] = useState("");
  const [roomFee, setRoomFee] = useState("");
  const [hospitalFee, setHospitalFee] = useState("");
  const [otMedicineFee, setOtMedicineFee] = useState("");
  const [otMedicineNote, setOtMedicineNote] = useState("");
  const [homeMedicineFee, setHomeMedicineFee] = useState("");
  const [homeMedicineNote, setHomeMedicineNote] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  // Amount handed over at admission; empty = the whole bill. Less than the bill = an advance.
  const [paidNow, setPaidNow] = useState("");

  const [selectedCase, setSelectedCase] = useState("");
  const [showDischargeBillModal, setShowDischargeBillModal] = useState(false);
  const [dischargeBillCase, setDischargeBillCase] = useState<OtCase | null>(null);
  const [invoiceMode, setInvoiceMode] = useState<"admission" | "additional" | "discharge">("admission");
  const [showAdmitModal, setShowAdmitModal] = useState(false);
  const [medicineCase, setMedicineCase] = useState<OtCase | null>(null);
  const [recordPaymentCase, setRecordPaymentCase] = useState<OtCase | null>(null);
  const [recordPaymentMethod, setRecordPaymentMethod] = useState("CASH");
  const [recordPaymentAmount, setRecordPaymentAmount] = useState("");
  const [recordingPayment, setRecordingPayment] = useState(false);

  const [itemDescription, setItemDescription] = useState("");
  const [itemCategory, setItemCategory] = useState("OTHER");
  const [itemUnitPrice, setItemUnitPrice] = useState("");
  const [itemPaymentMethod, setItemPaymentMethod] = useState("CASH");
  const [quantity, setQuantity] = useState("1");
  const [saving, setSaving] = useState(false);

  // Patient search combobox state — mirrors the OPD Desk patient search.
  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isSearchingPatients, setIsSearchingPatients] = useState(false);
  const patientSearchRef = useRef<HTMLDivElement>(null);

  // Doctor search combobox state (the doctor list is already loaded, so it is filtered on the page)
  const [doctorSearch, setDoctorSearch] = useState("");
  const [showDoctorDropdown, setShowDoctorDropdown] = useState(false);
  const doctorSearchRef = useRef<HTMLDivElement>(null);

  async function load() {
    const otResponse = await fetch("/api/ot");
    const otData = await otResponse.json();
    if (!otResponse.ok) {
      toast.error(otData.error ?? "Unable to load OT data.");
      return;
    }
    setDoctors(otData.doctors);
    setBedSuggestions(otData.beds ?? []);
  }

  async function loadHospitalSettings() {
    try {
      const res = await fetch("/api/hospital-settings");
      if (res.ok) setHospitalSettings((await res.json()).settings);
    } catch {
      /* falls back to the default clinic name below */
    }
  }

  async function loadAllCases() {
    try {
      const res = await fetch("/api/ot/all");
      if (res.ok) {
        const data = await res.json();
        setAllCases(data.cases ?? []);
      }
    } catch { /* ignore */ }
  }

  async function viewInvoice(caseId: number, status: string) {
    try {
      // Just a view — nothing is marked as "given" here. That only happens when the
      // patient's slip is actually printed (see printDischargeBill), so opening this
      // to check on a case never silently swallows the full bill for later.
      const response = await fetch(`/api/ot/${caseId}`);
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Unable to load the OT invoice.");
        return;
      }
      setDischargeBillCase(data.otCase);
      // Discharged → the final bill. Never printed before → the full bill (nothing
      // has been handed over yet). Printed before, not discharged → only what's new.
      setInvoiceMode(status === "DISCHARGED" ? "discharge" : data.otCase.lastInvoicedAt ? "additional" : "admission");
      setShowDischargeBillModal(true);
    } catch {
      toast.error("Unable to load the OT invoice.");
    }
  }

  useEffect(() => {
    void load();
    void loadAllCases();
    void loadHospitalSettings();
  }, []);

  // Patient search handler — debounced partial search (same behavior as OPD Desk).
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

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (patientSearchRef.current && !patientSearchRef.current.contains(e.target as Node)) {
        setShowPatientDropdown(false);
      }
      if (doctorSearchRef.current && !doctorSearchRef.current.contains(e.target as Node)) {
        setShowDoctorDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedDoctor = doctors.find((doctor) => String(doctor.id) === doctorId);
  // Matches any part of the name or specialization, ignoring case ("sul", "card"...).
  const doctorQuery = doctorSearch.trim().toLowerCase();
  const filteredDoctors = selectedDoctor
    ? doctors
    : doctors.filter((doctor) => !doctorQuery || `${doctor.name} ${doctor.specialization}`.toLowerCase().includes(doctorQuery));
  function chooseDoctor(doctor: Doctor) {
    setDoctorId(String(doctor.id));
    setDoctorSearch(`${doctor.name} · ${doctor.specialization}`);
    setShowDoctorDropdown(false);
  }

  async function admit() {
    setSaving(true);
    try {
      const response = await fetch("/api/ot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          doctorId,
          doctorFee: doctorFee !== "" ? Number(doctorFee) : undefined,
          roomLabel,
          procedureName,
          diagnosis,
          procedureAt,
          theaterFee: Number(theaterFee || 0),
          anesthesiaFee: Number(anesthesiaFee || 0),
          roomFee: Number(roomFee || 0),
          hospitalFee: Number(hospitalFee || 0),
          otMedicineFee: Number(otMedicineFee || 0),
          otMedicineNote,
          homeMedicineFee: Number(homeMedicineFee || 0),
          homeMedicineNote,
          recommendations,
          paymentMethod,
          paidNow: paymentMethod !== "DUE" && paidNow !== "" ? Number(paidNow) : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Unable to admit patient.");
        return;
      }
      toast.success(`OT case ${data.case.caseNumber} created · PKR ${data.case.total}`);
      setPatientId(""); setDoctorId(""); setDoctorSearch(""); setShowDoctorDropdown(false); setDoctorFee(""); setRoomLabel("");
      setProcedureName(""); setDiagnosis(""); setProcedureAt(""); setTheaterFee("");
      setAnesthesiaFee(""); setRoomFee(""); setHospitalFee("");
      setOtMedicineFee(""); setOtMedicineNote(""); setHomeMedicineFee(""); setHomeMedicineNote("");
      setPaymentMethod("");
      setPaidNow("");
      setRecommendations("");
      setPatientSearch(""); setSelectedPatient(null); setPatientResults([]);
      setShowAdmitModal(false);

      // Immediately offer a printable receipt — mirrors OPD/Lab, where staff get a
      // slip right after the transaction instead of having to look the case up later.
      const invoiceRes = await fetch(`/api/ot/${data.case.id}`);
      if (invoiceRes.ok) {
        const invoiceData = await invoiceRes.json();
        setDischargeBillCase(invoiceData.otCase);
        setInvoiceMode("admission");
        setShowDischargeBillModal(true);
      }

      await load();
      void loadAllCases();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setSaving(false);
    }
  }

  async function caseAction(action: string, caseId = selectedCase, extraPaymentMethod?: string, extraAmount?: number) {
    if (!caseId) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/ot/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "CONSUME"
            ? { action, description: itemDescription, category: itemCategory, unitPrice: Number(itemUnitPrice), quantity: Number(quantity), paymentMethod: itemPaymentMethod }
            : action === "RECORD_PAYMENT"
            ? { action, paymentMethod: extraPaymentMethod, amount: extraAmount }
            : { action }
        ),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Unable to update OT case.");
        return;
      }

      if (action === "DISCHARGE") {
        const fullCaseRes = await fetch(`/api/ot/${caseId}`);
        if (fullCaseRes.ok) {
          const fullData = await fullCaseRes.json();
          setDischargeBillCase(fullData.otCase);
          setInvoiceMode("discharge");
          setShowDischargeBillModal(true);
        }
        void loadAllCases();
      }

      if (action === "RECORD_PAYMENT") {
        setRecordPaymentCase(null);
        void loadAllCases();
      }

      toast.success(
        action === "RECORD_PAYMENT"
          ? `${data.result.caseNumber}: PKR ${data.result.amountPaid ?? data.result.total} received via ${paymentMethodLabels[data.result.paymentMethod] ?? data.result.paymentMethod} · ${data.result.balanceAfter > 0 ? `PKR ${data.result.balanceAfter} still due` : "fully paid"}`
          : `${data.result.caseNumber}: ${data.result.status.replaceAll("_", " ")}${
              data.result.total ? ` · PKR ${data.result.total}` : ""
            }`
      );
      if (action === "CONSUME") {
        setItemDescription("");
        setItemCategory("OTHER");
        setItemUnitPrice("");
        setItemPaymentMethod("CASH");
        setQuantity("1");
        setMedicineCase(null);
        void loadAllCases();
      }
      await load();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setSaving(false);
    }
  }

  function printDischargeBill() {
    // Printing is the real "the patient was given this slip" moment — mark it now
    // (not when the modal merely opened) so the next View Invoice only shows what's
    // new since this one. Fire-and-forget: doesn't need to block the print dialog.
    if (dischargeBillCase && invoiceMode !== "discharge") {
      void fetch(`/api/ot/${dischargeBillCase.id}?markInvoiced=1`);
    }
    window.print();
  }

  const filteredCases = allCases.filter((c) => {
    if (!c.admissionDate) return true;
    const dateStr = toDateStr(new Date(c.admissionDate));
    return dateStr >= rangeStart && dateStr <= rangeEnd;
  });
  const casesPageCount = Math.max(1, Math.ceil(filteredCases.length / casesPageSize));
  const visibleCases = filteredCases.slice((casesPage - 1) * casesPageSize, casesPage * casesPageSize);
  const firstCaseRecord = filteredCases.length === 0 ? 0 : (casesPage - 1) * casesPageSize + 1;
  const lastCaseRecord = Math.min(casesPage * casesPageSize, filteredCases.length);

  // Items added since the last slip was given — what an "additional charges" slip shows.
  // With no prior lastInvoicedAt on record (legacy cases from before this feature), default
  // to none-new rather than re-listing everything as if it were a brand new charge.
  const newLineItems = dischargeBillCase?.lastInvoicedAt
    ? (dischargeBillCase.lineItems ?? []).filter((item) => item.createdAt && new Date(item.createdAt) > new Date(dischargeBillCase.lastInvoicedAt!))
    : [];
  const newLineItemsTotal = newLineItems.reduce((sum, item) => sum + Number(item.total), 0);
  // Admission form: the bill being entered, and what is being handed over now.
  const admitTotal = [doctorFee, theaterFee, anesthesiaFee, roomFee, hospitalFee, otMedicineFee, homeMedicineFee].reduce((sum, value) => sum + Number(value || 0), 0);
  const paidNowNumber = paidNow === "" ? admitTotal : Number(paidNow);
  const paidNowInvalid = paymentMethod !== "" && paymentMethod !== "DUE" && paidNow !== "" && (!Number.isFinite(paidNowNumber) || paidNowNumber <= 0 || paidNowNumber > admitTotal + 0.005);
  // Record Payment dialog: how much is being paid now vs. what is due.
  const dueNow = recordPaymentCase ? Number(recordPaymentCase.balance ?? recordPaymentCase.total) : 0;
  const recordAmountNumber = Number(recordPaymentAmount);
  const recordAmountInvalid = !Number.isFinite(recordAmountNumber) || recordAmountNumber <= 0 || recordAmountNumber > dueNow + 0.005;
  // Paid so far vs. the bill — items added after admission can leave a balance.
  const billPaid = (dischargeBillCase?.payments ?? []).filter((p) => !p.status || p.status === "PAID").reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  const billBalance = dischargeBillCase ? Math.max(0, Math.round((Number(dischargeBillCase.total) - billPaid) * 100) / 100) : 0;

  return (
    <Box minH="100vh" bg="#eef2f0" color="#0e2420">
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
              Operation Theater (OT)
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
          onClick={() => setShowAdmitModal(true)}
        >
          <FontAwesomeIcon icon={faPlus} />
          &nbsp; New OT Admission
        </Button>
      </Flex>

      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>
        {/* New OT Admission — dialog opened by the + button in the header */}
        {showAdmitModal && (
        <Flex position="fixed" inset="0" bg="rgba(15, 30, 28, 0.55)" backdropFilter="blur(3px)" zIndex="100" align="center" justify="center" p="4">
          <Box bg="white" borderRadius="16px" w="full" maxW="760px" boxShadow="0 20px 40px rgba(0,0,0,0.2)" overflow="hidden" maxH="92vh" display="flex" flexDirection="column">
            <Flex justify="space-between" align="center" px="28px" py="18px" bg="#123d3b" color="white" flexShrink="0">
              <HStack gap="3">
                <Flex w="36px" h="36px" bg="#d6e66c" color="#123d3b" borderRadius="9px" align="center" justify="center">
                  <FontAwesomeIcon icon={faBed} />
                </Flex>
                <Box>
                  <Heading size="sm">New OT Admission</Heading>
                  <Text fontSize="xs" color="#a8c5bd">
                    Complete package — enter the room and every fee manually.
                  </Text>
                </Box>
              </HStack>
              <Button variant="ghost" color="white" _hover={{ bg: "#255d58" }} p="2" minW="auto" onClick={() => setShowAdmitModal(false)}>
                <FontAwesomeIcon icon={faXmark} size="lg" />
              </Button>
            </Flex>
            <Box p={{ base: "20px", md: "28px" }} overflowY="auto">
            <VStack align="stretch" gap="4">
              <Box position="relative" ref={patientSearchRef}>
                <Text fontSize="sm" fontWeight="700" mb="2">
                  Patient
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

                {/* Dropdown Results */}
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

                {/* No search yet hint */}
                {!patientSearch && (
                  <Text fontSize="10px" color="#77908b" mt="1">
                    Type MR number or patient name to search
                  </Text>
                )}
              </Box>

              <Box position="relative" ref={doctorSearchRef}>
                <Text fontSize="sm" fontWeight="700" mb="2">Operating Doctor</Text>
                <Input
                  placeholder="Search doctor by name or specialization…"
                  value={doctorSearch}
                  autoComplete="off"
                  onChange={(e) => {
                    setDoctorSearch(e.target.value);
                    setShowDoctorDropdown(true);
                    if (doctorId) setDoctorId("");
                  }}
                  onFocus={() => setShowDoctorDropdown(true)}
                onClick={() => setShowDoctorDropdown(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setShowDoctorDropdown(false);
                    if (e.key === "Enter" && showDoctorDropdown && filteredDoctors.length > 0 && !doctorId) {
                      e.preventDefault();
                      chooseDoctor(filteredDoctors[0]);
                    }
                  }}
                  bg={selectedDoctor ? "#f0faf7" : "white"}
                  borderColor={selectedDoctor ? "#126b68" : undefined}
                />

                {showDoctorDropdown && (
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
                    {filteredDoctors.length === 0 ? (
                      <Box px="4" py="3">
                        <Text fontSize="sm" color="#77908b">No doctors found for &ldquo;{doctorSearch}&rdquo;</Text>
                      </Box>
                    ) : (
                      filteredDoctors.map((doctor) => (
                        <Box
                          key={doctor.id}
                          px="4"
                          py="2.5"
                          cursor="pointer"
                          bg={String(doctor.id) === doctorId ? "#f0faf7" : undefined}
                          _hover={{ bg: "#f0faf7" }}
                          borderBottom="1px solid #f0f4f3"
                          onClick={() => chooseDoctor(doctor)}
                        >
                          <Text fontSize="sm" fontWeight="700" color="#123d3b">{doctor.name}</Text>
                          <Text fontSize="xs" color="#506c65">{doctor.specialization}</Text>
                        </Box>
                      ))
                    )}
                  </Box>
                )}

                {!doctorSearch && (
                  <Text fontSize="10px" color="#77908b" mt="1">
                    Click to see all doctors, or type to search
                  </Text>
                )}
              </Box>

              <Box>
                <Text fontSize="sm" fontWeight="700" mb="2">
                  Room / Bed
                </Text>
                <Input
                  list="ot-room-suggestions"
                  placeholder="e.g. Room 101 / Bed A (enter manually)"
                  value={roomLabel}
                  onChange={(event) => setRoomLabel(event.target.value)}
                />
                <datalist id="ot-room-suggestions">
                  {bedSuggestions.map((bed) => (
                    <option key={bed.id} value={bed.name}>
                      {bed.roomType} · PKR {bed.dailyRate}/day
                    </option>
                  ))}
                </datalist>
                <Text fontSize="10px" color="#77908b" mt="1">
                  Type freely, or pick a suggestion from your configured rooms.
                </Text>
              </Box>

              <Text fontSize="xs" fontWeight="800" color="#77908b" textTransform="uppercase" letterSpacing="0.06em" pt="1">
                Complete OT Package
              </Text>

              <HStack gap="3">
                <Box flex="1">
                  <Text fontSize="sm" fontWeight="700" mb="2">OT Charge (PKR)</Text>
                  <Input type="number" min="0" placeholder="0" value={theaterFee} onChange={(event) => setTheaterFee(event.target.value)} />
                </Box>
                <Box flex="1">
                  <Text fontSize="sm" fontWeight="700" mb="2">Doctor Fee (PKR)</Text>
                  <Input type="number" min="0" placeholder="0" value={doctorFee} onChange={(event) => setDoctorFee(event.target.value)} />
                </Box>
              </HStack>

              <HStack gap="3">
                <Box flex="1">
                  <Text fontSize="sm" fontWeight="700" mb="2">Anesthesia Fee (PKR)</Text>
                  <Input type="number" min="0" placeholder="0" value={anesthesiaFee} onChange={(event) => setAnesthesiaFee(event.target.value)} />
                </Box>
                <Box flex="1">
                  <Text fontSize="sm" fontWeight="700" mb="2">Room Charge (PKR)</Text>
                  <Input type="number" min="0" placeholder="0" value={roomFee} onChange={(event) => setRoomFee(event.target.value)} />
                </Box>
              </HStack>

              <HStack gap="3">
                <Box flex="1">
                  <Text fontSize="sm" fontWeight="700" mb="2">Home Medicine (PKR)</Text>
                  <Input type="number" min="0" placeholder="0" value={homeMedicineFee} onChange={(event) => setHomeMedicineFee(event.target.value)} />
                </Box>
                <Box flex="1">
                  <Text fontSize="sm" fontWeight="700" mb="2">OT Medicine (PKR)</Text>
                  <Input type="number" min="0" placeholder="0" value={otMedicineFee} onChange={(event) => setOtMedicineFee(event.target.value)} />
                </Box>
              </HStack>

              <Input
                placeholder="Home medicine details (optional)"
                value={homeMedicineNote}
                onChange={(event) => setHomeMedicineNote(event.target.value)}
              />
              <Input
                placeholder="OT medicine details (optional)"
                value={otMedicineNote}
                onChange={(event) => setOtMedicineNote(event.target.value)}
              />

              <Box>
                <Text fontSize="sm" fontWeight="700" mb="2">Hospital Fee (PKR)</Text>
                <Input type="number" min="0" placeholder="0" value={hospitalFee} onChange={(event) => setHospitalFee(event.target.value)} />
              </Box>

              <Box>
                <Text fontSize="sm" fontWeight="700" mb="2">Recommendations</Text>
                <Textarea placeholder="Doctor's recommendations" value={recommendations} onChange={(event) => setRecommendations(event.target.value)} />
              </Box>

              <Text fontSize="xs" fontWeight="800" color="#77908b" textTransform="uppercase" letterSpacing="0.06em" pt="1">
                Procedure Details
              </Text>

              <HStack gap="3">
                <Box flex="1">
                  <Text fontSize="sm" fontWeight="700" mb="2">
                    Procedure
                  </Text>
                  <Input value={procedureName} onChange={(event) => setProcedureName(event.target.value)} placeholder="Procedure name" />
                </Box>
                <Box flex="1">
                  <Text fontSize="sm" fontWeight="700" mb="2">
                    Procedure Date/Time
                  </Text>
                  <DateTimeInput value={procedureAt} onChange={(event) => setProcedureAt(event.target.value)} />
                </Box>
              </HStack>

              <Textarea placeholder="Diagnosis" value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} />

              <Box>
                <Text fontSize="sm" fontWeight="700" mb="2">Payment Method</Text>
                <NativeSelect.Root>
                  <NativeSelect.Field value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                    <option value="" disabled>Select payment method…</option>
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                    <option value="BANK_TRANSFER">Bank transfer</option>
                    <option value="ONLINE">Online</option>
                    <option value="DUE">Due (Pay Later)</option>
                  </NativeSelect.Field>
                </NativeSelect.Root>
                {paymentMethod === "DUE" && (
                  <Text fontSize="10px" color="#b26732" mt="1">
                    No payment will be recorded yet — you can record it later from the records table once collected.
                  </Text>
                )}
                {paymentMethod !== "" && paymentMethod !== "DUE" && (
                  <Box mt="3">
                    <Text fontSize="sm" fontWeight="700" mb="2">Amount received now (PKR)</Text>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={admitTotal > 0 ? `Full bill: ${admitTotal}` : "Full bill"}
                      value={paidNow}
                      onChange={(event) => setPaidNow(event.target.value)}
                      borderColor={paidNowInvalid ? "#d9534f" : undefined}
                    />
                    <Text fontSize="xs" mt="2" color={paidNowInvalid ? "#c0392b" : "#607d76"}>
                      {paidNowInvalid
                        ? `Enter an amount between 1 and ${admitTotal}.`
                        : paidNow !== "" && paidNowNumber < admitTotal
                        ? `Bill PKR ${admitTotal} · receiving PKR ${paidNowNumber} now · PKR ${Math.round((admitTotal - paidNowNumber) * 100) / 100} stays due and can be paid later in parts.`
                        : "Leave empty to receive the full bill now, or enter less if the family is paying part of it."}
                    </Text>
                  </Box>
                )}
              </Box>

              <Button onClick={admit} loading={saving} disabled={!patientId || !doctorId || !roomLabel.trim() || !paymentMethod || paidNowInvalid} bg="#123d3b" color="white" _hover={{ bg: "#255d58" }}>
                <FontAwesomeIcon icon={faCheck} />
                &nbsp; Admit and Book OT Case
              </Button>
            </VStack>
            </Box>
          </Box>
        </Flex>
        )}

        {/* Add Consumables & Medicines — dialog opened from a patient row */}
        {medicineCase && (
        <Flex position="fixed" inset="0" bg="rgba(15, 30, 28, 0.55)" backdropFilter="blur(3px)" zIndex="100" align="center" justify="center" p="4">
          <Box bg="white" borderRadius="16px" w="full" maxW="640px" boxShadow="0 20px 40px rgba(0,0,0,0.2)" overflow="hidden">
            <Flex justify="space-between" align="center" px="28px" py="18px" bg="#123d3b" color="white">
              <HStack gap="3">
                <Flex w="36px" h="36px" bg="#d6e66c" color="#123d3b" borderRadius="9px" align="center" justify="center">
                  <FontAwesomeIcon icon={faFlask} />
                </Flex>
                <Box>
                  <Heading size="sm">Add Consumables & Medicines</Heading>
                  <Text fontSize="xs" color="#a8c5bd">
                    {medicineCase.caseNumber} · {medicineCase.patient.name} ({medicineCase.patient.mrNumber})
                  </Text>
                </Box>
              </HStack>
              <Button variant="ghost" color="white" _hover={{ bg: "#255d58" }} p="2" minW="auto" onClick={() => setMedicineCase(null)}>
                <FontAwesomeIcon icon={faXmark} size="lg" />
              </Button>
            </Flex>

            <VStack align="stretch" gap="4" p={{ base: "20px", md: "28px" }}>
              <Box>
                <Text fontSize="sm" fontWeight="700" mb="2">Item</Text>
                <Input
                  placeholder="Medicine or other item"
                  value={itemDescription}
                  onChange={(event) => setItemDescription(event.target.value)}
                />
              </Box>

              <HStack gap="3" align="end" flexWrap="wrap">
                <Box flex="1" minW="150px">
                  <Text fontSize="sm" fontWeight="700" mb="2">Category</Text>
                  <NativeSelect.Root>
                    <NativeSelect.Field value={itemCategory} onChange={(event) => setItemCategory(event.target.value)}>
                      <option value="OTHER">Other</option>
                      <option value="MEDICINE">Medicine</option>
                      <option value="CONSUMABLE">Consumable</option>
                      <option value="SUPPLY">Supply</option>
                    </NativeSelect.Field>
                  </NativeSelect.Root>
                </Box>
                <Box w="120px">
                  <Text fontSize="sm" fontWeight="700" mb="2">Unit Price</Text>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Price"
                    value={itemUnitPrice}
                    onChange={(event) => setItemUnitPrice(event.target.value)}
                  />
                </Box>
                <Box w="110px">
                  <Text fontSize="sm" fontWeight="700" mb="2">Quantity</Text>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                  />
                </Box>
              </HStack>

              <Box>
                <Text fontSize="sm" fontWeight="700" mb="2">Payment for this item</Text>
                <NativeSelect.Root>
                  <NativeSelect.Field value={itemPaymentMethod} onChange={(event) => setItemPaymentMethod(event.target.value)}>
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                    <option value="BANK_TRANSFER">Bank transfer</option>
                    <option value="ONLINE">Online</option>
                    <option value="DUE">Due (Pay Later)</option>
                  </NativeSelect.Field>
                </NativeSelect.Root>
                <Text fontSize="xs" color="#607d76" mt="2">
                  Item total: <b>PKR {(Number(itemUnitPrice || 0) * Number(quantity || 0)).toLocaleString("en-PK", { maximumFractionDigits: 2 })}</b>
                  {itemPaymentMethod === "DUE" ? " — added to the bill as a balance, collected later with Record Payment." : " — collected now and added to today's income."}
                </Text>
              </Box>
            </VStack>

            <Flex justify="flex-end" gap="3" px="28px" py="16px" bg="#f7faf9" borderTop="1px solid #e2e9e6">
              <Button variant="outline" borderColor="#c8dad5" onClick={() => setMedicineCase(null)}>
                Close
              </Button>
              <Button
                onClick={() => void caseAction("CONSUME", String(medicineCase.id))}
                loading={saving}
                disabled={!itemDescription.trim() || !itemUnitPrice}
                bg="#123d3b"
                color="white"
                _hover={{ bg: "#255d58" }}
              >
                Add used item
              </Button>
            </Flex>
          </Box>
        </Flex>
        )}

        {/* All OT Patient Records */}
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden" mt="6">
          <Box p="5" borderBottom="1px solid #edf2f0">
            <Flex justify="space-between" align={{ base: "flex-start", lg: "center" }} direction={{ base: "column", lg: "row" }} gap="4">
              <HStack gap="3">
                <Flex w="32px" h="32px" bg="#e9f1ef" color="#126b68" borderRadius="8px" align="center" justify="center">
                  <FontAwesomeIcon icon={faClipboardList} />
                </Flex>
                <Box>
                  <Heading size="sm">All OT Patient Records</Heading>
                </Box>
              </HStack>

              <VStack gap="2" align="flex-end">
                <HStack gap="2">
                  {(["today", "weekly", "monthly"] as const).map((p) => (
                    <Button
                      key={p}
                      size="sm"
                      variant={period === p ? "solid" : "outline"}
                      bg={period === p ? "linear-gradient(135deg, #1a8070 0%, #0f5a52 100%)" : "white"}
                      color={period === p ? "white" : "#3e5e58"}
                      borderColor={period === p ? "transparent" : "#c8dad5"}
                      borderRadius="8px"
                      fontWeight="700"
                      boxShadow={period === p ? "0 2px 8px rgba(26,128,112,0.25)" : "none"}
                      onClick={() => changePeriod(p)}
                    >
                      {p === "today" ? "Today" : p.charAt(0).toUpperCase() + p.slice(1)}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant={period === "custom" ? "solid" : "outline"}
                    bg={period === "custom" ? "linear-gradient(135deg, #1a8070 0%, #0f5a52 100%)" : "white"}
                    color={period === "custom" ? "white" : "#3e5e58"}
                    borderColor={period === "custom" ? "transparent" : "#c8dad5"}
                    borderRadius="8px"
                    fontWeight="700"
                    boxShadow={period === "custom" ? "0 2px 8px rgba(26,128,112,0.25)" : "none"}
                    onClick={() => setPeriod("custom")}
                  >
                    Custom
                  </Button>
                </HStack>

                {period === "custom" && (
                  <HStack gap="2" flexWrap="wrap">
                    <DateInput
                      size="sm"
value={rangeStart}
                      onChange={(event) => {
                        setRangeStart(event.target.value);
                        setCasesPage(1);
                      }}
                      w="150px"
                    />
                    <Text fontSize="sm" color="#77908b">to</Text>
                    <DateInput
                      size="sm"
value={rangeEnd}
                      onChange={(event) => {
                        setRangeEnd(event.target.value);
                        setCasesPage(1);
                      }}
                      w="150px"
                    />
                  </HStack>
                )}
              </VStack>
            </Flex>
          </Box>
          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg="#fafcfb">
                  <Table.ColumnHeader>Case #</Table.ColumnHeader>
                  <Table.ColumnHeader>Patient</Table.ColumnHeader>
                  <Table.ColumnHeader>Doctor</Table.ColumnHeader>
                  <Table.ColumnHeader>Bed</Table.ColumnHeader>
                  <Table.ColumnHeader>Status</Table.ColumnHeader>
                  <Table.ColumnHeader>Payment</Table.ColumnHeader>
                  <Table.ColumnHeader>Total</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Action</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {filteredCases.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={8}>
                      <Text py="8" textAlign="center" color="#77908b">No OT records found for this period.</Text>
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  visibleCases.map((item) => (
                    <Table.Row key={item.id} _hover={{ bg: "#f7faf9" }}>
                      <Table.Cell fontWeight="800" color="#126b68">{item.caseNumber}</Table.Cell>
                      <Table.Cell>
                        <Text fontSize="sm" fontWeight="700">{item.patient.name}</Text>
                        <Text fontSize="xs" color="#77908b">{item.patient.mrNumber}</Text>
                      </Table.Cell>
                      <Table.Cell fontSize="sm">{item.doctor.name}</Table.Cell>
                      <Table.Cell fontSize="sm">{item.roomBed.name}</Table.Cell>
                      <Table.Cell>
                        <Badge
                          colorPalette={item.status === "DISCHARGED" ? "green" : item.status === "CANCELLED" ? "red" : "orange"}
                          borderRadius="full"
                        >
                          {item.status.replaceAll("_", " ")}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        {item.paymentMethod && !(item.balance && item.balance > 0) ? (
                          <Badge colorPalette="green" borderRadius="full">
                            Paid · {paymentMethodLabels[item.paymentMethod] ?? item.paymentMethod}
                          </Badge>
                        ) : (
                          <VStack align="flex-start" gap="1">
                            <Badge colorPalette={item.paid && item.paid > 0 ? "orange" : "red"} borderRadius="full">
                              {item.paid && item.paid > 0 ? "Part paid" : "Balance Due"}{item.balance ? ` · PKR ${item.balance.toLocaleString("en-PK", { maximumFractionDigits: 2 })} due` : ""}
                            </Badge>
                            {item.paid && item.paid > 0 ? (
                              <Text fontSize="10px" color="#607d76">Paid PKR {item.paid.toLocaleString("en-PK", { maximumFractionDigits: 2 })} of {Number(item.total).toLocaleString("en-PK", { maximumFractionDigits: 2 })}</Text>
                            ) : null}
                            <Button
                              size="2xs"
                              variant="outline"
                              borderColor="#c8dad5"
                              color="#126b68"
                              onClick={() => {
                                setRecordPaymentCase(item);
                                setRecordPaymentMethod("CASH");
                                setRecordPaymentAmount(String(item.balance ?? item.total));
                              }}
                            >
                              Record Payment
                            </Button>
                          </VStack>
                        )}
                      </Table.Cell>
                      <Table.Cell fontWeight="800" color="#123d3b">PKR {item.total}</Table.Cell>
                      <Table.Cell textAlign="right">
                        <HStack gap="2" justify="flex-end" flexWrap="wrap">
                          {item.status !== "DISCHARGED" && item.status !== "CANCELLED" && (
                            <>
                              <Button
                                size="xs"
                                variant="outline"
                                borderColor="#c8dad5"
                                color="#126b68"
                                _hover={{ bg: "#eef6f4" }}
                                onClick={() => {
                                  setSelectedCase(String(item.id));
                                  setMedicineCase(item);
                                }}
                              >
                                <FontAwesomeIcon icon={faPlus} />
                                &nbsp; Add
                              </Button>
                              <Button
                                size="xs"
                                bg="#123d3b"
                                color="white"
                                _hover={{ bg: "#255d58" }}
                                loading={saving && selectedCase === String(item.id)}
                                onClick={() => {
                                  setSelectedCase(String(item.id));
                                  void caseAction("DISCHARGE", String(item.id));
                                }}
                              >
                                <FontAwesomeIcon icon={faPrint} />
                                &nbsp; Discharge &amp; Bill
                              </Button>
                            </>
                          )}
                          <Button
                            size="xs"
                            variant="outline"
                            borderColor="#c8dad5"
                            color="#126b68"
                            _hover={{ bg: "#eef6f4" }}
                            onClick={() => void viewInvoice(item.id, item.status)}
                          >
                            View Invoice
                          </Button>
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
              {filteredCases.length ? `Showing ${firstCaseRecord}-${lastCaseRecord} of ${filteredCases.length}` : "No records"}
            </Text>
            <HStack gap="2" flexWrap="wrap">
              <Text fontSize="sm" color="#607d76">Rows per page</Text>
              <NativeSelect.Root width="90px" size="sm">
                <NativeSelect.Field
                  value={String(casesPageSize)}
                  onChange={(event) => {
                    setCasesPageSize(Number(event.target.value));
                    setCasesPage(1);
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
                disabled={casesPage === 1}
                onClick={() => setCasesPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              {Array.from({ length: casesPageCount }, (_, index) => index + 1).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={p === casesPage ? "solid" : "outline"}
                  bg={p === casesPage ? "#123d3b" : undefined}
                  color={p === casesPage ? "white" : undefined}
                  onClick={() => setCasesPage(p)}
                >
                  {p}
                </Button>
              ))}
              <Button
                size="sm"
                variant="outline"
                disabled={casesPage === casesPageCount}
                onClick={() => setCasesPage((p) => Math.min(casesPageCount, p + 1))}
              >
                Next
              </Button>
            </HStack>
          </Flex>
        </Box>

      {/* Record Payment — for cases admitted as "Due" once the patient actually pays */}
      {recordPaymentCase && (
        <Flex position="fixed" inset="0" bg="rgba(15, 30, 28, 0.55)" backdropFilter="blur(3px)" zIndex="100" align="center" justify="center" p="4">
          <Box bg="white" borderRadius="16px" w="full" maxW="440px" boxShadow="0 20px 40px rgba(0,0,0,0.2)" overflow="hidden">
            <Flex justify="space-between" align="center" px="24px" py="16px" bg="#123d3b" color="white">
              <Box>
                <Heading size="sm">Record Payment</Heading>
                <Text fontSize="xs" color="#a8c5bd">Case #: {recordPaymentCase.caseNumber}</Text>
              </Box>
              <Button variant="ghost" color="white" _hover={{ bg: "#255d58" }} p="2" minW="auto" onClick={() => setRecordPaymentCase(null)}>
                <FontAwesomeIcon icon={faXmark} size="lg" />
              </Button>
            </Flex>
            <Box p="24px">
              <Text fontSize="sm" color="#556e68" mb="1">Still due</Text>
              <Text fontSize="xl" fontWeight="900" color="#123d3b" mb="1">PKR {recordPaymentCase.balance ?? recordPaymentCase.total}</Text>
              <Text fontSize="xs" color="#607d76" mb="4">Bill PKR {recordPaymentCase.total}{recordPaymentCase.paid ? ` · already paid PKR ${recordPaymentCase.paid}` : ""}</Text>
              <Flex justify="space-between" align="center" mb="2">
                <Text fontSize="sm" fontWeight="700">Amount paying now (PKR)</Text>
                <Button size="2xs" variant="outline" borderColor="#c8dad5" color="#126b68" onClick={() => setRecordPaymentAmount(String(dueNow))}>
                  Pay full balance
                </Button>
              </Flex>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={recordPaymentAmount}
                onChange={(event) => setRecordPaymentAmount(event.target.value)}
                borderColor={recordAmountInvalid ? "#d9534f" : undefined}
                mb="2"
              />
              <Text fontSize="xs" mb="4" color={recordAmountInvalid ? "#c0392b" : "#607d76"}>
                {recordAmountInvalid
                  ? `Enter an amount between 1 and ${dueNow}.`
                  : recordAmountNumber < dueNow
                  ? `After this payment PKR ${Math.round((dueNow - recordAmountNumber) * 100) / 100} will still be due.`
                  : "This clears the whole balance."}
              </Text>
              <Text fontSize="sm" fontWeight="700" mb="2">Payment Method</Text>
              <NativeSelect.Root>
                <NativeSelect.Field value={recordPaymentMethod} onChange={(event) => setRecordPaymentMethod(event.target.value)}>
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                  <option value="ONLINE">Online</option>
                </NativeSelect.Field>
              </NativeSelect.Root>
            </Box>
            <Flex justify="flex-end" gap="3" px="24px" py="16px" bg="#f7faf9" borderTop="1px solid #e1e9e6">
              <Button variant="outline" borderColor="#c8dad5" onClick={() => setRecordPaymentCase(null)}>Cancel</Button>
              <Button
                bg="#123d3b"
                color="white"
                _hover={{ bg: "#255d58" }}
                loading={recordingPayment}
                disabled={recordAmountInvalid}
                onClick={async () => {
                  setRecordingPayment(true);
                  await caseAction("RECORD_PAYMENT", String(recordPaymentCase.id), recordPaymentMethod, recordAmountNumber);
                  setRecordingPayment(false);
                }}
              >
                <FontAwesomeIcon icon={faCheck} />
                &nbsp; Confirm Payment
              </Button>
            </Flex>
          </Box>
        </Flex>
      )}

      {showDischargeBillModal && dischargeBillCase && (
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
          <Box
            className="print-modal-card"
            bg="white"
            borderRadius="16px"
            w="full"
            maxW="700px"
            boxShadow="0 20px 40px rgba(0,0,0,0.2)"
            overflow="hidden"
          >
            {/* Modal Header */}
            <Flex justify="space-between" align="center" px="28px" py="18px" bg="#123d3b" color="white" className="no-print">
              <HStack gap="3">
                <Flex w="36px" h="36px" bg="#d6e66c" color="#123d3b" borderRadius="10px" align="center" justify="center">
                  <FontAwesomeIcon icon={faBed} />
                </Flex>
                <Box>
                  <Heading size="sm">
                    {invoiceMode === "discharge" ? "Discharge Bill" : invoiceMode === "additional" ? "Additional Charges Slip" : "OT Invoice / Receipt"}
                  </Heading>
                  <Text fontSize="xs" color="#a8c5bd">Case #: {dischargeBillCase.caseNumber}</Text>
                </Box>
              </HStack>
              <Button
                variant="ghost"
                color="white"
                _hover={{ bg: "#255d58" }}
                p="2"
                minW="auto"
                onClick={() => setShowDischargeBillModal(false)}
              >
                <FontAwesomeIcon icon={faXmark} size="lg" />
              </Button>
            </Flex>

            {/* Modal Body */}
            <Box className="print-modal-body" p={{ base: "20px", md: "28px" }} maxH="80vh" overflowY="auto">
              <Box className="printable-slip" p="4" border="2px solid #123d3b" borderRadius="12px" bg="white">
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
                      <Text fontSize="10px" color="#556e68" textTransform="uppercase">
                        OPERATION THEATER (OT) {invoiceMode === "discharge" ? "DISCHARGE BILL" : invoiceMode === "additional" ? "ADDITIONAL CHARGES SLIP" : "INVOICE / RECEIPT"}
                      </Text>
                    </Box>
                  </HStack>
                  <Box textAlign="right">
                    <Text fontSize="xs" fontWeight="800" color="#123d3b">Case #: {dischargeBillCase.caseNumber}</Text>
                    <Text fontSize="10px" color="#77908b">Date: {new Date().toLocaleDateString("en-GB")}</Text>
                  </Box>
                </Flex>

                <Grid templateColumns="1fr 1fr" gap="4" bg="#f8faf9" p="3" borderRadius="8px" mb="4" fontSize="xs">
                  <Box>
                    <Text color="#77908b">Patient Name:</Text>
                    <Text fontWeight="800" fontSize="sm">{dischargeBillCase.patient.name}</Text>
                    <Text color="#556e68">MR #: {dischargeBillCase.patient.mrNumber}</Text>
                  </Box>
                  <Box textAlign="right">
                    <Text color="#77908b">Operating Doctor:</Text>
                    <Text fontWeight="800" fontSize="sm">{dischargeBillCase.doctor.name}</Text>
                    <Text color="#556e68">Bed: {dischargeBillCase.roomBed.name}</Text>
                  </Box>
                </Grid>

                {invoiceMode === "additional" ? (
                  <>
                    <Text fontSize="xs" textTransform="uppercase" fontWeight="800" color="#123d3b" mb="2">
                      New Medicines &amp; Consumables Since Last Slip
                    </Text>
                    {newLineItems.length === 0 ? (
                      <Text fontSize="sm" color="#77908b" py="4" textAlign="center">
                        No new charges since the last slip.
                      </Text>
                    ) : (
                      <Table.Root size="sm" mb="4">
                        <Table.Body>
                          {newLineItems.map((item, idx) => (
                            <Table.Row key={idx}>
                              <Table.Cell>{item.description} ({item.quantity} qty)</Table.Cell>
                              <Table.Cell textAlign="right" fontWeight="700">{item.total} PKR</Table.Cell>
                            </Table.Row>
                          ))}
                        </Table.Body>
                      </Table.Root>
                    )}

                    <Flex justify="space-between" align="center" borderTop="2px solid #123d3b" pt="3">
                      <Text fontSize="md" fontWeight="900">Additional Charges Total</Text>
                      <Text fontSize="lg" fontWeight="900" color="#123d3b">{newLineItemsTotal.toFixed(2)} PKR</Text>
                    </Flex>
                    <Text fontSize="10px" color="#77908b" mt="1" textAlign="right">
                      Case total so far (all charges): PKR {dischargeBillCase.total}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text fontSize="xs" textTransform="uppercase" fontWeight="800" color="#123d3b" mb="2">
                      Bill Breakdown
                    </Text>
                    <Table.Root size="sm" mb="4">
                      <Table.Body>
                        <Table.Row>
                          <Table.Cell>OT Charge</Table.Cell>
                          <Table.Cell textAlign="right" fontWeight="700">{dischargeBillCase.theaterFee ?? "0.00"} PKR</Table.Cell>
                        </Table.Row>
                        <Table.Row>
                          <Table.Cell>Doctor Fee</Table.Cell>
                          <Table.Cell textAlign="right" fontWeight="700">{dischargeBillCase.doctorFee ?? "0.00"} PKR</Table.Cell>
                        </Table.Row>
                        <Table.Row>
                          <Table.Cell>Anesthesia Fee</Table.Cell>
                          <Table.Cell textAlign="right" fontWeight="700">{dischargeBillCase.anesthesiaFee ?? "0.00"} PKR</Table.Cell>
                        </Table.Row>
                        <Table.Row>
                          <Table.Cell>Room Charge ({dischargeBillCase.roomBed.name})</Table.Cell>
                          <Table.Cell textAlign="right" fontWeight="700">{dischargeBillCase.roomFee ?? "0.00"} PKR</Table.Cell>
                        </Table.Row>
                        <Table.Row>
                          <Table.Cell>Home Medicine{dischargeBillCase.homeMedicineNote ? ` (${dischargeBillCase.homeMedicineNote})` : ""}</Table.Cell>
                          <Table.Cell textAlign="right" fontWeight="700">{dischargeBillCase.homeMedicineFee ?? "0.00"} PKR</Table.Cell>
                        </Table.Row>
                        <Table.Row>
                          <Table.Cell>OT Medicine{dischargeBillCase.otMedicineNote ? ` (${dischargeBillCase.otMedicineNote})` : ""}</Table.Cell>
                          <Table.Cell textAlign="right" fontWeight="700">{dischargeBillCase.otMedicineFee ?? "0.00"} PKR</Table.Cell>
                        </Table.Row>
                        <Table.Row>
                          <Table.Cell>Hospital Fee</Table.Cell>
                          <Table.Cell textAlign="right" fontWeight="700">{dischargeBillCase.hospitalFee ?? "0.00"} PKR</Table.Cell>
                        </Table.Row>
                      </Table.Body>
                    </Table.Root>

                    {dischargeBillCase.lineItems && dischargeBillCase.lineItems.length > 0 && (
                      <>
                        <Text fontSize="xs" textTransform="uppercase" fontWeight="800" color="#123d3b" mb="2">
                          Add Consumables &amp; Medicines
                        </Text>
                        <Table.Root size="sm" mb="4">
                          <Table.Body>
                            {dischargeBillCase.lineItems.map((item, idx) => (
                              <Table.Row key={idx}>
                                <Table.Cell>{item.description} ({item.quantity} qty)</Table.Cell>
                                <Table.Cell textAlign="right" fontWeight="700">{item.total} PKR</Table.Cell>
                              </Table.Row>
                            ))}
                          </Table.Body>
                        </Table.Root>
                      </>
                    )}

                    {dischargeBillCase.recommendations && (
                      <Box mb="4" fontSize="xs" color="#556e68">
                        <Text fontWeight="800" color="#123d3b" textTransform="uppercase" mb="1">Recommendations</Text>
                        <Text whiteSpace="pre-wrap">{dischargeBillCase.recommendations}</Text>
                      </Box>
                    )}

                    <Box borderTop="2px solid #123d3b" pt="3">
                      <Flex justify="space-between" align="center">
                        <Text fontSize="md" fontWeight="900">Total Bill</Text>
                        <Text fontSize="md" fontWeight="900">{Number(dischargeBillCase.total).toLocaleString("en-PK", { maximumFractionDigits: 2 })} PKR</Text>
                      </Flex>
                      {(dischargeBillCase.payments ?? []).filter((p) => !p.status || p.status === "PAID").length > 0 && (
                        <Box mt="2">
                          <Text fontSize="10px" textTransform="uppercase" fontWeight="800" color="#77908b" mb="1">Payments received</Text>
                          {[...(dischargeBillCase.payments ?? [])]
                            .filter((p) => !p.status || p.status === "PAID")
                            .sort((x, y) => new Date(x.createdAt ?? 0).getTime() - new Date(y.createdAt ?? 0).getTime())
                            .map((p, idx) => (
                              <Flex key={idx} justify="space-between" fontSize="xs" color="#3e5e58" py="0.5">
                                <Text>{p.createdAt ? new Date(p.createdAt).toLocaleDateString("en-GB") : ""} · {paymentMethodLabels[p.method] ?? p.method}</Text>
                                <Text fontWeight="700">{Number(p.amount ?? 0).toLocaleString("en-PK", { maximumFractionDigits: 2 })} PKR</Text>
                              </Flex>
                            ))}
                          <Flex justify="space-between" fontSize="xs" fontWeight="800" color="#123d3b" pt="1" mt="1" borderTop="1px dashed #c8dad5">
                            <Text>Total paid</Text>
                            <Text>{billPaid.toLocaleString("en-PK", { maximumFractionDigits: 2 })} PKR</Text>
                          </Flex>
                        </Box>
                      )}
                      <Flex justify="space-between" align="center" mt="2" pt="2" borderTop="1px solid #e1e9e6">
                        <Text fontSize="md" fontWeight="900" color={billBalance > 0 ? "#a34258" : "#22633e"}>
                          {billBalance > 0 ? "Balance Due" : "Fully Paid"}
                        </Text>
                        <Text fontSize="lg" fontWeight="900" color={billBalance > 0 ? "#a34258" : "#22633e"}>
                          {billBalance > 0 ? billBalance.toLocaleString("en-PK", { maximumFractionDigits: 2 }) : "0"} PKR
                        </Text>
                      </Flex>
                    </Box>
                  </>
                )}
              </Box>
            </Box>

            {/* Modal Footer */}
            <Flex justify="flex-end" gap="3" px="28px" py="18px" borderTop="1px solid #e1e9e6" className="no-print">
              <Button variant="outline" onClick={() => setShowDischargeBillModal(false)}>Close</Button>
              <Button bg="#123d3b" color="white" _hover={{ bg: "#1a5450" }} onClick={printDischargeBill}>
                <FontAwesomeIcon icon={faPrint} />
                &nbsp; Print Recept
              </Button>
            </Flex>
          </Box>
        </Flex>
      )}
      </Box>
    </Box>
  );
}
