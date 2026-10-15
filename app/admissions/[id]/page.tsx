"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { Badge, Box, Button, Flex, Grid, Heading, HStack, Input, Link, NativeSelect, Table, Text, Textarea, VStack } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faArrowRightArrowLeft,
  faBan,
  faCircleCheck,
  faCircleXmark,
  faDoorOpen,
  faFileInvoice,
  faMoneyBillWave,
  faPlus,
  faPrint,
  faRotateLeft,
  faStethoscope,
  faTrash,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";
import { DateTimeInput } from "../../date-input";
import { formatDate } from "../../../lib/format-date";
import { medicinePurposeLabels } from "../../../lib/admission";
import { bedLabel, bedsFor, escapeHtml, formatDateTime, paymentMethodLabels, pkr, statusColors, statusLabels, type Bill, type Lookups } from "../shared";

type Admission = {
  id: number;
  admissionNumber: string;
  status: string;
  category: string;
  categoryLabel: string;
  admittedAt: string;
  invoicedAt: string | null;
  dischargedAt: string | null;
  diagnosis: string | null;
  notes: string | null;
  attendantName: string | null;
  attendantMobile: string | null;
  patient: { id: number; name: string; mrNumber: string; fatherName: string; gender: string; dateOfBirth: string | null; mobile: string };
  doctor: { id: number; name: string; specialization: string };
  roomBedId: number | null;
  roomLabel: string;
  dailyRoomRate: number;
  dailyDoctorFee: number;
  dailyTechnicianFee: number;
  days: { id: number; date: string; roomLabel: string; roomRate: number; doctorName: string; doctorFee: number; doctorVisited: boolean; technicianFee: number }[];
  charges: { id: number; description: string; amount: number; createdAt: string }[];
  operations: { id: number; caseNumber: string; status: string; procedureName: string | null; procedureAt: string | null; doctorName: string; total: number; breakdown: { theaterFee: number; doctorFee: number; anesthesiaFee: number; hospitalFee: number; items: number } }[];
  payments: { id: number; amount: number; method: string; status: string; note: string | null; createdAt: string }[];
  medicines: { id: number; saleNumber: string; purpose: string; creditStatus: string | null; createdAt: string; settledAt: string | null; total: number; net: number; owed: number; items: { name: string; quantity: number; total: number }[] }[];
  bill: Bill;
};

type ModalKind = "collect" | "refund" | "charge" | "operation" | "stay" | "cancel" | null;

function Modal({ title, subtitle, onClose, children, footer }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  return (
    <Flex position="fixed" inset="0" bg="rgba(15, 30, 28, 0.55)" backdropFilter="blur(3px)" zIndex="100" align="center" justify="center" p="4">
      <Box bg="white" borderRadius="16px" w="full" maxW="620px" boxShadow="0 20px 40px rgba(0,0,0,0.2)" overflow="hidden" maxH="92vh" display="flex" flexDirection="column">
        <Flex justify="space-between" align="center" px="24px" py="16px" bg="#123d3b" color="white" flexShrink="0">
          <Box>
            <Heading size="sm">{title}</Heading>
            {subtitle && <Text fontSize="xs" color="#a8c5bd">{subtitle}</Text>}
          </Box>
          <Button variant="ghost" color="white" _hover={{ bg: "#255d58" }} p="2" minW="auto" onClick={onClose}>
            <FontAwesomeIcon icon={faXmark} size="lg" />
          </Button>
        </Flex>
        <Box p="24px" overflowY="auto">{children}</Box>
        <Flex justify="flex-end" gap="3" px="24px" py="14px" bg="#f7faf9" borderTop="1px solid #e2e9e6" flexShrink="0">{footer}</Flex>
      </Box>
    </Flex>
  );
}

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <Box bg="white" border="1px solid #e1e9e6" borderRadius="14px" boxShadow="0 2px 12px rgba(14,36,32,0.04)" overflow="hidden" mb="6">
      <Flex px="5" py="4" borderBottom="1px solid #edf2f0" justify="space-between" align="center" gap="3" flexWrap="wrap">
        <Heading size="sm">{title}</Heading>
        {right}
      </Flex>
      {children}
    </Box>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box>
      <Text fontSize="10px" fontWeight="800" color="#77908b" textTransform="uppercase" letterSpacing="0.06em">{label}</Text>
      <Text fontSize="sm" fontWeight="700" color="#123d3b">{value}</Text>
    </Box>
  );
}

const methodOptions = (
  <>
    <option value="CASH">Cash</option>
    <option value="CARD">Card</option>
    <option value="BANK_TRANSFER">Bank transfer</option>
    <option value="ONLINE">Online</option>
  </>
);

