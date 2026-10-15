"use client";

import { useEffect, useState } from "react";
import { Badge, Box, Button, Flex, Heading, Link, NativeSelect, Table, Text } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBedPulse, faCashRegister, faHandHoldingDollar, faPills, faXmark } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";
import { RefreshButton } from "../../refresh-button";
import { medicinePurposeLabels } from "../../../lib/admission";

type Summary = { issued: number; owed: number; byPurpose: Record<string, number>; saleCount: number };
// One patient bill the store issues medicine to: an admission, or an OT case outside any admission.
type PatientBill = {
  kind: "ADMISSION" | "OT";
  id: number;
  number: string;
  status: string;
  canIssue: boolean;
  readyToSettle: boolean;
  category: string;
  admittedAt: string;
  roomLabel: string;
  patient: { name: string; mrNumber: string };
  medicines: Summary;
  sales: { id: number; saleNumber: string; createdAt: string; purpose: string; creditStatus: string | null; total: number; owed: number; items: string }[];
};

const pkr = (value: number) => `PKR ${value.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
const purposeLine = (byPurpose: Record<string, number>) =>
  Object.entries(byPurpose).filter(([, v]) => v > 0).map(([k, v]) => `${medicinePurposeLabels[k] ?? k}: ${pkr(v)}`).join(" · ") || "—";
const issueLink = (b: PatientBill) => `/medical-store/sell?${b.kind === "ADMISSION" ? "admissionId" : "otCaseId"}=${b.id}`;

export default function InPatientsPage() {
  const [bills, setBills] = useState<PatientBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState<PatientBill | null>(null);
  const [method, setMethod] = useState("CASH");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/medical-store/inpatients");
      const data = await res.json();
      if (res.ok) setBills(data.bills ?? []);
      else toast.error(data.error ?? "Unable to load in-patients.");
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function loadInitial() {
      await load();
    }
    void loadInitial();
  }, []);

  async function settle() {
    if (!settling) return;
    setSaving(true);
    try {
      const res = await fetch("/api/medical-store/inpatients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [settling.kind === "ADMISSION" ? "admissionId" : "otCaseId"]: settling.id, method }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Unable to mark the medicine bill paid.");
        return;
      }
      toast.success(`${data.settled.number}: ${pkr(data.settled.amount)} received for medicines. The patient can now be discharged.`);
      setSettling(null);
      await load();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setSaving(false);
    }
  }

  const current = bills.filter((b) => b.canIssue);
  const owing = bills.filter((b) => b.medicines.owed > 0.005);

  return (
    <Box minH="100vh" bg="#f5f7f8" color="#17252b">
      <Flex as="header" h="78px" bg="white" borderBottom="1px solid #e2e9e6" align="center" justify="space-between" px={{ base: "20px", md: "42px" }}>
        <Heading size="lg" letterSpacing="-0.04em">In-patients</Heading>
        <RefreshButton onRefresh={load} />
      </Flex>

      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden" mb="8">
          <Flex p="5" borderBottom="1px solid #edf2f0" align="center" gap="3">
            <Flex w="34px" h="34px" bg="#e9f1ef" color="#126b68" borderRadius="9px" align="center" justify="center"><FontAwesomeIcon icon={faBedPulse} /></Flex>
            <Box>
              <Heading size="sm">Admitted and OT patients</Heading>
              <Text fontSize="xs" color="#607d76">Medicine issued here goes on the patient&apos;s bill (no payment now). It is paid to the store when the patient is discharged.</Text>
            </Box>
          </Flex>
          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg="#fafcfb">
                  <Table.ColumnHeader>Bill #</Table.ColumnHeader>
                  <Table.ColumnHeader>Patient</Table.ColumnHeader>
                  <Table.ColumnHeader>Room / type</Table.ColumnHeader>
                  <Table.ColumnHeader>Since</Table.ColumnHeader>
                  <Table.ColumnHeader>Issued so far</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Action</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {current.length === 0 ? (
                  <Table.Row><Table.Cell colSpan={6}><Text py="8" textAlign="center" color="#77908b">{loading ? "Loading…" : "No admitted or OT patients right now."}</Text></Table.Cell></Table.Row>
                ) : current.map((b) => (
                  <Table.Row key={`${b.kind}-${b.id}`} _hover={{ bg: "#f9fbfa" }}>
                    <Table.Cell>
                      <Text fontWeight="800" color="#126b68">{b.number}</Text>
                      <Badge borderRadius="full" size="sm" colorPalette={b.kind === "OT" ? "purple" : "blue"}>{b.kind === "OT" ? "OT" : "Admission"}</Badge>
                    </Table.Cell>
                    <Table.Cell><Text fontSize="sm" fontWeight="700">{b.patient.name}</Text><Text fontSize="xs" color="#77908b">{b.patient.mrNumber}</Text></Table.Cell>
                    <Table.Cell fontSize="sm">{b.roomLabel}<Text fontSize="xs" color="#77908b">{b.category}</Text></Table.Cell>
                    <Table.Cell fontSize="xs">{new Date(b.admittedAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</Table.Cell>
                    <Table.Cell fontSize="sm">{pkr(b.medicines.issued)}<Text fontSize="10px" color="#77908b">{purposeLine(b.medicines.byPurpose)}</Text></Table.Cell>
                    <Table.Cell textAlign="right">
                      <Link href={issueLink(b)} _hover={{ textDecoration: "none" }}>
                        <Button size="xs" bg="#123d3b" color="white" _hover={{ bg: "#255d58" }}>
                          <FontAwesomeIcon icon={faPills} />&nbsp; Issue medicine
                        </Button>
                      </Link>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Box>
        </Box>

        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
          <Flex p="5" borderBottom="1px solid #edf2f0" align="center" gap="3">
            <Flex w="34px" h="34px" bg="#fdf1e7" color="#b26732" borderRadius="9px" align="center" justify="center"><FontAwesomeIcon icon={faHandHoldingDollar} /></Flex>
            <Box>
              <Heading size="sm">Waiting for payment</Heading>
              <Text fontSize="xs" color="#607d76">At discharge the counter pays the medicine bill to the store. Mark it paid here; the operator cannot discharge the patient until then.</Text>
            </Box>
          </Flex>
          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg="#fafcfb">
                  <Table.ColumnHeader>Bill #</Table.ColumnHeader>
                  <Table.ColumnHeader>Patient</Table.ColumnHeader>
                  <Table.ColumnHeader>Stage</Table.ColumnHeader>
                  <Table.ColumnHeader>Medicines</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Owed</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Action</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {owing.length === 0 ? (
                  <Table.Row><Table.Cell colSpan={6}><Text py="8" textAlign="center" color="#77908b">{loading ? "Loading…" : "Nothing is owed to the store."}</Text></Table.Cell></Table.Row>
                ) : owing.map((b) => (
                  <Table.Row key={`${b.kind}-${b.id}`} _hover={{ bg: "#f9fbfa" }}>
                    <Table.Cell fontWeight="800" color="#126b68">{b.number}</Table.Cell>
                    <Table.Cell><Text fontSize="sm" fontWeight="700">{b.patient.name}</Text><Text fontSize="xs" color="#77908b">{b.patient.mrNumber}</Text></Table.Cell>
                    <Table.Cell>
                      <Badge borderRadius="full" colorPalette={b.readyToSettle ? "orange" : "blue"}>{b.readyToSettle ? "Ready for discharge" : b.kind === "OT" ? "In OT / ward" : "Still admitted"}</Badge>
                    </Table.Cell>
                    <Table.Cell fontSize="xs" maxW="420px">
                      {b.sales.filter((s) => s.creditStatus === "UNSETTLED").map((s) => (
                        <Text key={s.id}><strong>{s.saleNumber}</strong> ({medicinePurposeLabels[s.purpose] ?? s.purpose}): {s.items} — {pkr(s.owed)}</Text>
                      ))}
                    </Table.Cell>
                    <Table.Cell textAlign="right" fontWeight="800" color="#a34258">{pkr(b.medicines.owed)}</Table.Cell>
                    <Table.Cell textAlign="right">
                      <Button size="xs" bg="#22633e" color="white" _hover={{ bg: "#1b4f31" }} onClick={() => { setMethod("CASH"); setSettling(b); }}>
                        <FontAwesomeIcon icon={faCashRegister} />&nbsp; Mark paid
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Box>
        </Box>
      </Box>

      {settling && (
        <Flex position="fixed" inset="0" bg="rgba(15, 30, 28, 0.55)" backdropFilter="blur(3px)" zIndex="100" align="center" justify="center" p="4">
          <Box bg="white" borderRadius="16px" w="full" maxW="460px" boxShadow="0 20px 40px rgba(0,0,0,0.2)" overflow="hidden">
            <Flex justify="space-between" align="center" px="24px" py="16px" bg="#123d3b" color="white">
              <Box>
                <Heading size="sm">Medicine payment received</Heading>
                <Text fontSize="xs" color="#a8c5bd">{settling.number} · {settling.patient.name}</Text>
              </Box>
              <Button variant="ghost" color="white" _hover={{ bg: "#255d58" }} p="2" minW="auto" onClick={() => setSettling(null)}>
                <FontAwesomeIcon icon={faXmark} size="lg" />
              </Button>
            </Flex>
            <Box p="24px">
              <Text fontSize="sm" mb="1">{purposeLine(settling.medicines.byPurpose)}</Text>
              <Text fontSize="2xl" fontWeight="800" color="#123d3b" mb="4">{pkr(settling.medicines.owed)}</Text>
              <Text fontSize="sm" fontWeight="700" mb="2">Paid by</Text>
              <NativeSelect.Root>
                <NativeSelect.Field value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                  <option value="ONLINE">Online</option>
                </NativeSelect.Field>
              </NativeSelect.Root>
              <Text fontSize="xs" color="#607d76" mt="3">This counts as today&apos;s store income and appears in today&apos;s day closing.</Text>
            </Box>
            <Flex justify="flex-end" gap="3" px="24px" py="14px" bg="#f7faf9" borderTop="1px solid #e2e9e6">
              <Button variant="outline" borderColor="#c8dad5" onClick={() => setSettling(null)}>Close</Button>
              <Button bg="#22633e" color="white" _hover={{ bg: "#1b4f31" }} loading={saving} onClick={settle}>Mark paid</Button>
            </Flex>
          </Box>
        </Flex>
      )}
    </Box>
  );
}
