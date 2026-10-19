"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Box, Button, Flex, Grid, Heading, HStack, Input, NativeSelect, Table, Text, Textarea, VStack } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBaby, faCheck, faHospitalUser, faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";
import { RefreshButton } from "../refresh-button";
import { DateInput } from "../date-input";
import { TablePagination } from "../table-pagination";
import { bedLabel, bedsFor, formatDateTime, pkr, statusColors, statusLabels, type Bill, type Lookups } from "./shared";

type Patient = { id: number; mrNumber: string; name: string; fatherName?: string; cnic?: string | null };
type AdmissionRow = {
  id: number;
  admissionNumber: string;
  status: string;
  category: string;
  categoryLabel: string;
  admittedAt: string;
  invoicedAt: string | null;
  dischargedAt: string | null;
  patient: { name: string; mrNumber: string };
  doctor: { name: string };
  roomLabel: string;
  bill: Bill;
};

const tabs = [
  { key: "ADMITTED", label: "Admitted" },
  { key: "INVOICED", label: "Invoiced" },
  { key: "DISCHARGED", label: "Discharged" },
  { key: "CANCELLED", label: "Cancelled" },
];

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const emptyNewborn = () => ({ name: "", fatherName: "", gender: "", dateOfBirth: todayIso(), mobile: "", address: "" });
const emptyForm = {
  category: "MEDICAL",
  roomMode: "BED" as "BED" | "MANUAL",
  roomBedId: "",
  roomLabel: "",
  dailyRoomRate: "",
  doctorId: "",
  dailyDoctorFee: "",
  dailyTechnicianFee: "",
  diagnosis: "",
  notes: "",
  attendantName: "",
  attendantMobile: "",
  advanceAmount: "",
  advanceMethod: "CASH",
};

