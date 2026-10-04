"use client";

import { useEffect, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Checkbox,
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
  faCheck,
  faClockRotateLeft,
  faNotesMedical,
  faPrint,
  faTrash,
  faUser,
  faUserDoctor,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";

type Patient = {
  id: number;
  mrNumber: string;
  name: string;
  fatherName: string;
  mobile?: string | null;
  gender?: string;
  cnic?: string | null;
  dateOfBirth?: string | null;
};
type Doctor = {
  id: number;
  name: string;
  specialization: string;
  nameUrdu?: string | null;
  specializationUrdu?: string | null;
  qualifications?: string | null;
  qualificationsUrdu?: string | null;
  consultationFee: string;
  availability: string | null;
  availabilityDays: number[];
  availabilityFrom: string | null;
  availabilityTo: string | null;
};
type VisitDoctor = {
  name: string;
  specialization: string;
  nameUrdu?: string | null;
  specializationUrdu?: string | null;
  qualifications?: string | null;
  qualificationsUrdu?: string | null;
  availability?: string | null;
  availabilityDays?: number[];
  availabilityFrom?: string | null;
  availabilityTo?: string | null;
};
type Visit = {
  id?: number;
  opdNumber: string;
  dailyToken: number;
  consultationFee: string;
  paymentMethod?: string;
  freeReason?: string | null;
  visitDate?: string;
  patient: {
    name: string;
    mrNumber: string;
    fatherName?: string;
    gender?: string;
    cnic?: string | null;
    dateOfBirth?: string | null;
  };
  doctor: VisitDoctor;
};
type HospitalSettings = {
  name: string;
  nameUrdu: string | null;
  address: string | null;
  addressUrdu: string | null;
  phone: string | null;
  email: string | null;
  logoDataUrl: string | null;
};

function computeAge(dob?: string | null) {
  if (!dob) return "";
  const birthDate = new Date(dob);
  const now = new Date();
  if (isNaN(birthDate.getTime())) return "";
  let years = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
    years--;
  }
  if (years >= 1) return `${years} Yrs`;
  // Under 1 year: compute months
  let months = now.getMonth() - birthDate.getMonth() + (now.getFullYear() - birthDate.getFullYear()) * 12;
  if (now.getDate() < birthDate.getDate()) months--;
  if (months >= 1) return `${months} Mos`;
  // Under 1 month: compute days
  const days = Math.floor((now.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24));
  return `${days} Days`;
}

const DAY_LABELS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LABELS_UR = ["اتوار", "پیر", "منگل", "بدھ", "جمعرات", "جمعہ", "ہفتہ"];

function formatAvailability(doctor: VisitDoctor, lang: "en" | "ur") {
  const days = doctor.availabilityDays ?? [];
  if (days.length && doctor.availabilityFrom && doctor.availabilityTo) {
    const labels = lang === "ur" ? DAY_LABELS_UR : DAY_LABELS_EN;
    const dayText = [...days].sort((a, b) => a - b).map((day) => labels[day]).join(lang === "ur" ? "، " : ", ");
    return `${dayText} · ${doctor.availabilityFrom}–${doctor.availabilityTo}`;
  }
  // Legacy free-text availability was only ever entered in English — no reliable Urdu translation exists.
  return lang === "en" ? (doctor.availability ?? "") : "";
}

