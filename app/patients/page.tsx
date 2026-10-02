"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Field,
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
} from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faEye,
  faFlaskVial,
  faMagnifyingGlass,
  faNotesMedical,
  faPenToSquare,
  faPlus,
  faUserCheck,
  faUserPlus,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";

type Patient = {
  id: number;
  mrNumber: string;
  name: string;
  fatherName: string;
  cnic: string | null;
  mobile: string | null;
  dateOfBirth: string | null;
  gender: string;
  address: string | null;
};

type OpdVisitHistory = {
  id: number;
  opdNumber: string;
  visitDate: string;
  dailyToken: number;
  consultationFee: string;
  doctor: { name: string };
  payments: { status: string; amount: string; method: string }[];
};

type TestReportHistory = {
  id: number;
  receiptNumber: string;
  module: string;
  createdAt: string;
  status: string;
  total: string;
  doctor: { name: string };
  items: { nameAtSale: string; result: string | null; resultUploadedAt: string | null }[];
};

const emptyForm = {
  name: "",
  fatherName: "",
  cnic: "",
  mobile: "",
  dateOfBirth: "",
  gender: "",
  address: "",
};

function formatCnicInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

function formatMobileInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

const money = (value: string | number) => `PKR ${Number(value).toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingPatientId, setEditingPatientId] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [cnicDuplicate, setCnicDuplicate] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [historyPatient, setHistoryPatient] = useState<Patient | null>(null);
  const [historyOpdVisits, setHistoryOpdVisits] = useState<OpdVisitHistory[]>([]);
  const [historyTestReports, setHistoryTestReports] = useState<TestReportHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [pageSize, setPageSize] = useState(10);

  async function handleCnicChange(raw: string) {
    const formatted = formatCnicInput(raw);
    setForm((prev) => ({ ...prev, cnic: formatted }));
    if (formatted.length === 15) {
      try {
        const res = await fetch(`/api/patients?checkCnic=${encodeURIComponent(formatted)}&excludeId=${editingPatientId ?? 0}`);
        const data = await res.json();
        if (data.exists && data.patient) {
          setCnicDuplicate(`This CNIC is already registered to ${data.patient.name} (${data.patient.mrNumber}).`);
        } else {
          setCnicDuplicate(null);
        }
      } catch {
        // ignore
      }
    } else {
      setCnicDuplicate(null);
    }
  }

  async function loadPatients(search = query) {
    setIsLoading(true);
    const response = await fetch(`/api/patients?q=${encodeURIComponent(search)}`);
    const result = await response.json();
    if (response.ok) setPatients(result.patients);
    else toast.error(result.error ?? "Unable to load patients.");
    setIsLoading(false);
    setPage(1);
  }

  useEffect(() => {
    async function loadInitialPatients() {
      const response = await fetch("/api/patients?q=");
      const result = await response.json();
      if (response.ok) setPatients(result.patients);
      else toast.error(result.error ?? "Unable to load patients.");
      setIsLoading(false);
    }
    void loadInitialPatients();
  }, []);

  function openRegisterModal() {
    setForm(emptyForm);
    setEditingPatientId(null);
    setCnicDuplicate(null);
    setShowModal(true);
  }

  function openEditModal(patient: Patient) {
    setForm({
      name: patient.name,
      fatherName: patient.fatherName,
      cnic: patient.cnic ?? "",
      mobile: patient.mobile ?? "",
      dateOfBirth: patient.dateOfBirth ? patient.dateOfBirth.slice(0, 10) : "",
      gender: patient.gender,
      address: patient.address ?? "",
    });
    setEditingPatientId(patient.id);
    setCnicDuplicate(null);
    setShowModal(true);
  }

  async function openHistoryModal(patient: Patient) {
    setHistoryPatient(patient);
    setHistoryOpdVisits([]);
    setHistoryTestReports([]);
    setLoadingHistory(true);
    try {
      const response = await fetch(`/api/patients/${patient.id}`);
      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error ?? "Unable to load patient history.");
        return;
      }
      setHistoryOpdVisits(result.opdVisits ?? []);
      setHistoryTestReports(result.testReports ?? []);
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cnicDuplicate) {
      toast.error(cnicDuplicate);
      return;
    }
    setIsSaving(true);

    try {
      const url = editingPatientId ? `/api/patients/${editingPatientId}` : "/api/patients";
      const method = editingPatientId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error ?? "Unable to save patient details.");
        return;
      }

      if (editingPatientId) {
        toast.success(`Patient details for ${result.patient.name} (${result.patient.mrNumber}) updated successfully.`);
      } else {
        toast.success(`Patient registered successfully with MR number ${result.patient.mrNumber}.`);
      }

      setForm(emptyForm);
      setShowModal(false);
      await loadPatients("");
      setQuery("");
    } catch {
      toast.error("Unable to reach the clinic server. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(patients.length / pageSize));
  const visiblePatients = patients.slice((page - 1) * pageSize, page * pageSize);
  const firstRecord = patients.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRecord = Math.min(page * pageSize, patients.length);

  return (
    <Box minH="100vh" bg="#eef2f0" color="#0e2420">
      {/* Page Header */}
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
          <Link href="/" color="#2da08b">
            <FontAwesomeIcon icon={faArrowLeft} />
          </Link>
          <Box>
            <Heading size="lg" letterSpacing="-0.04em" color="#0e2420">
              Patient Register
            </Heading>
          </Box>
        </HStack>
        <Button
          bg="linear-gradient(135deg, #1a8070 0%, #0f5a52 100%)"
          color="white" borderRadius="9px" fontWeight="700"
          boxShadow="0 3px 12px rgba(26,128,112,0.28)"
          _hover={{ boxShadow: "0 5px 20px rgba(26,128,112,0.42)", transform: "translateY(-1px)" }}
          _active={{ transform: "translateY(0)" }}
          transition="all 0.18s ease"
          onClick={openRegisterModal}
        >
          <FontAwesomeIcon icon={faPlus} />
          &nbsp; Register patient
        </Button>
      </Flex>

      {/* Main Content */}
      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>
        <Flex
          justify="space-between"
          align={{ base: "start", md: "center" }}
          direction={{ base: "column", md: "row" }}
          gap="4"
          mb="24px"
        >
          <Box>
            <Text color="#17252b" fontWeight="700" mt="1">
              {patients.length} patients registered
            </Text>
          </Box>
          <HStack
            bg="white"
            border="1px solid #dbe5e1"
            borderRadius="8px"
            px="3"
            h="44px"
            w={{ base: "full", md: "380px" }}
          >
            <FontAwesomeIcon icon={faMagnifyingGlass} color="#77908b" />
            <Input
              variant="flushed"
              placeholder="Search by MR, CNIC, name or phone"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                void loadPatients(event.target.value);
              }}
            />
          </HStack>
        </Flex>



        {/* Patient Register Table */}
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
          <Box px="24px" py="20px" borderBottom="1px solid #edf2f0">
            <Heading size="sm">Patient Records</Heading>
          </Box>
          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg="#fafcfb">
                  <Table.ColumnHeader>MR Number</Table.ColumnHeader>
                  <Table.ColumnHeader>Patient Name</Table.ColumnHeader>
                  <Table.ColumnHeader>Father Name</Table.ColumnHeader>
                  <Table.ColumnHeader>Contact</Table.ColumnHeader>
                  <Table.ColumnHeader>CNIC</Table.ColumnHeader>
                  <Table.ColumnHeader>Gender</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Actions</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {isLoading ? (
                  <Table.Row>
                    <Table.Cell colSpan={7}>
                      <Text py="8" textAlign="center" color="#77908b">
                        Loading patient register...
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                ) : patients.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={7}>
                      <Text py="8" textAlign="center" color="#77908b">
                        No patients match this search query.
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  visiblePatients.map((patient) => (
                    <Table.Row key={patient.id} _hover={{ bg: "#f9fbfa" }}>
                      <Table.Cell>
                        <Text fontSize="sm" fontWeight="800" color="#126b68">
                          {patient.mrNumber}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text fontSize="sm" fontWeight="700">
                          {patient.name}
                        </Text>
                      </Table.Cell>
                      <Table.Cell fontSize="sm" color="#506c65">
                        {patient.fatherName}
                      </Table.Cell>
                      <Table.Cell fontSize="sm">{patient.mobile || "—"}</Table.Cell>
                      <Table.Cell fontSize="sm" color="#506c65">
                        {patient.cnic ?? "Not provided"}
                      </Table.Cell>
                      <Table.Cell fontSize="sm">{patient.gender}</Table.Cell>
                      <Table.Cell textAlign="right">
                        <HStack justify="flex-end" gap="2">
                          <Button
                            size="xs"
                            variant="outline"
                            borderColor="#c8dad5"
                            color="#126b68"
                            _hover={{ bg: "#eef6f4" }}
                            onClick={() => void openHistoryModal(patient)}
                          >
                            <FontAwesomeIcon icon={faEye} />
                            &nbsp;View
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            borderColor="#c8dad5"
                            color="#126b68"
                            _hover={{ bg: "#eef6f4" }}
                            onClick={() => openEditModal(patient)}
                          >
                            <FontAwesomeIcon icon={faPenToSquare} />
                            &nbsp;Edit
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
              {patients.length ? `Showing ${firstRecord}-${lastRecord} of ${patients.length}` : "No records"}
            </Text>
            <HStack gap="2" flexWrap="wrap">
              <Text fontSize="sm" color="#607d76">Rows per page</Text>
              <NativeSelect.Root width="90px" size="sm">
                <NativeSelect.Field
                  value={String(pageSize)}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
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
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              {Array.from({ length: pageCount }, (_, index) => index + 1).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={p === page ? "solid" : "outline"}
                  bg={p === page ? "#123d3b" : undefined}
                  color={p === page ? "white" : undefined}
                  onClick={() => setPage(p)}
                >
                  {p}
                </Button>
              ))}
              <Button
                size="sm"
                variant="outline"
                disabled={page === pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              >
                Next
              </Button>
            </HStack>
          </Flex>
        </Box>
      </Box>

      {/* Patient Register / Edit Modal */}
      {showModal && (
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
            maxW="680px"
            boxShadow="0 20px 40px rgba(0,0,0,0.2)"
            overflow="hidden"
          >
            <Flex justify="space-between" align="center" px="28px" py="20px" bg="#123d3b" color="white">
              <HStack gap="3">
                <Flex w="36px" h="36px" bg="#d6e66c" color="#123d3b" borderRadius="10px" align="center" justify="center">
                  <FontAwesomeIcon icon={editingPatientId ? faUserCheck : faUserPlus} />
                </Flex>
                <Box>
                  <Heading size="sm">
                    {editingPatientId ? "Edit Patient Details" : "New Patient Registration"}
                  </Heading>
                  <Text fontSize="xs" color="#a8c5bd">
                    {editingPatientId
                      ? "Modifications will be logged in the permanent audit trail."
                      : "A permanent MR number will be auto-generated."}
                  </Text>
                </Box>
              </HStack>
              <Button
                variant="ghost"
                color="white"
                _hover={{ bg: "#255d58" }}
                p="2"
                minW="auto"
                onClick={() => setShowModal(false)}
              >
                <FontAwesomeIcon icon={faXmark} size="lg" />
              </Button>
            </Flex>

            <form onSubmit={handleSubmit}>
              <Box p="28px" maxH="75vh" overflowY="auto">


                <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap="5">
                  <Field.Root required>
                    <Field.Label fontWeight="700">Patient Name</Field.Label>
                    <Input
                      placeholder="e.g. Muhammad Ali"
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label fontWeight="700">Father / Guardian Name</Field.Label>
                    <Input
                      placeholder="e.g. Tariq Mahmood"
                      value={form.fatherName}
                      onChange={(event) => setForm({ ...form, fatherName: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root invalid={Boolean(cnicDuplicate)}>
                    <Field.Label fontWeight="700">CNIC Number</Field.Label>
                    <Input
                      placeholder="16201-9398413-3"
                      value={form.cnic}
                      borderColor={cnicDuplicate ? "#e11d48" : undefined}
                      onChange={(event) => void handleCnicChange(event.target.value)}
                    />
                    {cnicDuplicate ? (
                      <Text fontSize="xs" color="#e11d48" fontWeight="600" mt="1">
                        ⚠️ {cnicDuplicate}
                      </Text>
                    ) : (
                      <Text fontSize="10px" color="#77908b" mt="1">Format: 16201-9398413-3 (Must be unique)</Text>
                    )}
                  </Field.Root>

                  <Field.Root>
                    <Field.Label fontWeight="700">Mobile Number (Optional)</Field.Label>
                    <Input
                      placeholder="0300-5676121 (Optional)"
                      value={form.mobile}
                      onChange={(event) => setForm({ ...form, mobile: formatMobileInput(event.target.value) })}
                    />
                    <Text fontSize="10px" color="#77908b" mt="1">Optional — Pakistani mobile (e.g. 0300-5676121)</Text>
                  </Field.Root>

                  <Field.Root>
                    <Field.Label fontWeight="700">Date of Birth</Field.Label>
                    <Input
                      type="date"
                      value={form.dateOfBirth}
                      onChange={(event) => setForm({ ...form, dateOfBirth: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label fontWeight="700">Gender</Field.Label>
                    <NativeSelect.Root>
                      <NativeSelect.Field
                        value={form.gender}
                        onChange={(event) => setForm({ ...form, gender: event.target.value })}
                      >
                        <option value="">Select gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </NativeSelect.Field>
                    </NativeSelect.Root>
                  </Field.Root>

                  <Field.Root gridColumn={{ md: "span 2" }}>
                    <Field.Label fontWeight="700">Residential Address</Field.Label>
                    <Textarea
                      placeholder="Full residential address"
                      value={form.address}
                      onChange={(event) => setForm({ ...form, address: event.target.value })}
                    />
                  </Field.Root>
                </Grid>
              </Box>

              <Flex justify="flex-end" gap="3" px="28px" py="18px" bg="#f7faf9" borderTop="1px solid #e2e9e6">
                <Button variant="outline" borderColor="#c8dad5" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={isSaving} bg="#123d3b" color="white" _hover={{ bg: "#255d58" }}>
                  {editingPatientId ? "Save Changes" : "Register Patient"}
                </Button>
              </Flex>
            </form>
          </Box>
        </Flex>
      )}

      {/* Patient History Modal */}
      {historyPatient && (
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
            maxW="820px"
            maxH="85vh"
            boxShadow="0 20px 40px rgba(0,0,0,0.2)"
            overflow="hidden"
            display="flex"
            flexDirection="column"
          >
            <Flex justify="space-between" align="center" px="28px" py="20px" bg="#123d3b" color="white" flexShrink="0">
              <HStack gap="3">
                <Flex w="36px" h="36px" bg="#d6e66c" color="#123d3b" borderRadius="10px" align="center" justify="center">
                  <FontAwesomeIcon icon={faNotesMedical} />
                </Flex>
                <Box>
                  <Heading size="sm">{historyPatient.name}</Heading>
                  <Text fontSize="xs" color="#a8c5bd">MR #: {historyPatient.mrNumber} · Patient History</Text>
                </Box>
              </HStack>
              <Button variant="ghost" color="white" _hover={{ bg: "#255d58" }} p="2" minW="auto" onClick={() => setHistoryPatient(null)}>
                <FontAwesomeIcon icon={faXmark} size="lg" />
              </Button>
            </Flex>

            <Box p="28px" overflowY="auto">
              {loadingHistory ? (
                <Text py="10" textAlign="center" color="#77908b">Loading history...</Text>
              ) : (
                <>
                  <HStack gap="3" mb="3">
                    <FontAwesomeIcon icon={faNotesMedical} color="#126b68" />
                    <Heading size="sm">OPD Visits</Heading>
                  </HStack>
                  <Box border="1px solid #e1e9e6" borderRadius="10px" overflow="hidden" mb="8">
                    <Table.Root size="sm">
                      <Table.Header>
                        <Table.Row bg="#fafcfb">
                          <Table.ColumnHeader>OPD Number</Table.ColumnHeader>
                          <Table.ColumnHeader>Date</Table.ColumnHeader>
                          <Table.ColumnHeader>Doctor</Table.ColumnHeader>
                          <Table.ColumnHeader>Fee</Table.ColumnHeader>
                          <Table.ColumnHeader>Payment</Table.ColumnHeader>
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {historyOpdVisits.length === 0 ? (
                          <Table.Row>
                            <Table.Cell colSpan={5}>
                              <Text py="6" textAlign="center" color="#77908b">No OPD visits on record.</Text>
                            </Table.Cell>
                          </Table.Row>
                        ) : (
                          historyOpdVisits.map((visit) => (
                            <Table.Row key={visit.id} _hover={{ bg: "#f9fbfa" }}>
                              <Table.Cell fontWeight="700" fontSize="sm" color="#126b68">{visit.opdNumber}</Table.Cell>
                              <Table.Cell fontSize="sm">{visit.visitDate.slice(0, 10)}</Table.Cell>
                              <Table.Cell fontSize="sm">{visit.doctor.name}</Table.Cell>
                              <Table.Cell fontWeight="700" fontSize="sm">{money(visit.consultationFee)}</Table.Cell>
                              <Table.Cell>
                                {visit.payments.length === 0 ? (
                                  <Badge colorPalette="gray" borderRadius="full">No payment</Badge>
                                ) : (
                                  visit.payments.map((payment, index) => (
                                    <Badge key={index} colorPalette={payment.status === "PAID" ? "green" : "red"} borderRadius="full" mr="1">
                                      {payment.status.replaceAll("_", " ")}
                                    </Badge>
                                  ))
                                )}
                              </Table.Cell>
                            </Table.Row>
                          ))
                        )}
                      </Table.Body>
                    </Table.Root>
                  </Box>

                  <HStack gap="3" mb="3">
                    <FontAwesomeIcon icon={faFlaskVial} color="#126b68" />
                    <Heading size="sm">Test / Diagnostic Reports</Heading>
                  </HStack>
                  <Box border="1px solid #e1e9e6" borderRadius="10px" overflow="hidden">
                    <Table.Root size="sm">
                      <Table.Header>
                        <Table.Row bg="#fafcfb">
                          <Table.ColumnHeader>Receipt Number</Table.ColumnHeader>
                          <Table.ColumnHeader>Module</Table.ColumnHeader>
                          <Table.ColumnHeader>Date</Table.ColumnHeader>
                          <Table.ColumnHeader>Doctor</Table.ColumnHeader>
                          <Table.ColumnHeader>Amount</Table.ColumnHeader>
                          <Table.ColumnHeader>Result</Table.ColumnHeader>
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {historyTestReports.length === 0 ? (
                          <Table.Row>
                            <Table.Cell colSpan={6}>
                              <Text py="6" textAlign="center" color="#77908b">No test reports on record.</Text>
                            </Table.Cell>
                          </Table.Row>
                        ) : (
                          historyTestReports.map((report) => {
                            const resultReady = report.items.some((item) => item.result || item.resultUploadedAt);
                            return (
                              <Table.Row key={report.id} _hover={{ bg: "#f9fbfa" }}>
                                <Table.Cell fontWeight="700" fontSize="sm" color="#126b68">{report.receiptNumber}</Table.Cell>
                                <Table.Cell fontSize="sm">{report.module.replaceAll("_", " ")}</Table.Cell>
                                <Table.Cell fontSize="sm">{report.createdAt.slice(0, 10)}</Table.Cell>
                                <Table.Cell fontSize="sm">{report.doctor.name}</Table.Cell>
                                <Table.Cell fontWeight="700" fontSize="sm">{money(report.total)}</Table.Cell>
                                <Table.Cell>
                                  <Badge colorPalette={resultReady ? "green" : "orange"} borderRadius="full">
                                    {resultReady ? "Ready" : "Pending"}
                                  </Badge>
                                </Table.Cell>
                              </Table.Row>
                            );
                          })
                        )}
                      </Table.Body>
                    </Table.Root>
                  </Box>
                </>
              )}
            </Box>

            <Flex justify="flex-end" gap="3" px="28px" py="18px" bg="#f7faf9" borderTop="1px solid #e2e9e6" flexShrink="0">
              <Button variant="outline" borderColor="#c8dad5" onClick={() => setHistoryPatient(null)}>
                Close
              </Button>
            </Flex>
          </Box>
        </Flex>
      )}

    </Box>
  );
}
