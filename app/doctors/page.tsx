"use client";

import { FormEvent, useEffect, useState } from "react";
import { Badge, Box, Button, Field, Flex, Grid, Heading, HStack, Input, Link, NativeSelect, Table, Text, Textarea } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faPen, faPlus, faUserDoctor, faXmark } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";

type Doctor = {
  id: number;
  name: string;
  specialization: string;
  nameUrdu: string | null;
  specializationUrdu: string | null;
  qualifications: string | null;
  qualificationsUrdu: string | null;
  availability: string | null;
  availabilityDays: number[];
  availabilityFrom: string | null;
  availabilityTo: string | null;
  consultationFee: string;
  hospitalSplitType: string;
  hospitalSplitValue: string;
  labSharePercent: string;
  xraySharePercent: string;
  ultrasoundSharePercent: string;
  ecgSharePercent: string;
  ecoSharePercent: string;
};

type DoctorForm = {
  name: string;
  specialization: string;
  nameUrdu: string;
  specializationUrdu: string;
  qualifications: string;
  qualificationsUrdu: string;
  availabilityDays: number[];
  availabilityFrom: string;
  availabilityTo: string;
  consultationFee: string;
  hospitalSplitType: string;
  hospitalSplitValue: string;
  labSharePercent: string;
  xraySharePercent: string;
  ultrasoundSharePercent: string;
  ecgSharePercent: string;
  ecoSharePercent: string;
};

const emptyForm: DoctorForm = {
  name: "",
  specialization: "",
  nameUrdu: "",
  specializationUrdu: "",
  qualifications: "",
  qualificationsUrdu: "",
  availabilityDays: [],
  availabilityFrom: "09:00",
  availabilityTo: "17:00",
  consultationFee: "",
  hospitalSplitType: "PERCENTAGE",
  hospitalSplitValue: "",
  labSharePercent: "",
  xraySharePercent: "",
  ultrasoundSharePercent: "",
  ecgSharePercent: "",
  ecoSharePercent: "",
};