export default function OpdPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [historyVisits, setHistoryVisits] = useState<Visit[]>([]);
  const [hospitalSettings, setHospitalSettings] = useState<HospitalSettings | null>(null);
  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [freeReason, setFreeReason] = useState("");
  const [visit, setVisit] = useState<Visit | null>(null);
  const [showSlipModal, setShowSlipModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);
  const [deleteVisitItem, setDeleteVisitItem] = useState<Visit | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [returnedMainSlip, setReturnedMainSlip] = useState(false);
  const [returnedDoctorReceipt, setReturnedDoctorReceipt] = useState(false);
  const [returnedPatientReceipt, setReturnedPatientReceipt] = useState(false);

  // Patient search combobox state
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

  async function loadInitialData() {
    try {
      const [patientRes, doctorRes, historyRes, settingsRes] = await Promise.all([
        fetch("/api/patients?q="),
        fetch("/api/doctors"),
        fetch("/api/opd"),
        fetch("/api/hospital-settings"),
      ]);
      const patientResult = await patientRes.json();
      const doctorResult = await doctorRes.json();
      const historyResult = await historyRes.json();
      if (doctorRes.ok) setDoctors(doctorResult.doctors);
      if (historyRes.ok) setHistoryVisits(historyResult.visits ?? []);
      if (settingsRes.ok) {
        const settingsResult = await settingsRes.json();
        setHospitalSettings(settingsResult.settings);
      }
      // Don't populate patients list — we use on-demand search instead
      void patientRes; void patientResult;
    } catch {
      toast.error("Unable to load doctor and history registers.");
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
    // Skip re-searching when the box just got filled with the selected patient's own
    // display text (set on click below) — otherwise this effect re-fires on that change,
    // searches for the literal "MR-... · Name" string, finds nothing, and reopens the
    // dropdown with a false "No patients found" right after a successful selection.
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

  async function createVisit() {
    if (paymentMethod === "FREE" && !freeReason.trim()) {
      toast.error("Enter a reason for waiving the consultation fee.");
      return;
    }
    setVisit(null);
    setSaving(true);
    try {
      const response = await fetch("/api/opd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, doctorId, paymentMethod, freeReason: freeReason.trim() }),
      });
      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error ?? "Unable to create OPD visit.");
        return;
      }
      setVisit(result.visit);
      setShowSlipModal(true);
      setPatientId("");
      setDoctorId("");
      setDoctorSearch("");
      setShowDoctorDropdown(false);
      setPaymentMethod("CASH");
      setFreeReason("");
      setPatientSearch("");
      setSelectedPatient(null);
      setPatientResults([]);
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

  // Thermal-style receipt copies (Doctor Copy / Patient Copy) — separate pop-up print,
  // does not touch the existing "Print Doctor Slip" flow above.
  function printCopy(copyType: "DOCTOR" | "PATIENT") {
    if (!visit) return;
    const escapeHtml = (value: string) =>
      value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);

    const clinicName = hospitalSettings?.name || "CareLedger Clinic";
    const date = new Date().toLocaleDateString("en-PK");
    const age = computeAge(visit.patient.dateOfBirth);
    const copyLabel = copyType === "DOCTOR" ? "Doctor Copy" : "Patient Copy";
    const availability = formatAvailability(visit.doctor, "en");
    const availabilityLine = availability ? `<br><strong>Available:</strong> ${escapeHtml(availability)}` : "";

    const method = visit.paymentMethod || "CASH";
    const isFree = method === "FREE";
    const paymentLabels: Record<string, string> = { CASH: "Cash", CARD: "Card", BANK_TRANSFER: "Bank Transfer", ONLINE: "Online", FREE: "Free" };
    const paymentLabel = paymentLabels[method] ?? method;
    const paymentRow = `<div class="row"><span>Payment</span><strong>${escapeHtml(paymentLabel)}</strong></div>${
      isFree && visit.freeReason ? `<div class="row"><span>Reason</span><strong>${escapeHtml(visit.freeReason)}</strong></div>` : ""
    }`;

    const feeRow = `<div class="rule"></div><div class="row total"><span>CONSULTATION FEE</span><span>${isFree ? "FREE" : `PKR ${escapeHtml(visit.consultationFee)}`}</span></div>${paymentRow}`;

    const printWindow = window.open("", `opd-${copyType.toLowerCase()}-copy`, "width=420,height=800");
    if (!printWindow) {
      toast.error("Allow pop-ups to print the OPD receipt.");
      return;
    }
    printWindow.addEventListener("load", () => {
      printWindow.focus();
      printWindow.print();
      printWindow.addEventListener("afterprint", () => printWindow.close(), { once: true });
    }, { once: true });
    printWindow.document.write(`<!doctype html><html><head><title>OPD ${escapeHtml(copyLabel)} ${escapeHtml(visit.opdNumber)}</title><style>
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
      <div class="center subtitle">OPD CONSULTATION SLIP</div>
      <div class="center copy-label">${escapeHtml(copyLabel.toUpperCase())}</div>
      <div class="meta">OPD #: ${escapeHtml(visit.opdNumber)}<br>Date: ${escapeHtml(date)}</div>
      <div class="rule"></div>
      <div class="token">TOKEN #${escapeHtml(String(visit.dailyToken))}</div>
      <div class="patient"><strong>Patient:</strong> ${escapeHtml(visit.patient.name)}<br><strong>MR #:</strong> ${escapeHtml(visit.patient.mrNumber)}<br><strong>Father Name:</strong> ${escapeHtml(visit.patient.fatherName || "-")}<br><strong>Age:</strong> ${escapeHtml(age || "-")} &nbsp; <strong>Gender:</strong> ${escapeHtml(visit.patient.gender || "-")}</div>
      <div class="rule"></div>
      <div class="patient"><strong>Doctor:</strong> ${escapeHtml(visit.doctor.name)}<br><strong>Specialization:</strong> ${escapeHtml(visit.doctor.specialization)}${availabilityLine}</div>
      ${feeRow}
      <div class="footer">Thank you</div>
    </main></body></html>`);
    printWindow.document.close();
  }

  function openDeleteModal(item: Visit) {
    setDeleteVisitItem(item);
    setDeleteReason("");
    setReturnedMainSlip(false);
    setReturnedDoctorReceipt(false);
    setReturnedPatientReceipt(false);
  }

  function closeDeleteModal() {
    setDeleteVisitItem(null);
    setDeleteReason("");
    setReturnedMainSlip(false);
    setReturnedDoctorReceipt(false);
    setReturnedPatientReceipt(false);
  }

  async function handleDeleteVisit() {
    if (!deleteVisitItem?.id) return;
    if (!deleteReason.trim()) {
      toast.error("Enter a reason for deleting this OPD visit.");
      return;
    }
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/opd?id=${deleteVisitItem.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: deleteReason.trim(),
          returnedMainSlip,
          returnedDoctorReceipt,
          returnedPatientReceipt,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to delete OPD visit.");
        return;
      }
      toast.success("OPD visit deleted successfully.");
      closeDeleteModal();
      await loadInitialData();
    } catch {
      toast.error("Network error while deleting OPD visit.");
    } finally {
      setIsDeleting(false);
    }
  }

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

  const filteredHistory = historyVisits.filter((v) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      v.opdNumber.toLowerCase().includes(q) ||
      v.patient.name.toLowerCase().includes(q) ||
      v.patient.mrNumber.toLowerCase().includes(q) ||
      v.doctor.name.toLowerCase().includes(q)
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
              OPD Desk & Visit History
            </Heading>
          </Box>
        </HStack>
      </Flex>

      {/* Main Content */}
      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>
        {/* Create Slip Form Container */}
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="14px" boxShadow="0 2px 12px rgba(14,36,32,0.04)" p={{ base: "20px", md: "28px" }} mb="8">
          <HStack mb="2">
            <Flex w="36px" h="36px" bg="#e9f1ef" color="#126b68" borderRadius="9px" align="center" justify="center">
              <FontAwesomeIcon icon={faNotesMedical} />
            </Flex>
            <Heading size="sm">Create Doctor Slip</Heading>
          </HStack>

          <Grid templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }} gap="5" mb="5">
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
              <Text fontSize="sm" fontWeight="700" mb="2">
                Select Attending Doctor
              </Text>
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
                fontSize="sm"
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
                        <Text fontSize="sm" fontWeight="700" color="#123d3b">
                          {doctor.name}
                        </Text>
                        <Text fontSize="xs" color="#506c65">
                          {doctor.specialization} &nbsp;·&nbsp; PKR {doctor.consultationFee}
                        </Text>
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
                Payment Method
              </Text>
              <NativeSelect.Root>
                <NativeSelect.Field
                  value={paymentMethod}
                  onChange={(event) => {
                    setPaymentMethod(event.target.value);
                    if (event.target.value !== "FREE") setFreeReason("");
                  }}
                >
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                  <option value="ONLINE">Online</option>
                  <option value="FREE">Free</option>
                </NativeSelect.Field>
              </NativeSelect.Root>
            </Box>
          </Grid>

          {paymentMethod === "FREE" && (
            <Box mb="5">
              <Text fontSize="sm" fontWeight="700" mb="2">
                Reason for free visit <Box as="span" color="#dc2626">*</Box>
              </Text>
              <Textarea
                placeholder="e.g. Poor patient, staff family, charity case…"
                value={freeReason}
                onChange={(event) => setFreeReason(event.target.value)}
              />
            </Box>
          )}

          {selectedDoctor && (
            <Flex bg="#f5f7f8" borderRadius="8px" p="4" justify="space-between" mb="5">
              <Text fontSize="sm" color="#607d76">
                Consultation Fee for {selectedDoctor.name} ({selectedDoctor.specialization})
              </Text>
              {paymentMethod === "FREE" ? (
                <Badge bg="#dce96f" color="#123d3b" fontWeight="800" borderRadius="full" px="3" py="1">
                  FREE
                </Badge>
              ) : (
                <Text fontWeight="800" color="#126b68" fontSize="md">
                  PKR {selectedDoctor.consultationFee}
                </Text>
              )}
            </Flex>
          )}



          <Flex justify="flex-end">
            <Button
              onClick={createVisit}
              loading={saving}
              disabled={!patientId || !doctorId || (paymentMethod === "FREE" && !freeReason.trim())}
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

        {/* OPD Visit History Table Section */}
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="14px" boxShadow="0 2px 12px rgba(14,36,32,0.04)" overflow="hidden">
          <Box p="5" borderBottom="1px solid #edf2f0">
            <Flex justify="space-between" align="center" direction={{ base: "column", sm: "row" }} gap="4">
              <HStack gap="3">
                <Flex w="34px" h="34px" bg="#e9f1ef" color="#126b68" borderRadius="9px" align="center" justify="center">
                  <FontAwesomeIcon icon={faClockRotateLeft} />
                </Flex>
                <Box>
                  <Heading size="sm">OPD Visit History</Heading>
                </Box>
              </HStack>

              <Input
                placeholder="Search history by patient, MR, OPD #, or doctor..."
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
                  <Table.ColumnHeader>OPD Number</Table.ColumnHeader>
                  <Table.ColumnHeader>Token #</Table.ColumnHeader>
                  <Table.ColumnHeader>Patient Details</Table.ColumnHeader>
                  <Table.ColumnHeader>Consultant Doctor</Table.ColumnHeader>
                  <Table.ColumnHeader>Fee Paid</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Action</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {filteredHistory.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={6}>
                      <Text py="8" textAlign="center" color="#77908b">
                        No OPD visits found in history.
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  visibleHistory.map((item) => (
                    <Table.Row key={item.opdNumber} _hover={{ bg: "#f9fbfa" }}>
                      <Table.Cell fontWeight="800" color="#126b68">
                        {item.opdNumber}
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
                      <Table.Cell>
                        <Text fontWeight="600" fontSize="sm">
                          {item.doctor.name}
                        </Text>
                        <Text fontSize="xs" color="#607d76">
                          {item.doctor.specialization}
                        </Text>
                      </Table.Cell>
                      <Table.Cell fontWeight="800" color="#123d3b">
                        {item.paymentMethod === "FREE" ? (
                          <Badge bg="#dce96f" color="#123d3b" fontWeight="800" borderRadius="full" px="2">
                            FREE
                          </Badge>
                        ) : (
                          `PKR ${item.consultationFee}`
                        )}
                      </Table.Cell>
                      <Table.Cell textAlign="right">
                        <HStack justify="flex-end" gap="2">
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
                          <Button
                            size="xs"
                            variant="outline"
                            borderColor="#fecaca"
                            color="#dc2626"
                            _hover={{ bg: "#fef2f2" }}
                            onClick={() => openDeleteModal(item)}
                          >
                            <FontAwesomeIcon icon={faTrash} />
                            &nbsp; Delete
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

      {/* OPD Consultation Slip Modal (Compliant with requirement.md FR-3.2) */}
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
          <Box
            className="print-modal-card"
            bg="white"
            borderRadius="16px"
            w="full"
            maxW="760px"
            boxShadow="0 20px 40px rgba(0,0,0,0.2)"
            overflow="hidden"
          >
            {/* Modal Header Controls */}
            <Flex justify="space-between" align="center" px="28px" py="14px" bg="#123d3b" color="white" className="no-print">
              <HStack gap="3">
                <Flex w="32px" h="32px" bg="#d6e66c" color="#123d3b" borderRadius="9px" align="center" justify="center">
                  <FontAwesomeIcon icon={faNotesMedical} size="sm" />
                </Flex>
                <Heading size="sm">Doctor Slip Preview</Heading>
              </HStack>
              <Button
                variant="ghost"
                color="white"
                _hover={{ bg: "#255d58" }}
                p="2"
                minW="auto"
                onClick={() => setShowSlipModal(false)}
              >
                <FontAwesomeIcon icon={faXmark} size="lg" />
              </Button>
            </Flex>

            {/* Page margin for printing THIS slip only: this style exists only while the slip is open on the
                OPD desk, so no other page or slip is affected. Zero margin also keeps the browser from
                printing its own title/date header and footer. */}
            <style>{`@media print { @page { margin: 0; } }`}</style>

            {/* Modal Body: Bilingual Doctor Slip Layout */}
            <Box className="print-modal-body" p={{ base: "20px", md: "28px" }} maxH="80vh" overflowY="auto">
              <Box
                className="printable-slip opd-doctor-slip"
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
                  {/* Watermark — a pre-faded, fully-opaque image (public/images/watermark-print.png),
                      not a CSS opacity/background-image trick. Chrome's print/PDF pipeline unreliably
                      drops both of those under "Background graphics" and opacity-compositing print
                      quirks; a plain foreground <img> at full opacity always prints, same as the
                      hospital logo above, so the faintness is baked into the pixels themselves. */}
                  <Flex className="slip-watermark" position="absolute" inset="0" align="center" justify="center" pointerEvents="none" zIndex="0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/images/watermark-print.png"
                      alt=""
                      style={{ width: "300px", height: "300px", objectFit: "contain" }}
                    />
                  </Flex>

                  <Box position="relative" zIndex="1" display="flex" flexDirection="column" flex="1">
                    {/* Header: English doctor (left) · Logo + hospital name (center) · Urdu doctor (right) */}
                    <Grid templateColumns="1fr auto 1fr" gap="3" alignItems="start" pb="0" mb="1" className="slip-header-grid">
                      {/* Doctor details — English */}
                      <Box textAlign="left" ml="3" mt="2" className="slip-inset-block slip-doctor-en">
                        <Text fontSize="md" fontWeight="900" color="#123d3b" lineHeight="1.25">
                          {visit.doctor.name}
                        </Text>
                        <Text fontSize="xs" fontWeight="700" color="#126b68">
                          {visit.doctor.specialization}
                        </Text>
                        {visit.doctor.qualifications && (
                          <Text fontSize="10px" color="#556e68" whiteSpace="pre-line" mt="1" lineHeight="1.4">
                            {visit.doctor.qualifications}
                          </Text>
                        )}
                        {formatAvailability(visit.doctor, "en") && (
                          <Text fontSize="9px" color="#77908b" mt="1">
                            Available: {formatAvailability(visit.doctor, "en")}
                          </Text>
                        )}
                      </Box>

                      {/* Hospital logo + name — center, nudged up */}
                      <Flex direction="column" align="center" justify="flex-start" px="2" mt="-10px">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={hospitalSettings?.logoDataUrl || "/images/logo.png"}
                          alt="Hospital logo"
                          style={{ width: 56, height: 56, objectFit: "contain" }}
                        />
                        <Text fontSize="10px" fontWeight="800" color="#123d3b" mt="1" textAlign="center" whiteSpace="nowrap">
                          {hospitalSettings?.name || "CareLedger Clinic"}
                        </Text>
                      </Flex>

                      {/* Doctor details — Urdu */}
                      <Box textAlign="right" dir="rtl" fontFamily="var(--font-urdu)" ml="3" mt="2" mr="3" pb="2" className="slip-inset-block slip-doctor-ur">
                        <Text fontSize="md" fontWeight="900" color="#123d3b" lineHeight="1.6">
                          {visit.doctor.nameUrdu || "—"}
                        </Text>
                        {visit.doctor.specializationUrdu && (
                          <Text fontSize="xs" fontWeight="700" color="#126b68">
                            {visit.doctor.specializationUrdu}
                          </Text>
                        )}
                        {visit.doctor.qualificationsUrdu && (
                          <Text fontSize="10px" color="#556e68" whiteSpace="pre-line" mt="1" lineHeight="1.6">
                            {visit.doctor.qualificationsUrdu}
                          </Text>
                        )}
                        {formatAvailability(visit.doctor, "ur") && (
                          <Text fontSize="11px" color="#556e68" mt="1.5" lineHeight="1.1">
                            دستیابی: {formatAvailability(visit.doctor, "ur")}
                          </Text>
                        )}
                      </Box>
                    </Grid>

                    {/* Token Number — heading in front of the number, centered below the logo */}
                    <VStack align="center" gap="1" mb="0" className="slip-token-block">
                      <HStack bg="#dce96f" borderRadius="10px" py="1.5" px="6" gap="2">
                        <Text fontSize="9px" textTransform="uppercase" fontWeight="900" color="#46633e" letterSpacing="0.08em">
                          Token Number
                        </Text>
                        <Heading size="lg" color="#123d3b" lineHeight="1.2">
                          #{visit.dailyToken}
                        </Heading>
                      </HStack>
                    </VStack>

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
                          OPD #: <Box as="span" fontWeight="800">{visit.opdNumber}</Box>
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

                    {/* Big blank space for the doctor's notes / prescription */}
                    <Box flex="1" />
                  </Box>
                </Box>

                {/* Footer: Hospital name + address — below the bordered box */}
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

            {/* Modal Footer Controls */}
            <Flex justify="flex-end" gap="2" px="28px" py="16px" bg="#f7faf9" borderTop="1px solid #e2e9e6" className="no-print" wrap="nowrap" overflowX="auto">
              <Button size="sm" flexShrink="0" variant="outline" borderColor="#c8dad5" onClick={() => setShowSlipModal(false)}>
                Close
              </Button>
              <Button size="sm" flexShrink="0" variant="outline" borderColor="#c8dad5" color="#126b68" onClick={() => printCopy("DOCTOR")}>
                <FontAwesomeIcon icon={faUserDoctor} />
                &nbsp; Print Doctor Receipt
              </Button>
              <Button size="sm" flexShrink="0" variant="outline" borderColor="#c8dad5" color="#126b68" onClick={() => printCopy("PATIENT")}>
                <FontAwesomeIcon icon={faUser} />
                &nbsp; Print Patient Receipt
              </Button>
              <Button size="sm" flexShrink="0" bg="#123d3b" color="white" _hover={{ bg: "#255d58" }} onClick={() => window.print()}>
                <FontAwesomeIcon icon={faPrint} />
                &nbsp; Print Doctor Slip
              </Button>
            </Flex>
          </Box>
        </Flex>
      )}

      {/* Delete Confirmation Modal */}
      {deleteVisitItem && (
        <Flex
          position="fixed"
          inset="0"
          bg="rgba(15, 30, 28, 0.55)"
          backdropFilter="blur(3px)"
          zIndex="110"
          align="center"
          justify="center"
          p="4"
        >
          <Box
            bg="white"
            borderRadius="16px"
            w="full"
            maxW="480px"
            boxShadow="0 20px 40px rgba(0,0,0,0.2)"
            overflow="hidden"
          >
            <Flex justify="space-between" align="center" px="24px" py="16px" bg="#dc2626" color="white">
              <HStack gap="2">
                <FontAwesomeIcon icon={faTrash} />
                <Heading size="sm">Delete OPD Visit</Heading>
              </HStack>
              <Button
                variant="ghost"
                color="white"
                _hover={{ bg: "#b91c1c" }}
                p="2"
                minW="auto"
                onClick={closeDeleteModal}
              >
                <FontAwesomeIcon icon={faXmark} size="lg" />
              </Button>
            </Flex>
            <Box p="24px" maxH="70vh" overflowY="auto">
              <Text fontSize="sm" color="#334155" mb="3">
                Are you sure you want to delete this OPD token visit?
              </Text>
              <Box bg="#fef2f2" border="1px solid #fecaca" borderRadius="8px" p="3" mb="4">
                <Text fontSize="xs" fontWeight="700" color="#991b1b">
                  OPD Number: {deleteVisitItem.opdNumber}
                </Text>
                <Text fontSize="xs" color="#991b1b">
                  Token: #{deleteVisitItem.dailyToken} &nbsp;•&nbsp; Patient: {deleteVisitItem.patient.name} ({deleteVisitItem.patient.mrNumber})
                </Text>
                <Text fontSize="xs" color="#991b1b">
                  Doctor: {deleteVisitItem.doctor.name}
                </Text>
              </Box>

              <Text fontSize="sm" fontWeight="700" mb="2">
                Reason for deletion <Box as="span" color="#dc2626">*</Box>
              </Text>
              <Textarea
                placeholder="e.g. Patient requested cancellation, duplicate token, wrong doctor selected…"
                value={deleteReason}
                onChange={(event) => setDeleteReason(event.target.value)}
                mb="4"
              />

              <Text fontSize="sm" fontWeight="700" mb="2">
                Printed slips collected back from patient
              </Text>
              <VStack align="stretch" gap="2" mb="1">
                <Checkbox.Root checked={returnedMainSlip} onCheckedChange={(details) => setReturnedMainSlip(Boolean(details.checked))}>
                  <Checkbox.HiddenInput />
                  <Checkbox.Control />
                  <Checkbox.Label>Main doctor slip returned</Checkbox.Label>
                </Checkbox.Root>
                <Checkbox.Root checked={returnedDoctorReceipt} onCheckedChange={(details) => setReturnedDoctorReceipt(Boolean(details.checked))}>
                  <Checkbox.HiddenInput />
                  <Checkbox.Control />
                  <Checkbox.Label>Doctor receipt returned</Checkbox.Label>
                </Checkbox.Root>
                <Checkbox.Root checked={returnedPatientReceipt} onCheckedChange={(details) => setReturnedPatientReceipt(Boolean(details.checked))}>
                  <Checkbox.HiddenInput />
                  <Checkbox.Control />
                  <Checkbox.Label>Patient receipt returned</Checkbox.Label>
                </Checkbox.Root>
              </VStack>

              <Text fontSize="xs" color="#64748b" mt="3">
                This will cancel the token and delete the associated consultation payment record.
              </Text>
            </Box>
            <Flex justify="flex-end" gap="3" px="24px" py="14px" bg="#f8fafc" borderTop="1px solid #e2e8f0">
              <Button variant="outline" borderColor="#cbd5e1" onClick={closeDeleteModal}>
                Cancel
              </Button>
              <Button
                bg="#dc2626"
                color="white"
                _hover={{ bg: "#b91c1c" }}
                loading={isDeleting}
                disabled={!deleteReason.trim()}
                onClick={handleDeleteVisit}
              >
                <FontAwesomeIcon icon={faTrash} />
                &nbsp; Confirm Delete
              </Button>
            </Flex>
          </Box>
        </Flex>
      )}
    </Box>
  );
}