export default function AdmissionProfilePage() {
  const id = useParams<{ id: string }>()?.id ?? "";
  const [admission, setAdmission] = useState<Admission | null>(null);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [clinicName, setClinicName] = useState("Al Qamar Hospital");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);

  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("CASH");
  const [chargeForm, setChargeForm] = useState({ description: "", amount: "" });
  const [operationForm, setOperationForm] = useState({ doctorId: "", procedureName: "", procedureAt: "", theaterFee: "", doctorFee: "", anesthesiaFee: "", hospitalFee: "" });
  const [stayForm, setStayForm] = useState({ roomMode: "BED", roomBedId: "", roomLabel: "", dailyRoomRate: "", doctorId: "", dailyDoctorFee: "", dailyTechnicianFee: "", diagnosis: "", notes: "", applyToday: false });
  const [cancelReason, setCancelReason] = useState("");

  async function load(admissionId: string) {
    try {
      const [res, lookupRes] = await Promise.all([fetch(`/api/admissions/${admissionId}`), fetch("/api/admissions?lookupsOnly=1")]);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Unable to load the admission.");
        return;
      }
      setAdmission(data.admission);
      if (lookupRes.ok) setLookups((await lookupRes.json()).lookups ?? null);
    } catch {
      toast.error("Unable to reach the clinic server.");
    }
  }

  useEffect(() => {
    async function loadInitial() {
      await load(id);
      try {
        const res = await fetch("/api/hospital-settings");
        if (res.ok) setClinicName((await res.json()).settings?.name || "Al Qamar Hospital");
      } catch { /* the default name is used on the invoice */ }
    }
    if (id) void loadInitial();
  }, [id]);

  async function act(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admissions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Unable to update the admission.");
        return false;
      }
      toast.success(data.message ?? "Saved.");
      setAdmission(data.admission);
      setModal(null);
      if (action === "UPDATE_STAY" || action === "DISCHARGE" || action === "CANCEL") void load(id);
      return true;
    } catch {
      toast.error("Unable to reach the clinic server.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!admission) {
    return <Box minH="100vh" bg="#eef2f0" p="10"><Text color="#77908b">Loading admission…</Text></Box>;
  }

  const a = admission;
  const bill = a.bill;
  const isAdmitted = a.status === "ADMITTED";
  const isInvoiced = a.status === "INVOICED";
  const canCancel = isAdmitted && a.payments.length === 0 && a.medicines.length === 0 && a.operations.every((o) => o.status === "CANCELLED");
  const readyToDischarge = isInvoiced && Math.abs(bill.hospitalBalance) <= 0.005 && bill.storeOwed <= 0.005;

  function openCollect() {
    setPayAmount(bill.hospitalBalance > 0.005 ? String(bill.hospitalBalance) : "");
    setPayMethod("CASH");
    setModal("collect");
  }

  function openStay() {
    setStayForm({
      roomMode: a.roomBedId ? "BED" : "MANUAL",
      roomBedId: a.roomBedId ? String(a.roomBedId) : "",
      roomLabel: a.roomBedId ? "" : a.roomLabel,
      dailyRoomRate: String(a.dailyRoomRate),
      doctorId: String(a.doctor.id),
      dailyDoctorFee: String(a.dailyDoctorFee),
      dailyTechnicianFee: String(a.dailyTechnicianFee),
      diagnosis: a.diagnosis ?? "",
      notes: a.notes ?? "",
      applyToday: false,
    });
    setModal("stay");
  }

  function openOperation() {
    setOperationForm({ doctorId: String(a.doctor.id), procedureName: "", procedureAt: "", theaterFee: "", doctorFee: "", anesthesiaFee: "", hospitalFee: "" });
    setModal("operation");
  }

  function printInvoice() {
    const visitedDays = a.days.filter((d) => d.doctorVisited).length;
    const row = (label: string, value: number) => `<div class="row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(pkr(value))}</strong></div>`;
    const hospitalRows = [
      row(`Room (${bill.days} day${bill.days === 1 ? "" : "s"})`, bill.roomTotal),
      row(`Doctor visits (${visitedDays} of ${bill.days} days)`, bill.doctorTotal),
      row("Technician", bill.technicianTotal),
      ...a.charges.map((c) => row(c.description, c.amount)),
      ...a.operations.filter((o) => o.status !== "CANCELLED").map((o) => row(`Operation ${o.caseNumber}${o.procedureName ? ` — ${o.procedureName}` : ""}`, o.total)),
    ].join("");
    const storeRows = Object.entries(bill.storeByPurpose).filter(([, value]) => value > 0).map(([purpose, value]) => row(medicinePurposeLabels[purpose] ?? purpose, value)).join("");
    const balanceLabel = bill.hospitalBalance < -0.005 ? "To hand back" : "Balance due";
    const status = a.status === "DISCHARGED" ? "FINAL INVOICE — DISCHARGED" : a.status === "INVOICED" ? "FINAL INVOICE" : "INTERIM BILL (charges still running)";

    const printWindow = window.open("", "admission-invoice", "width=420,height=800");
    if (!printWindow) {
      toast.error("Allow pop-ups to print the invoice.");
      return;
    }
    printWindow.addEventListener("load", () => {
      printWindow.focus();
      printWindow.print();
      printWindow.addEventListener("afterprint", () => printWindow.close(), { once: true });
    }, { once: true });
    printWindow.document.write(`<!doctype html><html><head><title>Invoice ${escapeHtml(a.admissionNumber)}</title><style>
      @page { size: 80mm auto; margin: 0; }
      * { box-sizing: border-box; }
      html, body { width: 80mm; margin: 0; padding: 0; background: #fff; color: #000; }
      body { font-family: Arial, sans-serif; font-size: 9.5pt; line-height: 1.3; padding: 4mm; }
      .receipt { width: 72mm; }
      .center { text-align: center; }
      .clinic { font-size: 14pt; font-weight: 800; }
      .subtitle { font-size: 9pt; font-weight: 700; margin-top: 1mm; }
      .meta { font-size: 8pt; margin-top: 2mm; }
      .rule { border-top: 1px dashed #000; margin: 3mm 0; }
      .section { font-size: 8.5pt; font-weight: 800; text-transform: uppercase; margin: 1mm 0; }
      .row { display: flex; justify-content: space-between; gap: 4mm; padding: 0.6mm 0; }
      .total { font-size: 11pt; font-weight: 800; }
      .footer { text-align: center; font-size: 8pt; margin-top: 5mm; }
    </style></head><body><main class="receipt">
      <div class="center clinic">${escapeHtml(clinicName.toUpperCase())}</div>
      <div class="center subtitle">IN-PATIENT ${escapeHtml(status)}</div>
      <div class="meta">
        Admission #: ${escapeHtml(a.admissionNumber)}<br>
        Patient: ${escapeHtml(a.patient.name)} (MR #: ${escapeHtml(a.patient.mrNumber)})<br>
        Type: ${escapeHtml(a.categoryLabel)} · Room: ${escapeHtml(a.roomLabel)}<br>
        Doctor: ${escapeHtml(a.doctor.name)}<br>
        Admitted: ${escapeHtml(formatDateTime(a.admittedAt))}<br>
        ${a.invoicedAt ? `Invoiced: ${escapeHtml(formatDateTime(a.invoicedAt))}<br>` : ""}
        ${a.dischargedAt ? `Discharged: ${escapeHtml(formatDateTime(a.dischargedAt))}<br>` : ""}
      </div>
      <div class="rule"></div>
      <div class="section">Hospital charges</div>
      ${hospitalRows}
      <div class="row total"><span>HOSPITAL TOTAL</span><span>${escapeHtml(pkr(bill.hospitalTotal))}</span></div>
      <div class="row"><span>Paid</span><strong>${escapeHtml(pkr(bill.hospitalPaid))}</strong></div>
      <div class="row total"><span>${balanceLabel}</span><span>${escapeHtml(pkr(Math.abs(bill.hospitalBalance)))}</span></div>
      ${storeRows ? `<div class="rule"></div><div class="section">Medical store medicines</div>${storeRows}
      <div class="row total"><span>MEDICINE TOTAL</span><span>${escapeHtml(pkr(bill.storeTotal))}</span></div>
      <div class="row"><span>${bill.storeOwed > 0.005 ? "Not yet paid to store" : "Paid to store"}</span><strong>${escapeHtml(pkr(bill.storeOwed > 0.005 ? bill.storeOwed : bill.storeTotal))}</strong></div>` : ""}
      <div class="rule"></div>
      <div class="row total"><span>GRAND TOTAL</span><span>${escapeHtml(pkr(bill.hospitalTotal + bill.storeTotal))}</span></div>
      <div class="footer">Get well soon</div>
    </main></body></html>`);
    printWindow.document.close();
  }

  const stayBeds = bedsFor(lookups, a.category);

  return (
    <Box minH="100vh" bg="#eef2f0" color="#0e2420">
      <Flex
        as="header"
        position="sticky"
        top="0"
        zIndex="40"
        minH="72px"
        py="3"
        bg="rgba(255,255,255,0.90)"
        style={{ backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}
        borderBottom="1px solid rgba(14,36,32,0.07)"
        align="center"
        justify="space-between"
        gap="3"
        flexWrap="wrap"
        px={{ base: "20px", md: "42px" }}
      >
        <HStack gap="4">
          <Link href="/admissions" color="#2da08b" _hover={{ color: "#1a8070" }}>
            <FontAwesomeIcon icon={faArrowLeft} />
          </Link>
          <Box>
            <HStack gap="3">
              <Heading size="lg" letterSpacing="-0.04em">{a.admissionNumber}</Heading>
              <Badge colorPalette={statusColors[a.status] ?? "gray"} borderRadius="full">{statusLabels[a.status] ?? a.status}</Badge>
            </HStack>
            <Text fontSize="sm" color="#506c65">{a.patient.name} · {a.patient.mrNumber} · {a.categoryLabel}</Text>
          </Box>
        </HStack>
        <HStack gap="2" flexWrap="wrap">
          {(isAdmitted || isInvoiced) && (
            <Button size="sm" bg="#123d3b" color="white" _hover={{ bg: "#255d58" }} onClick={openCollect}>
              <FontAwesomeIcon icon={faMoneyBillWave} />&nbsp; {isAdmitted ? "Collect advance" : "Collect payment"}
            </Button>
          )}
          {isInvoiced && bill.hospitalBalance < -0.005 && (
            <Button size="sm" variant="outline" borderColor="#e0b38a" color="#b26732" onClick={() => { setPayMethod("CASH"); setModal("refund"); }}>
              <FontAwesomeIcon icon={faRotateLeft} />&nbsp; Refund excess
            </Button>
          )}
          {isAdmitted && (
            <>
              <Button size="sm" variant="outline" borderColor="#c8dad5" color="#126b68" onClick={() => { setChargeForm({ description: "", amount: "" }); setModal("charge"); }}>
                <FontAwesomeIcon icon={faPlus} />&nbsp; Add charge
              </Button>
              <Button size="sm" variant="outline" borderColor="#c8dad5" color="#126b68" onClick={openOperation} disabled={!lookups}>
                <FontAwesomeIcon icon={faStethoscope} />&nbsp; Add operation
              </Button>
              <Button size="sm" variant="outline" borderColor="#c8dad5" color="#126b68" onClick={openStay} disabled={!lookups}>
                <FontAwesomeIcon icon={faArrowRightArrowLeft} />&nbsp; Room / doctor / rates
              </Button>
              <Button size="sm" bg="#b26732" color="white" _hover={{ bg: "#94552a" }} loading={busy}
                onClick={() => { if (window.confirm("Generate the final invoice? Daily charges stop now and the store can no longer add medicine. You can reopen it if the patient stays.")) void act("INVOICE"); }}>
                <FontAwesomeIcon icon={faFileInvoice} />&nbsp; Final invoice
              </Button>
            </>
          )}
          {isInvoiced && (
            <>
              <Button size="sm" variant="outline" borderColor="#c8dad5" color="#126b68" loading={busy} onClick={() => void act("REOPEN")}>
                <FontAwesomeIcon icon={faRotateLeft} />&nbsp; Reopen
              </Button>
              <Button size="sm" bg="#22633e" color="white" _hover={{ bg: "#1b4f31" }} loading={busy} disabled={!readyToDischarge}
                title={readyToDischarge ? undefined : "Clear the hospital balance and get the store to mark its medicines paid first."}
                onClick={() => { if (window.confirm(`Discharge ${a.patient.name}?`)) void act("DISCHARGE"); }}>
                <FontAwesomeIcon icon={faDoorOpen} />&nbsp; Discharge
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" borderColor="#c8dad5" color="#126b68" onClick={printInvoice}>
            <FontAwesomeIcon icon={faPrint} />&nbsp; Print {isAdmitted ? "bill" : "invoice"}
          </Button>
          {canCancel && (
            <Button size="sm" variant="ghost" color="#a34258" onClick={() => { setCancelReason(""); setModal("cancel"); }}>
              <FontAwesomeIcon icon={faBan} />&nbsp; Cancel
            </Button>
          )}
        </HStack>
      </Flex>

      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "24px", md: "32px" }}>
        <Grid templateColumns={{ base: "1fr", lg: "repeat(4, 1fr)" }} gap="4" mb="6">
          <Box bg="white" border="1px solid #e1e9e6" borderRadius="14px" p="5">
            <VStack align="stretch" gap="3">
              <Fact label="Patient" value={`${a.patient.name} (${a.patient.gender})`} />
              <Fact label="MR # · Father" value={`${a.patient.mrNumber} · ${a.patient.fatherName}`} />
              {a.patient.dateOfBirth && <Fact label="Date of birth" value={formatDate(a.patient.dateOfBirth)} />}
              {(a.attendantName || a.attendantMobile) && <Fact label="Attendant" value={[a.attendantName, a.attendantMobile].filter(Boolean).join(" · ")} />}
            </VStack>
          </Box>
          <Box bg="white" border="1px solid #e1e9e6" borderRadius="14px" p="5">
            <VStack align="stretch" gap="3">
              <Fact label="Room / bed" value={a.roomLabel} />
              <Fact label="Attending doctor" value={a.doctor.name} />
              <Fact label="Admitted" value={formatDateTime(a.admittedAt)} />
              {a.invoicedAt && <Fact label="Invoiced" value={formatDateTime(a.invoicedAt)} />}
              {a.dischargedAt && <Fact label="Discharged" value={formatDateTime(a.dischargedAt)} />}
            </VStack>
          </Box>
          <Box bg="white" border="1px solid #e1e9e6" borderRadius="14px" p="5">
            <VStack align="stretch" gap="3">
              <Fact label={`Hospital bill (${bill.days} day${bill.days === 1 ? "" : "s"})`} value={pkr(bill.hospitalTotal)} />
              <Fact label="Paid" value={pkr(bill.hospitalPaid)} />
              <Box>
                <Text fontSize="10px" fontWeight="800" color="#77908b" textTransform="uppercase" letterSpacing="0.06em">{bill.hospitalBalance < -0.005 ? "Advance in hand" : "Balance due"}</Text>
                <Text fontSize="xl" fontWeight="800" color={bill.hospitalBalance > 0.005 ? "#a34258" : bill.hospitalBalance < -0.005 ? "#b26732" : "#22633e"}>{pkr(Math.abs(bill.hospitalBalance))}</Text>
              </Box>
            </VStack>
          </Box>
          <Box bg="white" border="1px solid #e1e9e6" borderRadius="14px" p="5">
            <VStack align="stretch" gap="3">
              <Fact label="Store medicines" value={pkr(bill.storeTotal)} />
              <Box>
                <Text fontSize="10px" fontWeight="800" color="#77908b" textTransform="uppercase" letterSpacing="0.06em">Owed to the store</Text>
                <Text fontSize="xl" fontWeight="800" color={bill.storeOwed > 0.005 ? "#a34258" : "#22633e"}>{pkr(bill.storeOwed)}</Text>
              </Box>
              <Text fontSize="xs" color="#607d76">Paid at the medical store counter; the store marks it paid.</Text>
            </VStack>
          </Box>
        </Grid>

        {isInvoiced && (
          <Box bg={readyToDischarge ? "#eef8f1" : "#fdf6ee"} border="1px solid" borderColor={readyToDischarge ? "#bfe0c9" : "#f0d6b8"} borderRadius="14px" p="4" mb="6">
            <Text fontWeight="800" mb="2">Before discharge</Text>
            <VStack align="stretch" gap="1" fontSize="sm">
              <HStack><FontAwesomeIcon icon={Math.abs(bill.hospitalBalance) <= 0.005 ? faCircleCheck : faCircleXmark} color={Math.abs(bill.hospitalBalance) <= 0.005 ? "#22633e" : "#a34258"} />
                <Text>{Math.abs(bill.hospitalBalance) <= 0.005 ? "Hospital bill fully paid" : bill.hospitalBalance > 0 ? `Collect ${pkr(bill.hospitalBalance)} on the hospital bill` : `Hand back ${pkr(-bill.hospitalBalance)} excess advance`}</Text></HStack>
              <HStack><FontAwesomeIcon icon={bill.storeOwed <= 0.005 ? faCircleCheck : faCircleXmark} color={bill.storeOwed <= 0.005 ? "#22633e" : "#a34258"} />
                <Text>{bill.storeOwed <= 0.005 ? "Medical store medicines paid" : `Medical store still owed ${pkr(bill.storeOwed)} — the store must mark it paid`}</Text></HStack>
            </VStack>
          </Box>
        )}

        {a.diagnosis && (
          <Box bg="white" border="1px solid #e1e9e6" borderRadius="14px" p="5" mb="6">
            <Fact label="Diagnosis" value={a.diagnosis} />
            {a.notes && <Text fontSize="sm" color="#506c65" mt="2">{a.notes}</Text>}
          </Box>
        )}

        <Section
          title="Day-by-day charges"
          right={<Text fontSize="xs" color="#607d76">Under 24 hours = 1 day; after that every calendar date is charged. Untick the doctor on a day they did not come.</Text>}
        >
          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg="#fafcfb">
                  <Table.ColumnHeader>Date</Table.ColumnHeader>
                  <Table.ColumnHeader>Room</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Room</Table.ColumnHeader>
                  <Table.ColumnHeader>Doctor</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Doctor fee</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Technician</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Day total</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {a.days.map((d) => (
                  <Table.Row key={d.id}>
                    <Table.Cell fontWeight="700">{formatDate(d.date)}</Table.Cell>
                    <Table.Cell fontSize="sm">{d.roomLabel}</Table.Cell>
                    <Table.Cell textAlign="right">{pkr(d.roomRate)}</Table.Cell>
                    <Table.Cell>
                      <HStack gap="2">
                        <Text fontSize="sm">{d.doctorName}</Text>
                        <Button
                          size="2xs"
                          variant="outline"
                          borderColor={d.doctorVisited ? "#bfe0c9" : "#f0c4cf"}
                          color={d.doctorVisited ? "#22633e" : "#a34258"}
                          disabled={!isAdmitted || busy}
                          title={isAdmitted ? "Click to change" : "Reopen the invoice to change"}
                          onClick={() => void act("SET_DOCTOR_VISIT", { dayId: d.id, visited: !d.doctorVisited })}
                        >
                          {d.doctorVisited ? "Arrived" : "Did not arrive"}
                        </Button>
                      </HStack>
                    </Table.Cell>
                    <Table.Cell textAlign="right" color={d.doctorVisited ? undefined : "#a0aeaa"} textDecoration={d.doctorVisited ? undefined : "line-through"}>{pkr(d.doctorFee)}</Table.Cell>
                    <Table.Cell textAlign="right">{pkr(d.technicianFee)}</Table.Cell>
                    <Table.Cell textAlign="right" fontWeight="800">{pkr(d.roomRate + (d.doctorVisited ? d.doctorFee : 0) + d.technicianFee)}</Table.Cell>
                  </Table.Row>
                ))}
                <Table.Row bg="#fafcfb">
                  <Table.Cell colSpan={2} fontWeight="800">{bill.days} day{bill.days === 1 ? "" : "s"}</Table.Cell>
                  <Table.Cell textAlign="right" fontWeight="800">{pkr(bill.roomTotal)}</Table.Cell>
                  <Table.Cell />
                  <Table.Cell textAlign="right" fontWeight="800">{pkr(bill.doctorTotal)}</Table.Cell>
                  <Table.Cell textAlign="right" fontWeight="800">{pkr(bill.technicianTotal)}</Table.Cell>
                  <Table.Cell textAlign="right" fontWeight="800">{pkr(bill.roomTotal + bill.doctorTotal + bill.technicianTotal)}</Table.Cell>
                </Table.Row>
              </Table.Body>
            </Table.Root>
          </Box>
        </Section>

        <Grid templateColumns={{ base: "1fr", xl: "1fr 1fr" }} gap="6">
          <Section title="Extra charges" right={<Text fontWeight="800">{pkr(bill.extrasTotal)}</Text>}>
            {a.charges.length === 0 ? <Text px="5" py="4" fontSize="sm" color="#77908b">None.</Text> : (
              <Table.Root size="sm">
                <Table.Body>
                  {a.charges.map((c) => (
                    <Table.Row key={c.id}>
                      <Table.Cell fontSize="sm">{c.description}<Text fontSize="10px" color="#77908b">{formatDateTime(c.createdAt)}</Text></Table.Cell>
                      <Table.Cell textAlign="right" fontWeight="700">{pkr(c.amount)}</Table.Cell>
                      <Table.Cell textAlign="right" w="40px">
                        {isAdmitted && (
                          <Button size="2xs" variant="ghost" color="#a34258" disabled={busy} onClick={() => { if (window.confirm(`Remove "${c.description}"?`)) void act("REMOVE_CHARGE", { chargeId: c.id }); }}>
                            <FontAwesomeIcon icon={faTrash} />
                          </Button>
                        )}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            )}
          </Section>

          <Section title="Operations" right={<Text fontWeight="800">{pkr(bill.operationsTotal)}</Text>}>
            {a.operations.length === 0 ? <Text px="5" py="4" fontSize="sm" color="#77908b">None. Use “Add operation” for a surgery during this stay.</Text> : (
              <Table.Root size="sm">
                <Table.Body>
                  {a.operations.map((o) => (
                    <Table.Row key={o.id}>
                      <Table.Cell fontSize="sm">
                        <Text fontWeight="700">{o.caseNumber} · {o.procedureName ?? "Operation"}</Text>
                        <Text fontSize="xs" color="#77908b">
                          {o.doctorName}{o.procedureAt ? ` · ${formatDateTime(o.procedureAt)}` : ""} · OT {pkr(o.breakdown.theaterFee)}, surgeon {pkr(o.breakdown.doctorFee)}, anesthesia {pkr(o.breakdown.anesthesiaFee)}, hospital {pkr(o.breakdown.hospitalFee)}{o.breakdown.items ? `, items ${pkr(o.breakdown.items)}` : ""}
                        </Text>
                      </Table.Cell>
                      <Table.Cell><Badge borderRadius="full" colorPalette={o.status === "CANCELLED" ? "red" : o.status === "DISCHARGED" ? "green" : "orange"}>{o.status.replaceAll("_", " ")}</Badge></Table.Cell>
                      <Table.Cell textAlign="right" fontWeight="700">{pkr(o.total)}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            )}
          </Section>
        </Grid>

        <Section
          title="Medicines from the medical store"
          right={<Text fontSize="sm">Ward {pkr(bill.storeByPurpose.WARD ?? 0)} · OT {pkr(bill.storeByPurpose.OT ?? 0)} · Home {pkr(bill.storeByPurpose.HOME ?? 0)}</Text>}
        >
          {a.medicines.length === 0 ? <Text px="5" py="4" fontSize="sm" color="#77908b">The store has not issued any medicine for this admission.</Text> : (
            <Box overflowX="auto">
              <Table.Root size="sm">
                <Table.Header>
                  <Table.Row bg="#fafcfb">
                    <Table.ColumnHeader>Sale #</Table.ColumnHeader>
                    <Table.ColumnHeader>For</Table.ColumnHeader>
                    <Table.ColumnHeader>Medicines</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right">Amount</Table.ColumnHeader>
                    <Table.ColumnHeader>Status</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {a.medicines.map((m) => (
                    <Table.Row key={m.id}>
                      <Table.Cell fontSize="sm" fontWeight="700">{m.saleNumber}<Text fontSize="10px" color="#77908b">{formatDateTime(m.createdAt)}</Text></Table.Cell>
                      <Table.Cell fontSize="sm">{medicinePurposeLabels[m.purpose] ?? m.purpose}</Table.Cell>
                      <Table.Cell fontSize="xs">{m.items.map((i) => `${i.name} ×${i.quantity}`).join(", ")}</Table.Cell>
                      <Table.Cell textAlign="right" fontWeight="700">{pkr(m.net)}{m.net !== m.total && <Text fontSize="10px" color="#77908b">of {pkr(m.total)} (returns)</Text>}</Table.Cell>
                      <Table.Cell><Badge borderRadius="full" colorPalette={m.creditStatus === "UNSETTLED" ? "red" : "green"}>{m.creditStatus === "UNSETTLED" ? "Not paid" : "Paid"}</Badge></Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </Box>
          )}
        </Section>

        <Section title="Payments (hospital bill)" right={<Text fontWeight="800">{pkr(bill.hospitalPaid)}</Text>}>
          {a.payments.length === 0 ? <Text px="5" py="4" fontSize="sm" color="#77908b">No payments yet.</Text> : (
            <Table.Root size="sm">
              <Table.Body>
                {a.payments.map((p) => (
                  <Table.Row key={p.id}>
                    <Table.Cell fontSize="sm">{formatDateTime(p.createdAt)}</Table.Cell>
                    <Table.Cell fontSize="sm">{paymentMethodLabels[p.method] ?? p.method}</Table.Cell>
                    <Table.Cell fontSize="xs" color="#607d76">{p.note}</Table.Cell>
                    <Table.Cell textAlign="right" fontWeight="700" color={p.amount < 0 ? "#b26732" : undefined}>{pkr(p.amount)}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          )}
        </Section>
      </Box>

      {modal === "collect" && (
        <Modal
          title={isAdmitted ? "Collect advance" : "Collect payment"}
          subtitle={`Hospital bill ${pkr(bill.hospitalTotal)} · paid ${pkr(bill.hospitalPaid)} · ${bill.hospitalBalance > 0 ? `due ${pkr(bill.hospitalBalance)}` : "nothing due yet"}`}
          onClose={() => setModal(null)}
          footer={<>
            <Button variant="outline" borderColor="#c8dad5" onClick={() => setModal(null)}>Close</Button>
            <Button bg="#123d3b" color="white" _hover={{ bg: "#255d58" }} loading={busy} onClick={() => void act("COLLECT", { amount: payAmount, method: payMethod })}>Record payment</Button>
          </>}
        >
          <Grid templateColumns="1fr 1fr" gap="3">
            <Box>
              <Text fontSize="sm" fontWeight="700" mb="2">Amount (PKR)</Text>
              <Input type="number" min="0" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </Box>
            <Box>
              <Text fontSize="sm" fontWeight="700" mb="2">Method</Text>
              <NativeSelect.Root><NativeSelect.Field value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>{methodOptions}</NativeSelect.Field></NativeSelect.Root>
            </Box>
          </Grid>
          <Text fontSize="xs" color="#607d76" mt="3">
            {isAdmitted ? "While the patient is admitted any amount is taken as an advance against the final bill." : "Medicine from the store is paid separately at the store counter."}
          </Text>
        </Modal>
      )}

      {modal === "refund" && (
        <Modal
          title="Refund excess advance"
          subtitle={`The patient paid ${pkr(-bill.hospitalBalance)} more than the final hospital bill.`}
          onClose={() => setModal(null)}
          footer={<>
            <Button variant="outline" borderColor="#c8dad5" onClick={() => setModal(null)}>Close</Button>
            <Button bg="#b26732" color="white" loading={busy} onClick={() => void act("REFUND", { method: payMethod })}>Hand back {pkr(-bill.hospitalBalance)}</Button>
          </>}
        >
          <Text fontSize="sm" fontWeight="700" mb="2">Handed back by</Text>
          <NativeSelect.Root><NativeSelect.Field value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>{methodOptions}</NativeSelect.Field></NativeSelect.Root>
        </Modal>
      )}

      {modal === "charge" && (
        <Modal
          title="Add charge"
          subtitle="Oxygen, a procedure, dressing… anything billed during the stay (hospital income)."
          onClose={() => setModal(null)}
          footer={<>
            <Button variant="outline" borderColor="#c8dad5" onClick={() => setModal(null)}>Close</Button>
            <Button bg="#123d3b" color="white" _hover={{ bg: "#255d58" }} loading={busy} onClick={() => void act("ADD_CHARGE", chargeForm)}>Add to bill</Button>
          </>}
        >
          <Grid templateColumns="2fr 1fr" gap="3">
            <Input placeholder="What is it for?" value={chargeForm.description} onChange={(e) => setChargeForm({ ...chargeForm, description: e.target.value })} />
            <Input type="number" min="0" placeholder="Amount" value={chargeForm.amount} onChange={(e) => setChargeForm({ ...chargeForm, amount: e.target.value })} />
          </Grid>
        </Modal>
      )}

      {modal === "operation" && lookups && (
        <Modal
          title="Add operation"
          subtitle="Booked as an OT case and billed on this admission. Room and medicine are already charged here, so they are not part of it."
          onClose={() => setModal(null)}
          footer={<>
            <Button variant="outline" borderColor="#c8dad5" onClick={() => setModal(null)}>Close</Button>
            <Button bg="#123d3b" color="white" _hover={{ bg: "#255d58" }} loading={busy} onClick={() => void act("ADD_OPERATION", { ...operationForm, doctorId: Number(operationForm.doctorId) })}>Add operation</Button>
          </>}
        >
          <VStack align="stretch" gap="3">
            <Box>
              <Text fontSize="sm" fontWeight="700" mb="2">Operating doctor</Text>
              <NativeSelect.Root>
                <NativeSelect.Field value={operationForm.doctorId} onChange={(e) => setOperationForm({ ...operationForm, doctorId: e.target.value })}>
                  {lookups.doctors.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.specialization}</option>)}
                </NativeSelect.Field>
              </NativeSelect.Root>
            </Box>
            <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap="3">
              <Box>
                <Text fontSize="sm" fontWeight="700" mb="2">Procedure</Text>
                <Input value={operationForm.procedureName} onChange={(e) => setOperationForm({ ...operationForm, procedureName: e.target.value })} />
              </Box>
              <Box>
                <Text fontSize="sm" fontWeight="700" mb="2">Date / time</Text>
                <DateTimeInput value={operationForm.procedureAt} onChange={(e) => setOperationForm({ ...operationForm, procedureAt: e.target.value })} />
              </Box>
            </Grid>
            <Grid templateColumns={{ base: "1fr 1fr", md: "repeat(4, 1fr)" }} gap="3">
              {([["theaterFee", "OT charge"], ["doctorFee", "Surgeon fee"], ["anesthesiaFee", "Anesthesia"], ["hospitalFee", "Hospital fee"]] as const).map(([key, label]) => (
                <Box key={key}>
                  <Text fontSize="sm" fontWeight="700" mb="2">{label}</Text>
                  <Input type="number" min="0" placeholder="0" value={operationForm[key]} onChange={(e) => setOperationForm({ ...operationForm, [key]: e.target.value })} />
                </Box>
              ))}
            </Grid>
            <Text fontSize="xs" color="#607d76">Consumables can still be added to the case on the OT page (as Due). The surgeon&apos;s share counts when this admission is discharged.</Text>
          </VStack>
        </Modal>
      )}

      {modal === "stay" && lookups && (
        <Modal
          title="Room, doctor and daily rates"
          subtitle="Days already charged keep their rates. New rates apply from the next day unless you tick “also the current day”."
          onClose={() => setModal(null)}
          footer={<>
            <Button variant="outline" borderColor="#c8dad5" onClick={() => setModal(null)}>Close</Button>
            <Button bg="#123d3b" color="white" _hover={{ bg: "#255d58" }} loading={busy}
              onClick={() => void act("UPDATE_STAY", { ...stayForm, roomBedId: stayForm.roomMode === "BED" ? Number(stayForm.roomBedId) || null : null, roomLabel: stayForm.roomMode === "MANUAL" ? stayForm.roomLabel : "", doctorId: Number(stayForm.doctorId) })}>
              Save
            </Button>
          </>}
        >
          <VStack align="stretch" gap="3">
            <HStack gap="2">
              <Button size="xs" variant={stayForm.roomMode === "BED" ? "solid" : "outline"} bg={stayForm.roomMode === "BED" ? "#123d3b" : undefined} color={stayForm.roomMode === "BED" ? "white" : "#123d3b"} onClick={() => setStayForm({ ...stayForm, roomMode: "BED" })}>Configured room / bed</Button>
              <Button size="xs" variant={stayForm.roomMode === "MANUAL" ? "solid" : "outline"} bg={stayForm.roomMode === "MANUAL" ? "#123d3b" : undefined} color={stayForm.roomMode === "MANUAL" ? "white" : "#123d3b"} onClick={() => setStayForm({ ...stayForm, roomMode: "MANUAL", roomBedId: "" })}>Enter manually</Button>
            </HStack>
            <Grid templateColumns={{ base: "1fr", md: "2fr 1fr" }} gap="3">
              {stayForm.roomMode === "BED" ? (
                <NativeSelect.Root>
                  <NativeSelect.Field value={stayForm.roomBedId} onChange={(e) => {
                    const bed = lookups.beds.find((b) => String(b.id) === e.target.value);
                    setStayForm({ ...stayForm, roomBedId: e.target.value, dailyRoomRate: bed ? String(bed.dailyRate) : stayForm.dailyRoomRate });
                  }}>
                    <option value="">Select room/bed…</option>
                    {stayBeds.map((b) => <option key={b.id} value={b.id} disabled={Boolean(b.occupiedBy && b.occupiedBy.admissionId !== a.id)}>{bedLabel(b)}</option>)}
                  </NativeSelect.Field>
                </NativeSelect.Root>
              ) : (
                <Input placeholder="Room" value={stayForm.roomLabel} onChange={(e) => setStayForm({ ...stayForm, roomLabel: e.target.value })} />
              )}
              <Input type="number" min="0" placeholder="Room / day" value={stayForm.dailyRoomRate} onChange={(e) => setStayForm({ ...stayForm, dailyRoomRate: e.target.value })} />
            </Grid>
            <Grid templateColumns={{ base: "1fr", md: "2fr 1fr 1fr" }} gap="3">
              <NativeSelect.Root>
                <NativeSelect.Field value={stayForm.doctorId} onChange={(e) => {
                  const doctor = lookups.doctors.find((d) => String(d.id) === e.target.value);
                  setStayForm({ ...stayForm, doctorId: e.target.value, dailyDoctorFee: doctor && e.target.value !== String(a.doctor.id) ? String(doctor.admissionDailyFee) : stayForm.dailyDoctorFee });
                }}>
                  {lookups.doctors.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.specialization}</option>)}
                </NativeSelect.Field>
              </NativeSelect.Root>
              <Input type="number" min="0" placeholder="Doctor / day" value={stayForm.dailyDoctorFee} onChange={(e) => setStayForm({ ...stayForm, dailyDoctorFee: e.target.value })} />
              <Input type="number" min="0" placeholder="Technician / day" value={stayForm.dailyTechnicianFee} onChange={(e) => setStayForm({ ...stayForm, dailyTechnicianFee: e.target.value })} />
            </Grid>
            <Textarea placeholder="Diagnosis" value={stayForm.diagnosis} onChange={(e) => setStayForm({ ...stayForm, diagnosis: e.target.value })} />
            <Textarea placeholder="Notes" value={stayForm.notes} onChange={(e) => setStayForm({ ...stayForm, notes: e.target.value })} />
            <HStack as="label" gap="2" fontSize="sm" cursor="pointer">
              <input type="checkbox" checked={stayForm.applyToday} onChange={(e) => setStayForm({ ...stayForm, applyToday: e.target.checked })} />
              <Text>Also change the current day&apos;s charges (e.g. correcting a wrong rate)</Text>
            </HStack>
          </VStack>
        </Modal>
      )}

      {modal === "cancel" && (
        <Modal
          title="Cancel admission"
          subtitle="Only for an admission made by mistake. Nothing has been paid, issued or operated on it."
          onClose={() => setModal(null)}
          footer={<>
            <Button variant="outline" borderColor="#c8dad5" onClick={() => setModal(null)}>Close</Button>
            <Button bg="#a34258" color="white" loading={busy} onClick={() => void act("CANCEL", { reason: cancelReason })}>Cancel admission</Button>
          </>}
        >
          <Textarea placeholder="Reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
        </Modal>
      )}
    </Box>
  );
}
