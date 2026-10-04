"use client";

import { useEffect, useState } from "react";
import { usePolling } from "../use-polling";
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  Input,
  Link,
  NativeSelect,
  Table,
  Text,
  VStack,
} from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faClockRotateLeft, faEye, faFilePdf, faPrint, faVial, faXmark } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";

type ResultItem = {
  id: number;
  name: string;
  price: string;
  result: string | null;
  resultFileName: string | null;
  hasResultFile: boolean;
  resultUploadedAt: string | null;
  resultUploadedBy: string | null;
};
type HospitalSettings = { name: string; logoDataUrl?: string | null };
type ResultReceipt = {
  id: number;
  receiptNumber: string;
  module: string;
  moduleToken: number;
  total: string;
  status: string;
  resultStatus: "PENDING" | "DONE";
  createdAt: string;
  opdNumber: string | null;
  printedAt: string | null;
  printedBy: string | null;
  patient: { name: string; mrNumber: string };
  doctor: { name: string };
  items: ResultItem[];
};

type ResultsPeriod = "today" | "weekly" | "monthly" | "custom";

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

export default function ResultsPage() {
  const [receipts, setReceipts] = useState<ResultReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [period, setPeriod] = useState<ResultsPeriod>("today");
  const [customStart, setCustomStart] = useState(() => toDateStr(new Date()));
  const [customEnd, setCustomEnd] = useState(() => toDateStr(new Date()));
  const [viewReceipt, setViewReceipt] = useState<ResultReceipt | null>(null);
  const [printingId, setPrintingId] = useState<number | null>(null);
  const [hospitalSettings, setHospitalSettings] = useState<HospitalSettings | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  function changePeriod(next: "today" | "weekly" | "monthly") {
    const range = periodRange(next);
    setPeriod(next);
    setCustomStart(range.start);
    setCustomEnd(range.end);
    setPage(1);
  }

  // silent=true is used for the background auto-refresh poll — no loading spinner,
  // no error toast spam, just quietly keep the table current.
  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/diagnostics/results?module=LABORATORY");
      const data = await res.json();
      if (res.ok) {
        const nextReceipts: ResultReceipt[] = data.receipts ?? [];
        setReceipts(nextReceipts);
        // Keep an open "View Result" modal in sync too, so a Lab upload shows up there live.
        setViewReceipt((prev) => (prev ? nextReceipts.find((r) => r.id === prev.id) ?? prev : prev));
      } else if (!silent) {
        toast.error(data.error ?? "Unable to load laboratory results.");
      }
    } catch {
      if (!silent) toast.error("Unable to reach the clinic server.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function loadHospitalSettings() {
    try {
      const res = await fetch("/api/hospital-settings");
      if (res.ok) setHospitalSettings((await res.json()).settings);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void load();
    void loadHospitalSettings();
  }, []);

  // Refreshes quietly in the background; pauses while the tab is hidden and never overlaps requests.
  usePolling(() => load(true), 15000, { runNow: false });

  // Attached lab PDFs are held as blob URLs (not the raw data: URLs) so the inline viewer
  // and the print-the-attachment flow stay same-origin — a data: URL iframe is an opaque
  // origin, and calling contentWindow.print() on it is blocked.
  const [attachments, setAttachments] = useState<{ itemId: number; name: string; blobUrl: string }[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [mergingReports, setMergingReports] = useState(false);

  // Keyed on *which* files are attached, not on the viewReceipt object itself: the 5s
  // background poll replaces viewReceipt with a fresh object every tick, and depending on
  // that identity would re-fetch the PDFs and reset the embedded viewer's scroll position.
  const attachedItemIds = (viewReceipt?.items ?? [])
    .filter((item) => item.hasResultFile)
    .map((item) => item.id)
    .join(",");

  useEffect(() => {
    const ids = attachedItemIds ? attachedItemIds.split(",").map(Number) : [];
    let cancelled = false;
    const created: string[] = [];

    (async () => {
      if (ids.length === 0) return;
      setLoadingAttachments(true);
      const loaded: { itemId: number; name: string; blobUrl: string }[] = [];
      for (const id of ids) {
        try {
          const res = await fetch(`/api/diagnostics/items/${id}/file`);
          const data = await res.json();
          if (!res.ok) continue;
          const blob = await (await fetch(data.fileDataUrl)).blob();
          const blobUrl = URL.createObjectURL(blob);
          created.push(blobUrl);
          loaded.push({ itemId: id, name: data.fileName ?? "Lab report", blobUrl });
        } catch {
          /* skip this attachment — the rest of the report still renders */
        }
      }
      if (cancelled) {
        created.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      setAttachments(loaded);
      setLoadingAttachments(false);
    })();

    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
      setAttachments([]);
      setLoadingAttachments(false);
    };
  }, [attachedItemIds]);

  // Prints a single PDF via a hidden same-origin iframe.
  function printAttachment(blobUrl: string) {
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.src = blobUrl;

    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) return;
      // Give the embedded PDF viewer a moment to initialise before printing.
      setTimeout(() => {
        try {
          win.focus();
          win.print();
        } catch {
          toast.error("Unable to print the report. Try opening it in a new tab instead.");
        }
      }, 250);
      // Tear the iframe down well after the job has spooled.
      setTimeout(() => frame.remove(), 60000);
    };

    document.body.appendChild(frame);
  }

  // Merges every attached report into one PDF so "Print All" is a single print job.
  // Chaining separate print dialogs is not reliable: Chrome's PDF viewer doesn't fire
  // `afterprint` for an iframe, and it suppresses a second print() while one dialog is open.
  async function mergeAttachments(urls: string[]): Promise<string> {
    const { PDFDocument } = await import("pdf-lib");
    const merged = await PDFDocument.create();
    for (const url of urls) {
      const bytes = await (await fetch(url)).arrayBuffer();
      const doc = await PDFDocument.load(bytes);
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach((page) => merged.addPage(page));
    }
    const mergedBytes = await merged.save();
    return URL.createObjectURL(new Blob([mergedBytes as BlobPart], { type: "application/pdf" }));
  }

  function printResults(r: ResultReceipt) {
    const escapeHtml = (value: string) =>
      value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
    const clinicName = hospitalSettings?.name || "CareLedger Clinic";
    const date = new Date().toLocaleDateString("en-PK");
    const rows = r.items
      .map((item) => {
        const parts: string[] = [];
        if (item.result) parts.push(escapeHtml(item.result).replaceAll("\n", "<br>"));
        if (item.hasResultFile) parts.push("<em>PDF report attached — view/print separately in the app.</em>");
        if (parts.length === 0) parts.push("<em>Pending</em>");
        return `<div class="test"><div class="test-name">${escapeHtml(item.name)}</div><div class="test-result">${parts.join("<br>")}</div></div>`;
      })
      .join("");

    const printWindow = window.open("", "diagnostic-result-report", "width=480,height=800");
    if (!printWindow) {
      toast.error("Allow pop-ups to print the result report.");
      return;
    }
    printWindow.addEventListener("load", () => {
      printWindow.focus();
      printWindow.print();
      printWindow.addEventListener("afterprint", () => printWindow.close(), { once: true });
    }, { once: true });
    printWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(r.module)} Result Report ${escapeHtml(r.receiptNumber)}</title><style>
      @page { size: A4 portrait; margin: 14mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; font-size: 11pt; color: #000; }
      .center { text-align: center; }
      .clinic { font-size: 18pt; font-weight: 800; }
      .subtitle { font-size: 11pt; font-weight: 700; margin-top: 2mm; text-transform: uppercase; letter-spacing: 1px; }
      .meta { font-size: 9pt; margin-top: 4mm; display: flex; justify-content: space-between; }
      .rule { border-top: 2px solid #000; margin: 4mm 0; }
      .rule-light { border-top: 1px dashed #000; margin: 3mm 0; }
      .test { padding: 3mm 0; border-bottom: 1px solid #ccc; }
      .test-name { font-weight: 800; font-size: 11pt; }
      .test-result { margin-top: 1mm; font-size: 11pt; white-space: pre-wrap; }
      .footer { text-align: center; font-size: 8pt; margin-top: 10mm; color: #444; }
    </style></head><body>
      <div class="center clinic">${escapeHtml(clinicName.toUpperCase())}</div>
      <div class="center subtitle">Laboratory — Diagnostic Result Report</div>
      <div class="meta"><span><strong>Receipt #:</strong> ${escapeHtml(r.receiptNumber)}</span><span><strong>Date:</strong> ${escapeHtml(date)}</span></div>
      <div class="meta"><span><strong>Token #:</strong> ${escapeHtml(String(r.moduleToken))}</span><span><strong>OPD #:</strong> ${escapeHtml(r.opdNumber ?? "-")}</span></div>
      <div class="rule"></div>
      <div class="meta"><span><strong>Patient:</strong> ${escapeHtml(r.patient.name)} (MR #: ${escapeHtml(r.patient.mrNumber)})</span><span><strong>Doctor:</strong> ${escapeHtml(r.doctor.name)}</span></div>
      <div class="rule-light"></div>
      ${rows}
      <div class="footer">This report is computer-generated and requires no signature unless stated otherwise.</div>
    </body></html>`);
    printWindow.document.close();
  }

  async function handlePrint(r: ResultReceipt) {
    // Prefer the PDFs the Lab actually attached; fall back to the generated summary
    // for receipts whose results were typed in as text instead of uploaded.
    if (attachments.length === 1) {
      printAttachment(attachments[0].blobUrl);
    } else if (attachments.length > 1) {
      setMergingReports(true);
      try {
        const mergedUrl = await mergeAttachments(attachments.map((a) => a.blobUrl));
        printAttachment(mergedUrl);
        // Freed once the print job has had time to spool.
        setTimeout(() => URL.revokeObjectURL(mergedUrl), 60000);
      } catch {
        toast.error("Unable to combine the attached reports for printing.");
        return;
      } finally {
        setMergingReports(false);
      }
    } else {
      printResults(r);
    }
    if (r.printedAt) return;
    setPrintingId(r.id);
    try {
      const res = await fetch(`/api/diagnostics/${r.id}/print`, { method: "PATCH" });
      if (res.ok) {
        const data = await res.json();
        setReceipts((prev) => prev.map((item) => (item.id === r.id ? { ...item, printedAt: data.receipt.printedAt } : item)));
      }
    } catch {
      /* non-critical — printed marker is best-effort */
    } finally {
      setPrintingId(null);
    }
  }

  const filtered = receipts.filter((r) => {
    if (statusFilter === "UNPRINTED") {
      if (r.printedAt) return false;
    } else if (statusFilter === "PRINTED") {
      if (!r.printedAt) return false;
    } else if (statusFilter !== "ALL" && r.resultStatus !== statusFilter) {
      return false;
    }
    const receiptDateStr = toDateStr(new Date(r.createdAt));
    if (receiptDateStr < customStart || receiptDateStr > customEnd) return false;
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      r.receiptNumber.toLowerCase().includes(q) ||
      (r.opdNumber ?? "").toLowerCase().includes(q) ||
      r.patient.name.toLowerCase().includes(q) ||
      r.patient.mrNumber.toLowerCase().includes(q) ||
      r.doctor.name.toLowerCase().includes(q) ||
      r.items.some((item) => item.name.toLowerCase().includes(q))
    );
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const firstRecord = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRecord = Math.min(page * pageSize, filtered.length);

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
          <Link href="/diagnostics" color="#2da08b" _hover={{ color: "#1a8070" }} transition="color 0.15s ease">
            <FontAwesomeIcon icon={faArrowLeft} />
          </Link>
          <Box>
            <Heading size="lg" letterSpacing="-0.04em" color="#0e2420">
              Laboratory Results
            </Heading>
          </Box>
        </HStack>
      </Flex>

      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>

        <Box bg="white" border="1px solid #e1e9e6" borderRadius="14px" boxShadow="0 2px 12px rgba(14,36,32,0.04)" overflow="hidden">
          <Box p="5" borderBottom="1px solid #edf2f0">
            <Flex justify="space-between" align="center" direction={{ base: "column", sm: "row" }} gap="4">
              <HStack gap="3">
                <Flex w="34px" h="34px" bg="#e9f1ef" color="#126b68" borderRadius="9px" align="center" justify="center">
                  <FontAwesomeIcon icon={faVial} />
                </Flex>
                <Box>
                  <Heading size="sm">Laboratory Receipt History</Heading>
                </Box>
              </HStack>

              <HStack gap="3">
                <NativeSelect.Root size="sm" width="150px">
                  <NativeSelect.Field
                    value={statusFilter}
                    onChange={(event) => {
                      setStatusFilter(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="ALL">All statuses</option>
                    <option value="PENDING">Pending</option>
                    <option value="DONE">Done</option>
                    <option value="PRINTED">Printed</option>
                    <option value="UNPRINTED">Unprinted</option>
                  </NativeSelect.Field>
                </NativeSelect.Root>
                <Input
                  placeholder="Search by receipt #, OPD #, patient, or test..."
                  value={searchFilter}
                  onChange={(event) => {
                    setSearchFilter(event.target.value);
                    setPage(1);
                  }}
                  maxW="320px"
                  size="sm"
                  borderRadius="8px"
                />
              </HStack>
            </Flex>

            <VStack mt="4" align="flex-end" gap="3">
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
                    value={customStart}
                    onChange={(event) => {
                      setCustomStart(event.target.value);
                      setPage(1);
                    }}
                    w="150px"
                  />
                  <Text fontSize="sm" color="#77908b">to</Text>
                  <Input
                    size="sm"
                    type="date"
                    value={customEnd}
                    onChange={(event) => {
                      setCustomEnd(event.target.value);
                      setPage(1);
                    }}
                    w="150px"
                  />
                </HStack>
              )}
            </VStack>
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
                  <Table.ColumnHeader>Print</Table.ColumnHeader>
                  <Table.ColumnHeader>Date</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Action</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {loading ? (
                  <Table.Row>
                    <Table.Cell colSpan={8}>
                      <Text py="8" textAlign="center" color="#77908b">
                        Loading diagnostic results...
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                ) : visible.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={8}>
                      <Text py="8" textAlign="center" color="#77908b">
                        No diagnostic receipts found.
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  visible.map((r) => (
                    <Table.Row key={r.id} _hover={{ bg: "#f9fbfa" }}>
                      <Table.Cell fontWeight="800" color="#126b68">
                        {r.receiptNumber}
                      </Table.Cell>
                      <Table.Cell>
                        <Badge bg="#dce96f" color="#123d3b" fontWeight="800" borderRadius="full" px="2">
                          #{r.moduleToken}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Text fontWeight="700" fontSize="sm">
                          {r.patient.name}
                        </Text>
                        <Text fontSize="xs" color="#77908b">
                          MR: {r.patient.mrNumber}
                        </Text>
                      </Table.Cell>
                      <Table.Cell fontSize="xs" color="#556e68" maxW="220px">
                        {r.items.map((item) => item.name).join(", ")}
                      </Table.Cell>
                      <Table.Cell>
                        <Badge colorPalette={r.resultStatus === "DONE" ? "green" : "orange"} borderRadius="full">
                          {r.resultStatus === "DONE" ? "Done" : "Pending"}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge colorPalette={r.printedAt ? "blue" : "gray"} borderRadius="full">
                          {r.printedAt ? "Printed" : "Unprinted"}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell fontSize="xs">{new Date(r.createdAt).toLocaleString("en-PK")}</Table.Cell>
                      <Table.Cell textAlign="right">
                        <HStack justify="flex-end" gap="2">
                          <Button size="xs" variant="outline" borderColor="#c8dad5" color="#126b68" onClick={() => setViewReceipt(r)}>
                            <FontAwesomeIcon icon={faEye} />
                            &nbsp; View Result
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            borderColor="#c8dad5"
                            color="#126b68"
                            loading={printingId === r.id}
                            disabled={r.resultStatus !== "DONE"}
                            onClick={() => void handlePrint(r)}
                          >
                            <FontAwesomeIcon icon={faPrint} />
                            &nbsp; Print
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

      {/* View Result Modal */}
      {viewReceipt && (
        <Flex position="fixed" inset="0" bg="rgba(15, 30, 28, 0.55)" backdropFilter="blur(3px)" zIndex="100" align="center" justify="center" p="4">
          <Box bg="white" borderRadius="16px" w="full" maxW="900px" boxShadow="0 20px 40px rgba(0,0,0,0.2)" overflow="hidden">
            <Flex justify="space-between" align="center" px="28px" py="18px" bg="#123d3b" color="white">
              <HStack gap="3">
                <Flex w="36px" h="36px" bg="#d6e66c" color="#123d3b" borderRadius="10px" align="center" justify="center">
                  <FontAwesomeIcon icon={faClockRotateLeft} />
                </Flex>
                <Box>
                  <Heading size="sm">Test Results</Heading>
                  <Text fontSize="xs" color="#a8c5bd">
                    {viewReceipt.receiptNumber} · {viewReceipt.patient.name} ({viewReceipt.patient.mrNumber})
                  </Text>
                </Box>
              </HStack>
              <Button variant="ghost" color="white" _hover={{ bg: "#255d58" }} p="2" minW="auto" onClick={() => setViewReceipt(null)}>
                <FontAwesomeIcon icon={faXmark} size="lg" />
              </Button>
            </Flex>
            <Box p="24px" maxH="65vh" overflowY="auto">
              {viewReceipt.items.map((item) => (
                <Box key={item.id} mb="4" pb="4" borderBottom="1px solid #edf2f0">
                  <HStack justify="space-between" mb="1">
                    <Text fontWeight="800" color="#123d3b">
                      {item.name}
                    </Text>
                    <Badge colorPalette={item.result || item.hasResultFile ? "green" : "orange"} borderRadius="full">
                      {item.result || item.hasResultFile ? "Done" : "Pending"}
                    </Badge>
                  </HStack>
                  {item.result && (
                    <Text fontSize="sm" color="#334155" whiteSpace="pre-wrap" mb={item.hasResultFile ? "2" : "0"}>
                      {item.result}
                    </Text>
                  )}
                  {item.hasResultFile && (() => {
                    const attachment = attachments.find((a) => a.itemId === item.id);
                    if (!attachment) {
                      return (
                        <HStack gap="2" color="#77908b" fontSize="xs">
                          <FontAwesomeIcon icon={faFilePdf} />
                          <Text>{loadingAttachments ? "Loading attached report…" : "Attached report unavailable."}</Text>
                        </HStack>
                      );
                    }
                    return (
                      <Box mt="2">
                        <HStack justify="space-between" mb="1">
                          <HStack gap="2" fontSize="xs" color="#126b68">
                            <FontAwesomeIcon icon={faFilePdf} />
                            <Text fontWeight="700">{attachment.name}</Text>
                          </HStack>
                          <Button size="xs" variant="outline" borderColor="#c8dad5" color="#126b68" onClick={() => printAttachment(attachment.blobUrl)}>
                            <FontAwesomeIcon icon={faPrint} />
                            &nbsp; Print
                          </Button>
                        </HStack>
                        <Box border="1px solid #c8dad5" borderRadius="8px" overflow="hidden" bg="#f8faf9">
                          <iframe
                            src={attachment.blobUrl}
                            title={attachment.name}
                            style={{ border: 0, width: "100%", height: "52vh", display: "block" }}
                          />
                        </Box>
                      </Box>
                    );
                  })()}
                  {!item.result && !item.hasResultFile && (
                    <Text fontSize="sm" color="#94a3b8" fontStyle="italic">
                      Awaiting result from the Lab.
                    </Text>
                  )}
                  {item.resultUploadedAt && (
                    <Text fontSize="10px" color="#94a3b8" mt="1">
                      Uploaded {new Date(item.resultUploadedAt).toLocaleString("en-PK")}
                      {item.resultUploadedBy ? ` by ${item.resultUploadedBy}` : ""}
                    </Text>
                  )}
                </Box>
              ))}
            </Box>
            <Flex justify="flex-end" gap="3" px="28px" py="16px" bg="#f7faf9" borderTop="1px solid #e2e9e6">
              <Button variant="outline" borderColor="#c8dad5" onClick={() => setViewReceipt(null)}>
                Close
              </Button>
              <Button
                bg="#123d3b"
                color="white"
                _hover={{ bg: "#255d58" }}
                disabled={viewReceipt.resultStatus !== "DONE" || loadingAttachments}
                loading={mergingReports}
                onClick={() => void handlePrint(viewReceipt)}
              >
                <FontAwesomeIcon icon={faPrint} />
                &nbsp; {attachments.length > 1 ? `Print All ${attachments.length} Reports` : "Print Report"}
              </Button>
            </Flex>
          </Box>
        </Flex>
      )}
    </Box>
  );
}