export default function AdmissionsPage() {
  const router = useRouter();
  const [tab, setTab] = useState("ADMITTED");
  const [admissions, setAdmissions] = useState<AdmissionRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [showAdmit, setShowAdmit] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [registerNewborn, setRegisterNewborn] = useState(false);
  const [newborn, setNewborn] = useState(emptyNewborn);
  const [saving, setSaving] = useState(false);

  // Patient search — same behaviour as the OPD desk and OT pages.
  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const patientSearchRef = useRef<HTMLDivElement>(null);

  async function load(status: string) {
    try {
      const res = await fetch(`/api/admissions?status=${status}&lookups=1`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Unable to load admissions.");
        return;
      }
      setAdmissions(data.admissions ?? []);
      setCounts(data.counts ?? {});
      setLookups(data.lookups ?? null);
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function loadInitial() {
      await load("ADMITTED");
    }
    void loadInitial();
  }, []);

  useEffect(() => {
    const q = patientSearch.trim();
    if (!q || (selectedPatient && q === `${selectedPatient.mrNumber} · ${selectedPatient.name}`)) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!cancelled && res.ok) {
          setPatientResults(data.patients ?? []);
          setShowPatientDropdown(true);
        }
      } catch { /* the operator can type again */ }
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

  function changeTab(next: string) {
    setTab(next);
    setPage(1);
    void load(next);
  }

  function openAdmit() {
    setForm({ ...emptyForm, dailyTechnicianFee: String(lookups?.technicianFees.MEDICAL ?? 0) });
    setRegisterNewborn(false);
    setNewborn(emptyNewborn());
    setSelectedPatient(null);
    setPatientSearch("");
    setPatientResults([]);
    setShowAdmit(true);
  }

  // Picking the admission type refills the technician fee and clears a bed that type can't use.
  function changeCategory(category: string) {
    const stillAllowed = bedsFor(lookups, category).some((b) => String(b.id) === form.roomBedId);
    setForm({ ...form, category, dailyTechnicianFee: String(lookups?.technicianFees[category] ?? 0), ...(stillAllowed ? {} : { roomBedId: "", dailyRoomRate: form.roomMode === "BED" ? "" : form.dailyRoomRate }) });
    if (category !== "NICU") setRegisterNewborn(false);
  }

  function chooseBed(id: string) {
    const bed = lookups?.beds.find((b) => String(b.id) === id);
    setForm({ ...form, roomBedId: id, dailyRoomRate: bed ? String(bed.dailyRate) : "" });
  }

  function chooseDoctor(id: string) {
    const doctor = lookups?.doctors.find((d) => String(d.id) === id);
    setForm({ ...form, doctorId: id, dailyDoctorFee: doctor ? String(doctor.admissionDailyFee) : "" });
  }

  async function admit() {
    if (!registerNewborn && !selectedPatient) return toast.error("Select the patient, or register the newborn.");
    if (registerNewborn && (!newborn.name.trim() || !newborn.fatherName.trim() || !newborn.gender)) return toast.error("Enter the baby's name, father's name and gender.");
    if (form.roomMode === "BED" && !form.roomBedId) return toast.error("Select a room/bed, or switch to a manual room.");
    if (form.roomMode === "MANUAL" && (!form.roomLabel.trim() || form.dailyRoomRate === "")) return toast.error("Enter the room and its daily charge.");
    if (!form.doctorId) return toast.error("Select the attending doctor.");
    setSaving(true);
    try {
      const res = await fetch("/api/admissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: form.category,
          ...(registerNewborn ? { newborn } : { patientId: selectedPatient?.id }),
          roomBedId: form.roomMode === "BED" ? Number(form.roomBedId) : null,
          roomLabel: form.roomMode === "MANUAL" ? form.roomLabel : undefined,
          dailyRoomRate: form.dailyRoomRate,
          doctorId: Number(form.doctorId),
          dailyDoctorFee: form.dailyDoctorFee,
          dailyTechnicianFee: form.dailyTechnicianFee,
          diagnosis: form.diagnosis,
          notes: form.notes,
          attendantName: form.attendantName,
          attendantMobile: form.attendantMobile,
          advanceAmount: form.advanceAmount,
          advanceMethod: form.advanceMethod,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Unable to admit the patient.");
        return;
      }
      toast.success(`${data.admission.patient.name} admitted — ${data.admission.admissionNumber}.`);
      setShowAdmit(false);
      router.push(`/admissions/${data.admission.id}`);
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setSaving(false);
    }
  }

  const availableBeds = bedsFor(lookups, form.category);
  const visible = admissions.slice((page - 1) * pageSize, page * pageSize);
  const isActiveTab = tab === "ADMITTED" || tab === "INVOICED";

  return (
    <Box minH="100vh" bg="#eef2f0" color="#0e2420">
      <Flex as="header" className="page-header" position="sticky" top="0" zIndex="40" minH={{ base: "60px", md: "72px" }} py="3" gap="3" flexWrap="wrap" align="center" justify="space-between" px={{ base: "16px", md: "24px", xl: "32px" }} bg="rgba(255,255,255,0.92)" borderBottom="1px solid rgba(14,36,32,0.08)" boxShadow="0 1px 2px rgba(14,36,32,0.04)" style={{ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
        <Heading size={{ base: "md", md: "lg" }} letterSpacing="-0.04em">Admissions</Heading>
        <HStack gap="3">
        <RefreshButton onRefresh={() => load(tab)} />
        <Button
          bg="#11695e"
          color="white"
          fontWeight="700"
          _hover={{ bg: "#0d5850" }}
          onClick={openAdmit}
          disabled={!lookups}
        >
          <FontAwesomeIcon icon={faPlus} />
          &nbsp; Admit patient
        </Button>
        </HStack>
      </Flex>

      <Box as="main" px={{ base: "16px", md: "24px", xl: "32px" }} py={{ base: "20px", md: "28px" }} w="100%" maxW="1680px" mx="auto">
        <HStack gap="2" mb="5" flexWrap="wrap">
          {tabs.map((t) => (
            <Button
              key={t.key}
              size="sm"
              borderRadius="full"
              variant={tab === t.key ? "solid" : "outline"}
              bg={tab === t.key ? "#123d3b" : "white"}
              color={tab === t.key ? "white" : "#123d3b"}
              borderColor="#c8dad5"
              onClick={() => changeTab(t.key)}
            >
              {t.label}
              <Badge ml="2" borderRadius="full" bg={tab === t.key ? "#d6e66c" : "#e9f1ef"} color="#123d3b">{counts[t.key] ?? 0}</Badge>
            </Button>
          ))}
        </HStack>

        <Box bg="white" border="1px solid #e1e9e6" borderRadius="14px" boxShadow="0 2px 12px rgba(14,36,32,0.04)" overflow="hidden">
          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg="#fafcfb">
                  <Table.ColumnHeader>Admission #</Table.ColumnHeader>
                  <Table.ColumnHeader>Patient</Table.ColumnHeader>
                  <Table.ColumnHeader>Type</Table.ColumnHeader>
                  <Table.ColumnHeader>Room / Bed</Table.ColumnHeader>
                  <Table.ColumnHeader>Doctor</Table.ColumnHeader>
                  <Table.ColumnHeader>{isActiveTab ? "Admitted" : "Admitted / Discharged"}</Table.ColumnHeader>
                  <Table.ColumnHeader>Days</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Hospital bill</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Balance</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Store medicine</Table.ColumnHeader>
                  <Table.ColumnHeader>Status</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {visible.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={11}>
                      <Text py="8" textAlign="center" color="#77908b">{loading ? "Loading…" : "No admissions here."}</Text>
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  visible.map((a) => (
                    <Table.Row key={a.id} cursor="pointer" _hover={{ bg: "#f7faf9" }} onClick={() => router.push(`/admissions/${a.id}`)}>
                      <Table.Cell fontWeight="800" color="#126b68">{a.admissionNumber}</Table.Cell>
                      <Table.Cell>
                        <Text fontSize="sm" fontWeight="700">{a.patient.name}</Text>
                        <Text fontSize="xs" color="#77908b">{a.patient.mrNumber}</Text>
                      </Table.Cell>
                      <Table.Cell fontSize="sm">{a.categoryLabel}</Table.Cell>
                      <Table.Cell fontSize="sm">{a.roomLabel}</Table.Cell>
                      <Table.Cell fontSize="sm">{a.doctor.name}</Table.Cell>
                      <Table.Cell fontSize="xs">
                        <Text>{formatDateTime(a.admittedAt)}</Text>
                        {a.dischargedAt && <Text color="#77908b">{formatDateTime(a.dischargedAt)}</Text>}
                      </Table.Cell>
                      <Table.Cell fontSize="sm" fontWeight="700">{a.bill.days}</Table.Cell>
                      <Table.Cell textAlign="right" fontWeight="700">{pkr(a.bill.hospitalTotal)}</Table.Cell>
                      <Table.Cell textAlign="right" fontWeight="800" color={a.bill.hospitalBalance > 0.005 ? "#a34258" : a.bill.hospitalBalance < -0.005 ? "#b26732" : "#22633e"}>
                        {a.bill.hospitalBalance < -0.005 ? `Advance ${pkr(-a.bill.hospitalBalance)}` : pkr(a.bill.hospitalBalance)}
                      </Table.Cell>
                      <Table.Cell textAlign="right" fontSize="sm">
                        {pkr(a.bill.storeTotal)}
                        {a.bill.storeOwed > 0.005 && <Text fontSize="10px" color="#a34258">{pkr(a.bill.storeOwed)} unpaid</Text>}
                      </Table.Cell>
                      <Table.Cell><Badge colorPalette={statusColors[a.status] ?? "gray"} borderRadius="full">{statusLabels[a.status] ?? a.status}</Badge></Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table.Root>
          </Box>
          <TablePagination total={admissions.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </Box>
      </Box>

      {showAdmit && lookups && (
        <Flex position="fixed" inset="0" bg="rgba(15, 30, 28, 0.55)" backdropFilter="blur(3px)" zIndex="100" align="center" justify="center" p="4">
          <Box bg="white" borderRadius="16px" w="full" maxW="780px" boxShadow="0 20px 40px rgba(0,0,0,0.2)" overflow="hidden" maxH="92vh" display="flex" flexDirection="column">
            <Flex justify="space-between" align="center" px="28px" py="18px" bg="#123d3b" color="white" flexShrink="0">
              <HStack gap="3">
                <Flex w="36px" h="36px" bg="#d6e66c" color="#123d3b" borderRadius="9px" align="center" justify="center">
                  <FontAwesomeIcon icon={faHospitalUser} />
                </Flex>
                <Box>
                  <Heading size="sm">Admit patient</Heading>
                  <Text fontSize="xs" color="#a8c5bd">Room, doctor visit and technician fees are charged automatically each day.</Text>
                </Box>
              </HStack>
              <Button variant="ghost" color="white" _hover={{ bg: "#255d58" }} p="2" minW="auto" onClick={() => setShowAdmit(false)}>
                <FontAwesomeIcon icon={faXmark} size="lg" />
              </Button>
            </Flex>

            <Box p={{ base: "20px", md: "28px" }} overflowY="auto">
              <VStack align="stretch" gap="4">
                <Box>
                  <Text fontSize="sm" fontWeight="700" mb="2">Type of admission</Text>
                  <NativeSelect.Root>
                    <NativeSelect.Field value={form.category} onChange={(e) => changeCategory(e.target.value)}>
                      {lookups.categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </NativeSelect.Field>
                  </NativeSelect.Root>
                  {form.category === "CRITICAL" && (
                    <Text fontSize="10px" color="#b26732" mt="1">Use this for critical and suspicious patients: they are kept in a critical-care room.</Text>
                  )}
                </Box>

                {form.category === "NICU" && (
                  <HStack gap="2">
                    <Button size="xs" variant={registerNewborn ? "outline" : "solid"} bg={registerNewborn ? undefined : "#123d3b"} color={registerNewborn ? "#123d3b" : "white"} onClick={() => setRegisterNewborn(false)}>
                      Already registered
                    </Button>
                    <Button size="xs" variant={registerNewborn ? "solid" : "outline"} bg={registerNewborn ? "#123d3b" : undefined} color={registerNewborn ? "white" : "#123d3b"} onClick={() => setRegisterNewborn(true)}>
                      <FontAwesomeIcon icon={faBaby} />
                      &nbsp; Register newborn
                    </Button>
                  </HStack>
                )}

                {registerNewborn ? (
                  <Box border="1px solid #e1e9e6" borderRadius="10px" p="4" bg="#fafcfb">
                    <Text fontSize="xs" fontWeight="800" color="#77908b" textTransform="uppercase" letterSpacing="0.06em" mb="3">New baby patient</Text>
                    <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap="3">
                      <Box>
                        <Text fontSize="sm" fontWeight="700" mb="2">Baby&apos;s name</Text>
                        <Input placeholder="e.g. Baby of Ayesha" value={newborn.name} onChange={(e) => setNewborn({ ...newborn, name: e.target.value })} />
                      </Box>
                      <Box>
                        <Text fontSize="sm" fontWeight="700" mb="2">Father&apos;s name</Text>
                        <Input value={newborn.fatherName} onChange={(e) => setNewborn({ ...newborn, fatherName: e.target.value })} />
                      </Box>
                      <Box>
                        <Text fontSize="sm" fontWeight="700" mb="2">Gender</Text>
                        <NativeSelect.Root>
                          <NativeSelect.Field value={newborn.gender} onChange={(e) => setNewborn({ ...newborn, gender: e.target.value })}>
                            <option value="">Select gender</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                          </NativeSelect.Field>
                        </NativeSelect.Root>
                      </Box>
                      <Box>
                        <Text fontSize="sm" fontWeight="700" mb="2">Date of birth</Text>
                        <DateInput value={newborn.dateOfBirth} max={todayIso()} onChange={(e) => setNewborn({ ...newborn, dateOfBirth: e.target.value })} />
                      </Box>
                      <Box>
                        <Text fontSize="sm" fontWeight="700" mb="2">Parent&apos;s mobile</Text>
                        <Input placeholder="0300-1234567" value={newborn.mobile} onChange={(e) => setNewborn({ ...newborn, mobile: e.target.value })} />
                      </Box>
                      <Box>
                        <Text fontSize="sm" fontWeight="700" mb="2">Address</Text>
                        <Input value={newborn.address} onChange={(e) => setNewborn({ ...newborn, address: e.target.value })} />
                      </Box>
                    </Grid>
                  </Box>
                ) : (
                  <Box position="relative" ref={patientSearchRef}>
                    <Text fontSize="sm" fontWeight="700" mb="2">Patient</Text>
                    <Input
                      placeholder="Search by MR number, name, CNIC or mobile…"
                      value={patientSearch}
                      onChange={(e) => {
                        setPatientSearch(e.target.value);
                        if (selectedPatient) setSelectedPatient(null);
                        if (!e.target.value.trim()) { setPatientResults([]); setShowPatientDropdown(false); }
                      }}
                      onFocus={() => { if (patientResults.length > 0) setShowPatientDropdown(true); }}
                      bg={selectedPatient ? "#f0faf7" : "white"}
                      borderColor={selectedPatient ? "#126b68" : undefined}
                    />
                    {showPatientDropdown && (
                      <Box position="absolute" top="100%" left="0" right="0" mt="1" bg="white" border="1.5px solid #126b68" borderRadius="10px" boxShadow="0 8px 24px rgba(18,59,59,0.15)" zIndex="50" maxH="240px" overflowY="auto">
                        {patientResults.length === 0 ? (
                          <Box px="4" py="3"><Text fontSize="sm" color="#77908b">No patients found. Register the patient on the Patients page first.</Text></Box>
                        ) : (
                          patientResults.map((p) => (
                            <Box key={p.id} px="4" py="2.5" cursor="pointer" _hover={{ bg: "#f0faf7" }} borderBottom="1px solid #f0f4f3"
                              onClick={() => { setSelectedPatient(p); setPatientSearch(`${p.mrNumber} · ${p.name}`); setShowPatientDropdown(false); }}>
                              <Text fontSize="sm" fontWeight="700" color="#123d3b">{p.mrNumber}</Text>
                              <Text fontSize="xs" color="#506c65">{p.name} · S/O {p.fatherName}{p.cnic ? ` · ${p.cnic}` : ""}</Text>
                            </Box>
                          ))
                        )}
                      </Box>
                    )}
                  </Box>
                )}

                <Text fontSize="xs" fontWeight="800" color="#77908b" textTransform="uppercase" letterSpacing="0.06em" pt="1">Accommodation</Text>
                <HStack gap="2">
                  <Button size="xs" variant={form.roomMode === "BED" ? "solid" : "outline"} bg={form.roomMode === "BED" ? "#123d3b" : undefined} color={form.roomMode === "BED" ? "white" : "#123d3b"} onClick={() => setForm({ ...form, roomMode: "BED", dailyRoomRate: "", roomBedId: "" })}>
                    Configured room / bed
                  </Button>
                  <Button size="xs" variant={form.roomMode === "MANUAL" ? "solid" : "outline"} bg={form.roomMode === "MANUAL" ? "#123d3b" : undefined} color={form.roomMode === "MANUAL" ? "white" : "#123d3b"} onClick={() => setForm({ ...form, roomMode: "MANUAL", roomBedId: "", dailyRoomRate: "" })}>
                    Enter manually (custom price)
                  </Button>
                </HStack>
                <Grid templateColumns={{ base: "1fr", md: "2fr 1fr" }} gap="3">
                  {form.roomMode === "BED" ? (
                    <Box>
                      <Text fontSize="sm" fontWeight="700" mb="2">Room / bed</Text>
                      <NativeSelect.Root>
                        <NativeSelect.Field value={form.roomBedId} onChange={(e) => chooseBed(e.target.value)}>
                          <option value="">{availableBeds.length ? "Select a free room/bed…" : "No rooms configured for this type"}</option>
                          {availableBeds.map((b) => <option key={b.id} value={b.id} disabled={Boolean(b.occupiedBy)}>{bedLabel(b)}</option>)}
                        </NativeSelect.Field>
                      </NativeSelect.Root>
                    </Box>
                  ) : (
                    <Box>
                      <Text fontSize="sm" fontWeight="700" mb="2">Room</Text>
                      <Input placeholder="e.g. Critical room 2" value={form.roomLabel} onChange={(e) => setForm({ ...form, roomLabel: e.target.value })} />
                    </Box>
                  )}
                  <Box>
                    <Text fontSize="sm" fontWeight="700" mb="2">Room charge / day (PKR)</Text>
                    <Input type="number" min="0" value={form.dailyRoomRate} onChange={(e) => setForm({ ...form, dailyRoomRate: e.target.value })} />
                  </Box>
                </Grid>

                <Text fontSize="xs" fontWeight="800" color="#77908b" textTransform="uppercase" letterSpacing="0.06em" pt="1">Doctor and daily fees</Text>
                <Grid templateColumns={{ base: "1fr", md: "2fr 1fr 1fr" }} gap="3">
                  <Box>
                    <Text fontSize="sm" fontWeight="700" mb="2">Attending doctor</Text>
                    <NativeSelect.Root>
                      <NativeSelect.Field value={form.doctorId} onChange={(e) => chooseDoctor(e.target.value)}>
                        <option value="">Select doctor…</option>
                        {lookups.doctors.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.specialization}</option>)}
                      </NativeSelect.Field>
                    </NativeSelect.Root>
                  </Box>
                  <Box>
                    <Text fontSize="sm" fontWeight="700" mb="2">Doctor visit / day</Text>
                    <Input type="number" min="0" value={form.dailyDoctorFee} onChange={(e) => setForm({ ...form, dailyDoctorFee: e.target.value })} />
                  </Box>
                  <Box>
                    <Text fontSize="sm" fontWeight="700" mb="2">Technician / day</Text>
                    <Input type="number" min="0" value={form.dailyTechnicianFee} onChange={(e) => setForm({ ...form, dailyTechnicianFee: e.target.value })} />
                  </Box>
                </Grid>
                <Text fontSize="10px" color="#77908b" mt="-2">
                  Filled in from the doctor&apos;s profile and the admission charges set on Rooms &amp; beds. Each day the operator can mark that the doctor did not come, and that day&apos;s doctor fee is dropped.
                </Text>

                <Textarea placeholder="Diagnosis / reason for admission" value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} />
                <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap="3">
                  <Input placeholder="Attendant name (optional)" value={form.attendantName} onChange={(e) => setForm({ ...form, attendantName: e.target.value })} />
                  <Input placeholder="Attendant mobile (optional)" value={form.attendantMobile} onChange={(e) => setForm({ ...form, attendantMobile: e.target.value })} />
                </Grid>

                <Text fontSize="xs" fontWeight="800" color="#77908b" textTransform="uppercase" letterSpacing="0.06em" pt="1">Advance (optional)</Text>
                <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap="3">
                  <Input type="number" min="0" placeholder="Amount received now (PKR)" value={form.advanceAmount} onChange={(e) => setForm({ ...form, advanceAmount: e.target.value })} />
                  <NativeSelect.Root>
                    <NativeSelect.Field value={form.advanceMethod} onChange={(e) => setForm({ ...form, advanceMethod: e.target.value })}>
                      <option value="CASH">Cash</option>
                      <option value="CARD">Card</option>
                      <option value="BANK_TRANSFER">Bank transfer</option>
                      <option value="ONLINE">Online</option>
                    </NativeSelect.Field>
                  </NativeSelect.Root>
                </Grid>

                <Button onClick={admit} loading={saving} bg="#11695e" color="white" _hover={{ bg: "#0d5850" }}>
                  <FontAwesomeIcon icon={faCheck} />
                  &nbsp; Admit
                </Button>
              </VStack>
            </Box>
          </Box>
        </Flex>
      )}
    </Box>
  );
}
