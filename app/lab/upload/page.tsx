"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { usePolling } from "../../use-polling";
import { Badge, Box, Button, Flex, Heading, HStack, Input, NativeSelect, Table, Text, Textarea, VStack } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCloudArrowUp, faFilePdf, faTrash, faUpload, faVial, faXmark } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";

const MAX_FILE_BYTES = 7_000_000;

type ResultItem = {
  id: number;
  name: string;
  result: string | null;
  resultFileName: string | null;
  hasResultFile: boolean;
  resultUploadedAt: string | null;
};
type ResultReceipt = {
  id: number;
  receiptNumber: string;
  module: string;
  moduleToken: number;
  resultStatus: "PENDING" | "DONE";
  createdAt: string;
  opdNumber: string | null;
  patient: { name: string; mrNumber: string };
  doctor: { name: string };
  items: ResultItem[];
};
type Draft = { result: string; fileName: string; fileDataUrl: string };
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

export default function LabUploadPage() {
  const [receipts, setReceipts] = useState<ResultReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [searchFilter, setSearchFilter] = useState("");
  const [uploadReceipt, setUploadReceipt] = useState<ResultReceipt | null>(null);
  const [draftResults, setDraftResults] = useState<Record<number, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [period, setPeriod] = useState<Period>("today");
  const [rangeStart, setRangeStart] = useState(toDateStr(new Date()));
  const [rangeEnd, setRangeEnd] = useState(toDateStr(new Date()));

  function changePeriod(next: "today" | "weekly" | "monthly") {
    const range = periodRange(next);
    setPeriod(next);
    setRangeStart(range.start);
    setRangeEnd(range.end);
    setPage(1);
  }

  // silent=true is used for the background auto-refresh poll — no loading spinner,
  // no error toast spam, just quietly keep the queue current as new receipts come in.
  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/diagnostics/results?module=LABORATORY");
      const data = await res.json();
      if (res.ok) setReceipts(data.receipts ?? []);
      else if (!silent) toast.error(data.error ?? "Unable to load the laboratory queue.");
    } catch {
      if (!silent) toast.error("Unable to reach the clinic server.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Refreshes quietly in the background; pauses while the tab is hidden and never overlaps requests.
  usePolling(() => load(true), 15000, { runNow: false });

  function openUploadModal(r: ResultReceipt) {
    setUploadReceipt(r);
    const draft: Record<number, Draft> = {};
    r.items.forEach((item) => { draft[item.id] = { result: item.result ?? "", fileName: "", fileDataUrl: "" }; });
    setDraftResults(draft);
  }

  function handleFileSelect(itemId: number, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Only PDF files can be attached as a result report.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error("Result PDF must be smaller than 7 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setDraftResults((prev) => ({
        ...prev,
        [itemId]: { ...prev[itemId], fileName: file.name, fileDataUrl: reader.result as string },
      }));
    };
    reader.readAsDataURL(file);
  }

  function clearFile(itemId: number) {
    setDraftResults((prev) => ({ ...prev, [itemId]: { ...prev[itemId], fileName: "", fileDataUrl: "" } }));
  }

  async function submitResults() {
    if (!uploadReceipt) return;
    const results = Object.entries(draftResults)
      .map(([itemId, draft]) => ({ itemId: Number(itemId), result: draft.result.trim(), fileName: draft.fileName, fileDataUrl: draft.fileDataUrl }))
      .filter((entry) => entry.result.length > 0 || entry.fileDataUrl.length > 0);

    if (results.length === 0) {
      toast.error("Enter a result or attach a PDF for at least one test before uploading.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/diagnostics/${uploadReceipt.id}/results`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Unable to upload test results.");
        return;
      }
      toast.success(
        `${data.updatedTests.join(", ")} uploaded for ${data.patient?.name ?? uploadReceipt.patient.name} (${data.patient?.mrNumber ?? uploadReceipt.patient.mrNumber}).`
      );
      setUploadReceipt(null);
      setDraftResults({});
      await load();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setSaving(false);
    }
  }

  const filtered = receipts.filter((r) => {
    const created = toDateStr(new Date(r.createdAt));
    if (created < rangeStart || created > rangeEnd) return false;
    if (statusFilter !== "ALL" && r.resultStatus !== statusFilter) return false;
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      r.receiptNumber.toLowerCase().includes(q) ||
      r.patient.name.toLowerCase().includes(q) ||
      r.patient.mrNumber.toLowerCase().includes(q) ||
      r.items.some((item) => item.name.toLowerCase().includes(q))
    );
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const firstRecord = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRecord = Math.min(page * pageSize, filtered.length);

  return (
    <Box minH="100vh" bg="#f5f7f8" color="#17252b">
      <Flex as="header" h="78px" bg="white" borderBottom="1px solid #e2e9e6" align="center" justify="space-between" px={{ base: "20px", md: "42px" }}>
        <Box>
          <Heading size="lg" letterSpacing="-0.04em">
            Upload Laboratory Tests
          </Heading>
        </Box>
      </Flex>

      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>

        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
          <Box p="5" borderBottom="1px solid #edf2f0">
            <Flex justify="space-between" align="center" direction={{ base: "column", lg: "row" }} gap="4">
              <HStack gap="3">
                <Flex w="34px" h="34px" bg="#e9f1ef" color="#126b68" borderRadius="9px" align="center" justify="center">
                  <FontAwesomeIcon icon={faVial} />
                </Flex>
                <Box>
                  <Heading size="sm">Laboratory Receipts</Heading>
                </Box>
              </HStack>

              <HStack gap="3" flexWrap="nowwrap">
                <NativeSelect.Root size="sm" width="150px">
                  <NativeSelect.Field
                    value={statusFilter}
                    onChange={(event) => {
                      setStatusFilter(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="PENDING">Pending</option>
                    <option value="DONE">Done</option>
                    <option value="ALL">All statuses</option>
                  </NativeSelect.Field>
                </NativeSelect.Root>
                <Input
                  placeholder="Search receipt #, patient, test..."
                  value={searchFilter}
                  onChange={(event) => {
                    setSearchFilter(event.target.value);
                    setPage(1);
                  }}
                  maxW="260px"
                  size="sm"
                  borderRadius="8px"
                />
              </HStack>
            </Flex>

            <Flex justify="flex-end" mt="4">
              <VStack gap="2" align="flex-end">
                <HStack gap="2">
                  {(["today", "weekly", "monthly"] as const).map((p) => (
                    <Button
                      key={p}
                      size="sm"
                      variant={period === p ? "solid" : "outline"}
                      bg={period === p ? "#123d3b" : undefined}
                      color={period === p ? "white" : "#3e5e58"}
                      borderColor="#c8dad5"
                      onClick={() => changePeriod(p)}
                    >
                      {p === "today" ? "Today" : p.charAt(0).toUpperCase() + p.slice(1)}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant={period === "custom" ? "solid" : "outline"}
                    bg={period === "custom" ? "#123d3b" : undefined}
                    color={period === "custom" ? "white" : "#3e5e58"}
                    borderColor="#c8dad5"
                    onClick={() => setPeriod("custom")}
                  >
                    Custom
                  </Button>
                </HStack>

                {period === "custom" && (
                  <HStack gap="2" flexWrap="wrap">
                    <Input
                      size="sm"
                      type="date"
                      value={rangeStart}
                      onChange={(event) => {
                        setRangeStart(event.target.value);
                        setPage(1);
                      }}
                      w="150px"
                    />
                    <Text fontSize="sm" color="#77908b">to</Text>
                    <Input
                      size="sm"
                      type="date"
                      value={rangeEnd}
                      onChange={(event) => {
                        setRangeEnd(event.target.value);
                        setPage(1);
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
                  <Table.ColumnHeader>Receipt #</Table.ColumnHeader>
                  <Table.ColumnHeader>Token #</Table.ColumnHeader>
                  <Table.ColumnHeader>Patient</Table.ColumnHeader>
                  <Table.ColumnHeader>Tests</Table.ColumnHeader>
                  <Table.ColumnHeader>Status</Table.ColumnHeader>
                  <Table.ColumnHeader>Date</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Action</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {loading ? (
                  <Table.Row>
                    <Table.Cell colSpan={7}>
                      <Text py="8" textAlign="center" color="#77908b">Loading receipts...</Text>
                    </Table.Cell>
                  </Table.Row>
                ) : filtered.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={7}>
                      <Text py="8" textAlign="center" color="#77908b">No receipts match this filter.</Text>
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  visible.map((r) => (
                    <Table.Row key={r.id} _hover={{ bg: "#f9fbfa" }}>
                      <Table.Cell fontWeight="800" color="#126b68">{r.receiptNumber}</Table.Cell>
                      <Table.Cell>
                        <Badge bg="#dce96f" color="#123d3b" fontWeight="800" borderRadius="full" px="2">#{r.moduleToken}</Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Text fontWeight="700" fontSize="sm">{r.patient.name}</Text>
                        <Text fontSize="xs" color="#77908b">MR: {r.patient.mrNumber}</Text>
                      </Table.Cell>
                      <Table.Cell fontSize="xs" color="#556e68" maxW="220px">
                        {r.items.map((item) => item.name).join(", ")}
                      </Table.Cell>
                      <Table.Cell>
                        <Badge colorPalette={r.resultStatus === "DONE" ? "green" : "orange"} borderRadius="full">
                          {r.resultStatus === "DONE" ? "Done" : "Pending"}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell fontSize="xs">{new Date(r.createdAt).toLocaleString("en-PK")}</Table.Cell>
                      <Table.Cell textAlign="right">
                        <Button size="xs" bg="#123d3b" color="white" _hover={{ bg: "#255d58" }} onClick={() => openUploadModal(r)}>
                          <FontAwesomeIcon icon={faUpload} />
                          &nbsp; Upload
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
              {filtered.length ? `Showing ${firstRecord}-${lastRecord} of ${filtered.length}` : "No records"}
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

      {/* Upload Results Modal */}
      {uploadReceipt && (
        <Flex position="fixed" inset="0" bg="rgba(15, 30, 28, 0.55)" backdropFilter="blur(3px)" zIndex="100" align="center" justify="center" p="4">
          <Box bg="white" borderRadius="16px" w="full" maxW="640px" boxShadow="0 20px 40px rgba(0,0,0,0.2)" overflow="hidden">
            <Flex justify="space-between" align="center" px="28px" py="18px" bg="#123d3b" color="white">
              <HStack gap="3">
                <Flex w="36px" h="36px" bg="#d6e66c" color="#123d3b" borderRadius="10px" align="center" justify="center">
                  <FontAwesomeIcon icon={faCloudArrowUp} />
                </Flex>
                <Box>
                  <Heading size="sm">Upload Test Results</Heading>
                  <Text fontSize="xs" color="#a8c5bd">
                    {uploadReceipt.receiptNumber} · {uploadReceipt.patient.name} ({uploadReceipt.patient.mrNumber})
                  </Text>
                </Box>
              </HStack>
              <Button variant="ghost" color="white" _hover={{ bg: "#255d58" }} p="2" minW="auto" onClick={() => setUploadReceipt(null)}>
                <FontAwesomeIcon icon={faXmark} size="lg" />
              </Button>
            </Flex>
            <Box p="24px" maxH="65vh" overflowY="auto">
              <Text fontSize="xs" color="#77908b" mb="4">
                Attach a PDF report and/or type a quick result for as many tests as you have ready — the rest can be uploaded later.
              </Text>
              <VStack align="stretch" gap="5">
                {uploadReceipt.items.map((item) => {
                  const draft = draftResults[item.id] ?? { result: "", fileName: "", fileDataUrl: "" };
                  return (
                    <Box key={item.id}>
                      <HStack justify="space-between" mb="2">
                        <Text fontWeight="700" fontSize="sm">{item.name}</Text>
                        <Badge colorPalette={item.result || item.hasResultFile ? "green" : "orange"} borderRadius="full">
                          {item.result || item.hasResultFile ? "Already uploaded" : "Pending"}
                        </Badge>
                      </HStack>

                      {item.hasResultFile && (
                        <Text fontSize="10px" color="#77908b" mb="2">
                          Current file on record: {item.resultFileName ?? "result.pdf"} (uploading a new one below will replace it)
                        </Text>
                      )}

                      <HStack mb="2" gap="2" flexWrap="wrap">
                        {draft.fileDataUrl ? (
                          <HStack bg="#f0faf7" border="1px solid #126b68" borderRadius="8px" px="3" py="1.5" gap="2">
                            <FontAwesomeIcon icon={faFilePdf} color="#126b68" />
                            <Text fontSize="xs" fontWeight="700" color="#123d3b">{draft.fileName}</Text>
                            <Button size="2xs" variant="ghost" color="#a34258" p="1" minW="auto" onClick={() => clearFile(item.id)}>
                              <FontAwesomeIcon icon={faTrash} />
                            </Button>
                          </HStack>
                        ) : (
                          <>
                            <Button
                              size="xs"
                              variant="outline"
                              borderColor="#c8dad5"
                              color="#126b68"
                              onClick={() => document.getElementById(`pdf-input-${item.id}`)?.click()}
                            >
                              <FontAwesomeIcon icon={faFilePdf} />
                              &nbsp; Attach PDF report
                            </Button>
                            <input
                              id={`pdf-input-${item.id}`}
                              type="file"
                              accept="application/pdf"
                              hidden
                              onChange={(event) => handleFileSelect(item.id, event)}
                            />
                          </>
                        )}
                      </HStack>

                      <Textarea
                        placeholder={`Optional quick note for ${item.name}...`}
                        value={draft.result}
                        onChange={(event) =>
                          setDraftResults((prev) => ({ ...prev, [item.id]: { ...prev[item.id], result: event.target.value } }))
                        }
                        rows={2}
                      />
                    </Box>
                  );
                })}
              </VStack>
            </Box>
            <Flex justify="flex-end" gap="3" px="28px" py="16px" bg="#f7faf9" borderTop="1px solid #e2e9e6">
              <Button variant="outline" borderColor="#c8dad5" onClick={() => setUploadReceipt(null)}>
                Cancel
              </Button>
              <Button bg="#123d3b" color="white" _hover={{ bg: "#255d58" }} loading={saving} onClick={submitResults}>
                <FontAwesomeIcon icon={faUpload} />
                &nbsp; Upload Results
              </Button>
            </Flex>
          </Box>
        </Flex>
      )}
    </Box>
  );
}