export default function DoctorsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  async function loadDoctors() {
    const response = await fetch("/api/doctors");
    const result = await response.json().catch(() => ({ error: "Unable to read the doctors response." }));
    if (response.ok) setDoctors(result.doctors);
    else toast.error(result.error ?? "Unable to load doctors.");
  }

  useEffect(() => {
    async function loadInitialDoctors() {
      const response = await fetch("/api/doctors");
      const result = await response.json().catch(() => ({ error: "Unable to read the doctors response." }));
      if (response.ok) setDoctors(result.doctors);
      else toast.error(result.error ?? "Unable to load doctors.");
    }
    void loadInitialDoctors();
  }, []);

  function openAddModal() {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEditModal(doc: Doctor) {
    setEditingId(doc.id);
    setForm({
      name: doc.name,
      specialization: doc.specialization,
      nameUrdu: doc.nameUrdu ?? "",
      specializationUrdu: doc.specializationUrdu ?? "",
      qualifications: doc.qualifications ?? "",
      qualificationsUrdu: doc.qualificationsUrdu ?? "",
      availabilityDays: doc.availabilityDays ?? [],
      availabilityFrom: doc.availabilityFrom ?? "09:00",
      availabilityTo: doc.availabilityTo ?? "17:00",
      consultationFee: doc.consultationFee,
      hospitalSplitType: doc.hospitalSplitType,
      hospitalSplitValue: doc.hospitalSplitValue,
      labSharePercent: doc.labSharePercent,
      xraySharePercent: doc.xraySharePercent,
      ultrasoundSharePercent: doc.ultrasoundSharePercent,
      ecgSharePercent: doc.ecgSharePercent,
      ecoSharePercent: doc.ecoSharePercent,
    });
    setShowModal(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const url = editingId ? `/api/doctors/${editingId}` : "/api/doctors";
      const method = editingId ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error ?? "Unable to save doctor.");
        return;
      }
      toast.success(editingId ? `Details for ${result.doctor.name} updated successfully.` : `${result.doctor.name} added to the doctor register.`);
      setForm(emptyForm);
      setEditingId(null);
      setShowModal(false);
      await loadDoctors();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setSaving(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(doctors.length / pageSize));
  const visibleDoctors = doctors.slice((page - 1) * pageSize, page * pageSize);
  const firstRecord = doctors.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRecord = Math.min(page * pageSize, doctors.length);

  return (
    <Box minH="100vh" bg="#eef2f0" color="#0e2420">
      {/* Sticky Top Header */}
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
              Doctors Management
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
          onClick={openAddModal}
        >
          <FontAwesomeIcon icon={faPlus} />
          &nbsp; Add Doctor
        </Button>
      </Flex>

      {/* Main Content */}
      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>


        {/* Doctor Register Table */}
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="14px" boxShadow="0 2px 12px rgba(14,36,32,0.04)" overflow="hidden">
          <Box px="24px" py="20px" borderBottom="1px solid #edf2f0">
            <HStack justify="space-between">
              <HStack gap="3">
                <Flex w="34px" h="34px" bg="#e9f1ef" color="#126b68" borderRadius="9px" align="center" justify="center">
                  <FontAwesomeIcon icon={faUserDoctor} />
                </Flex>
                <Heading size="sm">Doctor Register</Heading>
              </HStack>
            </HStack>
          </Box>
          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg="#fafcfb">
                  <Table.ColumnHeader>Doctor Name</Table.ColumnHeader>
                  <Table.ColumnHeader>Availability Schedule</Table.ColumnHeader>
                  <Table.ColumnHeader>Consultation Fee</Table.ColumnHeader>
                  <Table.ColumnHeader>Hospital Split Rule</Table.ColumnHeader>
                  <Table.ColumnHeader>Status</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Actions</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {doctors.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={6}>
                      <Text py="8" textAlign="center" color="#77908b">
                        No doctors registered yet.
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  visibleDoctors.map((doctor) => (
                    <Table.Row key={doctor.id} _hover={{ bg: "#f9fbfa" }}>
                      <Table.Cell>
                        <Text fontWeight="700" fontSize="sm">
                          {doctor.name}
                        </Text>
                        <Text color="#77908b" fontSize="xs">
                          {doctor.specialization}
                        </Text>
                      </Table.Cell>
                      <Table.Cell fontSize="sm">
                        {doctor.availabilityDays?.length ? `${doctor.availabilityDays.map((day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]).join(", ")} · ${doctor.availabilityFrom} - ${doctor.availabilityTo}` : doctor.availability ?? "Not configured"}
                      </Table.Cell>
                      <Table.Cell fontWeight="800" color="#126b68">PKR {doctor.consultationFee}</Table.Cell>
                      <Table.Cell fontSize="sm">
                        <Badge colorPalette="purple" borderRadius="full">
                          {doctor.hospitalSplitValue}
                          {doctor.hospitalSplitType === "PERCENTAGE" ? "% Retained" : " PKR Retained"}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge colorPalette="green" borderRadius="full">
                          Active
                        </Badge>
                      </Table.Cell>
                      <Table.Cell textAlign="right">
                        <Button
                          size="xs"
                          variant="outline"
                          borderColor="#c8dad5"
                          color="#126b68"
                          _hover={{ bg: "#eef6f4" }}
                          onClick={() => openEditModal(doctor)}
                        >
                          <FontAwesomeIcon icon={faPen} />
                          &nbsp; Edit
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
              {doctors.length ? `Showing ${firstRecord}-${lastRecord} of ${doctors.length}` : "No records"}
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
              <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
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
              <Button size="sm" variant="outline" disabled={page === pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
                Next
              </Button>
            </HStack>
          </Flex>
        </Box>
      </Box>

      {/* Add / Edit Doctor Modal Dialog */}
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
                  <FontAwesomeIcon icon={editingId ? faPen : faUserDoctor} />
                </Flex>
                <Box>
                  <Heading size="sm">{editingId ? "Edit Doctor Record" : "Register New Doctor"}</Heading>
                  <Text fontSize="xs" color="#a8c5bd">
                    Fee and split values apply to new OPD visits and payouts.
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

            <form onSubmit={submit}>
              <Box p="28px" maxH="75vh" overflowY="auto">


                <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap="5">
                  <Field.Root required>
                    <Field.Label fontWeight="700">Doctor Name</Field.Label>
                    <Input
                      placeholder="e.g. Dr. Sarah Khan"
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label fontWeight="700">Specialization</Field.Label>
                    <Input
                      placeholder="e.g. Cardiologist"
                      value={form.specialization}
                      onChange={(event) => setForm({ ...form, specialization: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root>
                    <Field.Label fontWeight="700">Doctor Name (Urdu)</Field.Label>
                    <Input
                      dir="rtl"
                      fontFamily="var(--font-urdu)"
                      placeholder="مثلاً ڈاکٹر سارہ خان"
                      value={form.nameUrdu}
                      onChange={(event) => setForm({ ...form, nameUrdu: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root>
                    <Field.Label fontWeight="700">Specialization (Urdu)</Field.Label>
                    <Input
                      dir="rtl"
                      fontFamily="var(--font-urdu)"
                      placeholder="مثلاً امراض قلب کے ماہر"
                      value={form.specializationUrdu}
                      onChange={(event) => setForm({ ...form, specializationUrdu: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root>
                    <Field.Label fontWeight="700">Qualifications (English)</Field.Label>
                    <Textarea
                      placeholder={"e.g. MBBS, FCPS (Cardiology)\nEx-Registrar, PIMS Islamabad"}
                      value={form.qualifications}
                      onChange={(event) => setForm({ ...form, qualifications: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root>
                    <Field.Label fontWeight="700">Qualifications (Urdu)</Field.Label>
                    <Textarea
                      dir="rtl"
                      fontFamily="var(--font-urdu)"
                      placeholder="مثلاً ایم بی بی ایس، ایف سی پی ایس (امراض قلب)"
                      value={form.qualificationsUrdu}
                      onChange={(event) => setForm({ ...form, qualificationsUrdu: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root required gridColumn={{ md: "span 2" }}>
                    <Field.Label fontWeight="700">Availability Days</Field.Label>
                    <Grid templateColumns={{ base: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" }} gap="2">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => (
                        <Flex
                          as="label"
                          key={day}
                          align="center"
                          gap="2"
                          border="1px solid #d8e5e1"
                          borderRadius="8px"
                          p="2"
                        >
                          <input
                            type="checkbox"
                            checked={form.availabilityDays.includes(index)}
                            onChange={(event) => setForm((current) => ({ ...current, availabilityDays: event.target.checked ? [...current.availabilityDays, index] : current.availabilityDays.filter((value) => value !== index) }))}
                          />
                          <Text fontSize="sm">{day}</Text>
                        </Flex>
                      ))}
                    </Grid>
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label fontWeight="700">Available From</Field.Label>
                    <Input type="time" value={form.availabilityFrom} onChange={(event) => setForm({ ...form, availabilityFrom: event.target.value })} />
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label fontWeight="700">Available To</Field.Label>
                    <Input type="time" value={form.availabilityTo} onChange={(event) => setForm({ ...form, availabilityTo: event.target.value })} />
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label fontWeight="700">Consultation Fee (PKR)</Field.Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="1500"
                      value={form.consultationFee}
                      onChange={(event) => setForm({ ...form, consultationFee: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label fontWeight="700">Hospital Split Type</Field.Label>
                    <NativeSelect.Root>
                      <NativeSelect.Field
                        value={form.hospitalSplitType}
                        onChange={(event) => setForm({ ...form, hospitalSplitType: event.target.value })}
                      >
                        <option value="PERCENTAGE">Percentage retained</option>
                        <option value="FIXED">Fixed amount retained</option>
                      </NativeSelect.Field>
                    </NativeSelect.Root>
                  </Field.Root>

                  <Field.Root required gridColumn={{ md: "span 2" }}>
                    <Field.Label fontWeight="700">Hospital Split Value</Field.Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={form.hospitalSplitType === "PERCENTAGE" ? "20 (% retained by hospital)" : "300 (PKR retained per visit)"}
                      value={form.hospitalSplitValue}
                      onChange={(event) => setForm({ ...form, hospitalSplitValue: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root gridColumn={{ md: "span 2" }}>
                    <Field.Label fontWeight="700">Diagnostic Referral Shares</Field.Label>
                    <Text fontSize="xs" color="#77908b" mt="-1" mb="1">
                      Percentage of each diagnostic receipt paid out to this doctor when they refer a patient for that test. Calculated automatically — no need to select it at billing time.
                    </Text>
                  </Field.Root>

                  <Field.Root>
                    <Field.Label fontWeight="700">Lab Share (%)</Field.Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="0"
                      value={form.labSharePercent}
                      onChange={(event) => setForm({ ...form, labSharePercent: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root>
                    <Field.Label fontWeight="700">X-Ray Share (%)</Field.Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="0"
                      value={form.xraySharePercent}
                      onChange={(event) => setForm({ ...form, xraySharePercent: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root>
                    <Field.Label fontWeight="700">Ultrasound Share (%)</Field.Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="0"
                      value={form.ultrasoundSharePercent}
                      onChange={(event) => setForm({ ...form, ultrasoundSharePercent: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root>
                    <Field.Label fontWeight="700">ECG Share (%)</Field.Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="0"
                      value={form.ecgSharePercent}
                      onChange={(event) => setForm({ ...form, ecgSharePercent: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root>
                    <Field.Label fontWeight="700">ECO Share (%)</Field.Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="0"
                      value={form.ecoSharePercent}
                      onChange={(event) => setForm({ ...form, ecoSharePercent: event.target.value })}
                    />
                  </Field.Root>
                </Grid>
              </Box>

              <Flex justify="flex-end" gap="3" px="28px" py="18px" bg="#f7faf9" borderTop="1px solid #e2e9e6">
                <Button variant="outline" borderColor="#c8dad5" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={saving} bg="#123d3b" color="white" _hover={{ bg: "#255d58" }}>
                  {editingId ? "Save Changes" : "Save Doctor Record"}
                </Button>
              </Flex>
            </form>
          </Box>
        </Flex>
      )}
    </Box>
  );
}
