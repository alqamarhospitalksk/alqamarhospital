"use client";
import { DateInput } from "../date-input";

import { useEffect, useState } from "react";
import { Box, Button, Flex, Grid, Heading, HStack, Link, Text, VStack } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faArrowTrendUp, faCoins, faDownload, faFileInvoiceDollar, faPrint, faReceipt, faSackDollar, faUserDoctor } from "@fortawesome/free-solid-svg-icons";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "react-toastify";
import { StatCard } from "../stat-card";

type TransactionRow = { id: number; patient: string; mrNumber: string; doctor: string; detail: string; type: string; amount: number; status: string; method: string; createdAt: string };
type ExpenseRow = { id: number; category: string; linkedTo: string; amount: number; method: string; note: string; expenseDate: string };
type Report = {
  totals: Record<string, number>;
  collected: number;
  doctorShare: number;
  doctorPayouts: number;
  totalExpenses: number;
  netRevenue: number;
  patientsSeen: number;
  activity: { id: number; patient: string; detail: string; type: string; amount: number; status: string }[];
  transactions: TransactionRow[];
  expenseDetail: ExpenseRow[];
};

const money = (value: number) =>
  `PKR ${value.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;

// Same palette as the Management Dashboard's "All Services Analytics" chart, so a
// service reads as the same color everywhere in the app.
const serviceRows = [
  { key: "OPD", label: "OPD consultation", color: "#dce96f" },
  { key: "LABORATORY", label: "Laboratory", color: "#7fb9a8" },
  { key: "ECO", label: "ECO", color: "#5fa8c9" },
  { key: "ECG", label: "ECG", color: "#9b8cd6" },
  { key: "X-RAY", label: "X-Ray", color: "#e0a45f" },
  { key: "ULTRASOUND", label: "Ultrasound", color: "#e084a0" },
  { key: "OT", label: "Operation theater", color: "#e06c6c" },
  { key: "EMERGENCY", label: "Minor emergency", color: "#8d9db6" },
  { key: "MEDICAL_STORE", label: "Medical store", color: "#c9b36a" },
  { key: "OTHER", label: "Other / unlinked", color: "#cbd5d1" },
];

const chartTooltipStyle = { borderRadius: 8, border: "1px solid #e1e9e6", fontSize: 12, boxShadow: "0 8px 20px rgba(18,59,59,0.12)" };
const chartAxisTick = { fontSize: 12, fill: "#898781" };
const chartYAxisTick = { fontSize: 12, fill: "#3e5e58", fontWeight: 600 };
const compactMoney = (val: number) => {
  if (val >= 100000) return `${(val / 100000).toFixed(val % 100000 === 0 ? 0 : 1)}L`;
  if (val >= 1000) return `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}K`;
  return String(val);
};

const emptyReport: Report = { totals: {}, collected: 0, doctorShare: 0, doctorPayouts: 0, totalExpenses: 0, netRevenue: 0, patientsSeen: 0, activity: [], transactions: [], expenseDetail: [] };

type Period = "daily" | "weekly" | "monthly" | "custom";

function toDateStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function periodRange(period: "daily" | "weekly" | "monthly") {
  const now = new Date();
  const end = toDateStr(now);
  if (period === "daily") return { start: end, end };
  if (period === "weekly") {
    const day = now.getDay(); // 0 = Sunday
    const diffToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);
    return { start: toDateStr(monday), end };
  }
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: toDateStr(firstOfMonth), end };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] ?? character));
}

// Build print HTML as plain string concatenation — no template literal with </script> issues
function buildPrintHtml(start: string, end: string, report: Report, hospitalName: string, hospitalLogo: string): string {
  const clinicName = escapeHtml(hospitalName || "Al Qamar Hospital");
  const css = [
    "@page{size:A4 portrait;margin:14mm 12mm}",
    "*{box-sizing:border-box;margin:0;padding:0}",
    "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;color:#1a1a1a;background:white}",
    ".letterhead{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:2px solid #333;padding-bottom:14px;margin-bottom:18px}",
    ".letterhead-id{display:flex;align-items:center;gap:12px}",
    ".letterhead-id img{width:46px;height:46px;object-fit:contain;border-radius:8px}",
    ".letterhead-id h1{font-size:19px;font-weight:800;color:#111;letter-spacing:-0.02em}",
    ".letterhead-id p{font-size:11px;color:#555;margin-top:2px;text-transform:uppercase;letter-spacing:0.06em}",
    ".letterhead-meta{text-align:right;font-size:11px;color:#333;line-height:1.6}",
    ".letterhead-meta strong{color:#111}",
    ".card{margin-bottom:18px;border:1px solid #ddd;border-radius:6px;overflow:hidden;page-break-inside:avoid}",
    ".card-head{padding:12px 16px;background:#f5f5f5;border-bottom:1px solid #ddd}",
    ".card-head h2{font-size:14px;font-weight:700;color:#111}",
    "table{width:100%;border-collapse:collapse}",
    "th{padding:8px 12px;text-align:left;font-size:10.5px;font-weight:700;color:#333;text-transform:uppercase;letter-spacing:0.03em;background:#f0f0f0;border-bottom:1px solid #ddd}",
    "td{padding:8px 12px;border-bottom:1px solid #e8e8e8;font-size:12px;vertical-align:top;color:#1a1a1a}",
    "tr:last-child td{border-bottom:none}",
    "tr{page-break-inside:avoid}",
    ".num{text-align:right;font-weight:700;color:#1a1a1a;white-space:nowrap}",
    ".muted{color:#777;font-size:11px}",
    ".totalrow td{border-top:2px solid #333;font-weight:800;color:#111;background:#f5f5f5}",
    ".empty{padding:20px;text-align:center;color:#777;font-size:12px}",
    ".footer{margin-top:22px;font-size:10.5px;color:#999;text-align:center;border-top:1px solid #ddd;padding-top:12px}",
    "@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}",
  ].join("");

  const sortedServiceRows = serviceRows
    .map((r) => ({ label: r.label, amount: report.totals[r.key] ?? 0 }))
    .sort((a, b) => b.amount - a.amount);
  const serviceTableRows = sortedServiceRows
    .map((r) => {
      const pct = report.collected > 0 ? ((r.amount / report.collected) * 100).toFixed(1) : "0.0";
      return "<tr><td>" + escapeHtml(r.label) + "</td><td class='num'>" + money(r.amount) + "</td><td class='muted' style='text-align:right'>" + pct + "%</td></tr>";
    })
    .join("");
  const serviceTable = sortedServiceRows.every((r) => r.amount === 0)
    ? "<div class='empty'>No income recorded in this range.</div>"
    : "<table><thead><tr><th>Service</th><th style='text-align:right'>Collected</th><th style='text-align:right'>Share</th></tr></thead><tbody>" +
      serviceTableRows +
      "<tr class='totalrow'><td>Total</td><td class='num'>" + money(report.collected) + "</td><td></td></tr>" +
      "</tbody></table>";

  const transactionRows = report.transactions
    .map((row) => {
      const date = new Date(row.createdAt).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });
      return "<tr><td>" + date + "</td><td>" + escapeHtml(row.patient) + "<div class='muted'>MR: " + escapeHtml(row.mrNumber) + "</div></td><td>" + escapeHtml(row.doctor) + "</td><td>" + escapeHtml(row.type) + "</td><td>" + escapeHtml(row.method.replaceAll("_", " ")) + "</td><td class='num'>" + money(row.amount) + "</td></tr>";
    })
    .join("");
  const transactionTable = report.transactions.length === 0
    ? "<div class='empty'>No transactions in this range.</div>"
    : "<table><thead><tr><th>Date</th><th>Patient</th><th>Doctor</th><th>Service</th><th>Method</th><th style='text-align:right'>Amount</th></tr></thead><tbody>" +
      transactionRows +
      "<tr class='totalrow'><td colspan='5'>Total collected</td><td class='num'>" + money(report.collected) + "</td></tr>" +
      "</tbody></table>";

  const expenseRowsHtml = report.expenseDetail
    .map((row) => {
      const date = new Date(row.expenseDate).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });
      return "<tr><td>" + date + "</td><td>" + escapeHtml(row.category.replaceAll("_", " ")) + "</td><td>" + escapeHtml(row.linkedTo) + "</td><td>" + escapeHtml(row.method.replaceAll("_", " ")) + "</td><td class='muted'>" + escapeHtml(row.note || "—") + "</td><td class='num'>" + money(row.amount) + "</td></tr>";
    })
    .join("");
  const expenseTable = report.expenseDetail.length === 0
    ? "<div class='empty'>No expenses recorded in this range.</div>"
    : "<table><thead><tr><th>Date</th><th>Category</th><th>Linked To</th><th>Method</th><th>Note</th><th style='text-align:right'>Amount</th></tr></thead><tbody>" +
      expenseRowsHtml +
      "<tr class='totalrow'><td colspan='5'>Total expenses</td><td class='num'>" + money(report.totalExpenses) + "</td></tr>" +
      "</tbody></table>";

  const generated = new Date().toLocaleString("en-GB", { hour12: true });
  const logoImg = hospitalLogo ? "<img src='" + hospitalLogo + "' alt='logo' />" : "";

  // Build using array join so </script> never appears as a literal token in this source file
  return [
    "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'>",
    "<title>" + clinicName + " Report " + start + " to " + end + "</title>",
    "<style>" + css + "</style>",
    "</head><body>",
    "<div class='letterhead'>",
    "<div class='letterhead-id'>" + logoImg + "<div><h1>" + clinicName + "</h1><p>Financial Report</p></div></div>",
    "<div class='letterhead-meta'>Period: <strong>" + start + " to " + end + "</strong><br>Generated: " + generated + "<br>" + report.patientsSeen + " patients seen in this period</div>",
    "</div>",
    "<div class='card'><div class='card-head'><h2>Summary</h2></div><table><tbody>",
    "<tr><td>Total collected (gross)</td><td class='num'>" + money(report.collected) + "</td></tr>",
    "<tr><td>Doctor share (owed to doctors)</td><td class='num'>" + money(report.doctorShare) + "</td></tr>",
    "<tr><td>Hospital share</td><td class='num'>" + money(report.collected - report.doctorShare) + "</td></tr>",
    "<tr><td>Total expenses</td><td class='num'>" + money(report.totalExpenses) + "</td></tr>",
    "<tr class='totalrow'><td>Net revenue (hospital share - expenses)</td><td class='num'>" + money(report.netRevenue) + "</td></tr>",
    "</tbody></table></div>",
    "<div class='card'><div class='card-head'><h2>Income by Service</h2></div>" + serviceTable + "</div>",
    "<div class='card'><div class='card-head'><h2>Paid Transaction Detail</h2></div>" + transactionTable + "</div>",
    "<div class='card'><div class='card-head'><h2>Expense Detail</h2></div>" + expenseTable + "</div>",
    "<div class='footer'>" + clinicName + " &nbsp;&middot;&nbsp; Confidential &nbsp;&middot;&nbsp; " + start + " to " + end + "</div>",
    "</body></html>",
  ].join("");
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<Period>("daily");
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<Report>(emptyReport);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [hospitalName, setHospitalName] = useState("");
  const [hospitalLogo, setHospitalLogo] = useState("");

  useEffect(() => {
    fetch("/api/hospital-settings")
      .then(async (response) => {
        if (response.ok) {
          const settings = (await response.json()).settings;
          setHospitalName(settings?.name ?? "");
          setHospitalLogo(settings?.logoDataUrl ?? "");
        }
      })
      .catch(() => undefined);
  }, []);

  async function load(rangeStart = start, rangeEnd = end) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/dashboard?start=${rangeStart}&end=${rangeEnd}`);
      const data = await response.json();
      if (response.ok) setReport(data);
      else setError(data.error ?? "Unable to load report.");
    } catch {
      setError("Unable to reach the server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function changePeriod(next: "daily" | "weekly" | "monthly") {
    const range = periodRange(next);
    setPeriod(next);
    setStart(range.start);
    setEnd(range.end);
    void load(range.start, range.end);
  }

  async function downloadExcel() {
    setDownloading(true);
    try {
      const response = await fetch(`/api/reports/export?start=${start}&end=${end}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error((data as { error?: string }).error ?? "Failed to generate Excel report.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `careledger-report-${start}-to-${end}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Unable to download the report. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  // Renders the report in a hidden same-page iframe and prints that — no separate browser
  // window/tab ever becomes visible, so the user only ever sees the print dialog itself.
  function printReport() {
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    document.body.appendChild(frame);

    const frameDoc = frame.contentWindow?.document;
    if (!frameDoc) {
      frame.remove();
      toast.error("Unable to prepare the report for printing.");
      return;
    }
    frameDoc.open();
    frameDoc.write(buildPrintHtml(start, end, report, hospitalName, hospitalLogo));
    frameDoc.close();

    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) {
        frame.remove();
        return;
      }
      win.addEventListener("afterprint", () => frame.remove(), { once: true });
      win.focus();
      win.print();
    };
  }

  const servicePieData = serviceRows
    .map((row) => ({ name: row.label, value: report.totals[row.key] ?? 0, color: row.color }))
    .filter((slice) => slice.value > 0);
  // `key` stays unique per row (so the chart's category axis never collapses two
  // same-named patients into one tick) while `name` — shown via the YAxis
  // tickFormatter below — is what the axis actually prints.
  const activityChartData = report.activity.map((row) => ({ key: `${row.patient}-${row.id}`, name: row.patient, amount: row.amount, type: row.type, detail: row.detail }));

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
            <Heading size="lg" letterSpacing="-0.04em" color="#0e2420">Billing & Reports</Heading>
          </Box>
        </HStack>
        <HStack gap="3">
          <Button variant="outline" borderColor="#c8dad5" color="#126b68" bg="white" borderRadius="8px" onClick={printReport}>
            <FontAwesomeIcon icon={faPrint} />
            &nbsp; Print PDF
          </Button>
          <Button
            bg="linear-gradient(135deg, #1a8070 0%, #0f5a52 100%)"
            color="white"
            borderRadius="9px"
            fontWeight="700"
            boxShadow="0 3px 12px rgba(26,128,112,0.28)"
            _hover={{ boxShadow: "0 5px 20px rgba(26,128,112,0.42)", transform: "translateY(-1px)" }}
            _active={{ transform: "translateY(0)" }}
            transition="all 0.18s ease"
            onClick={() => void downloadExcel()}
            loading={downloading}
          >
            <FontAwesomeIcon icon={faDownload} />
            &nbsp; Download Excel
          </Button>
        </HStack>
      </Flex>

      {/* Main Content */}
      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>
        {/* Date filter */}
        <Flex
          justify="space-between"
          align={{ base: "start", md: "center" }}
          direction={{ base: "column", md: "row" }}
          gap="4"
          mb="7"
        >
          <Box>
            <Text fontWeight="700" mt="1">{start === end ? start : `${start} to ${end}`}</Text>
          </Box>
          <VStack gap="3" align="flex-end">
            <HStack gap="2">
              {(["daily", "weekly", "monthly"] as const).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={period === p ? "solid" : "outline"}
                  bg={period === p ? "linear-gradient(135deg, #1a8070 0%, #0f5a52 100%)" : "white"}
                  color={period === p ? "white" : "#3e5e58"}
                  borderColor={period === p ? "transparent" : "#dbe5e1"}
                  borderRadius="8px"
                  fontWeight="700"
                  boxShadow={period === p ? "0 2px 8px rgba(26,128,112,0.25)" : "none"}
                  onClick={() => changePeriod(p)}
                >
                  {p === "daily" ? "Today" : p.charAt(0).toUpperCase() + p.slice(1)}
                </Button>
              ))}
              <Button
                size="sm"
                variant={period === "custom" ? "solid" : "outline"}
                bg={period === "custom" ? "linear-gradient(135deg, #1a8070 0%, #0f5a52 100%)" : "white"}
                color={period === "custom" ? "white" : "#3e5e58"}
                borderColor={period === "custom" ? "transparent" : "#dbe5e1"}
                borderRadius="8px"
                fontWeight="700"
                boxShadow={period === "custom" ? "0 2px 8px rgba(26,128,112,0.25)" : "none"}
                onClick={() => setPeriod("custom")}
              >
                Custom
              </Button>
            </HStack>

            {period === "custom" && (
              <HStack bg="white" border="1px solid #dbe5e1" borderRadius="8px" p="2" flexWrap="wrap">
                <Text fontSize="sm">From</Text>
                <DateInput variant="flushed" value={start} onChange={(e) => setStart(e.target.value)} w="130px" />
                <Text fontSize="sm">to</Text>
                <DateInput variant="flushed" value={end} onChange={(e) => setEnd(e.target.value)} w="130px" />
                <Button
                  size="sm"
                  bg="linear-gradient(135deg, #1a8070 0%, #0f5a52 100%)"
                  color="white"
                  borderRadius="8px"
                  fontWeight="700"
                  boxShadow="0 2px 8px rgba(26,128,112,0.25)"
                  onClick={() => void load()}
                  loading={loading}
                >
                  Apply
                </Button>
              </HStack>
            )}
          </VStack>
        </Flex>

        {error && (
          <Text bg="#fbecef" color="#a34258" borderRadius="8px" p="3" mb="5">{error}</Text>
        )}

        {/* KPI Cards */}
        <Grid templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }} gap="4" mb="6">
          <StatCard compact label="Total collected (gross)" value={money(report.collected)} icon={faArrowTrendUp} color="#22633e" />
          <StatCard compact label="Doctor share" value={money(report.doctorShare)} icon={faUserDoctor} color="#4a3aa7" footnote={`${money(report.doctorPayouts)} paid out so far`} />
          <StatCard compact label="Total expenses" value={money(report.totalExpenses)} icon={faCoins} color="#b26732" />
          <StatCard compact label="Net revenue (hospital)" value={money(report.netRevenue)} icon={faSackDollar} color="#22633e" />
        </Grid>

        {/* Charts */}
        <Grid templateColumns={{ base: "1fr", lg: "0.8fr 1.2fr" }} gap="6">
          {/* Income by service */}
          <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
            <Box p="5" borderBottom="1px solid #edf2f0">
              <HStack gap="3">
                <Flex w="32px" h="32px" bg="#e9f1ef" color="#126b68" borderRadius="8px" align="center" justify="center">
                  <FontAwesomeIcon icon={faFileInvoiceDollar} />
                </Flex>
                <Heading size="sm">Income by service</Heading>
              </HStack>
            </Box>
            <Box p="5">
              {servicePieData.length === 0 ? (
                <Text py="16" textAlign="center" color="#77908b" fontSize="sm">No income in this range.</Text>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <Pie
                      data={servicePieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={62}
                      outerRadius={92}
                      paddingAngle={servicePieData.length > 1 ? 3 : 0}
                      stroke="#ffffff"
                      strokeWidth={2}
                    >
                      {servicePieData.map((slice) => (
                        <Cell key={slice.name} fill={slice.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      labelStyle={{ color: "#123d3b", fontWeight: 700 }}
                      formatter={(value) => [money(Number(value)), "Collected"]}
                    />
                    <Legend
                      verticalAlign="bottom"
                      align="center"
                      iconType="circle"
                      formatter={(value) => <span style={{ color: "#3e5e58", fontSize: 12 }}>{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Box>
          </Box>

          {/* Transaction detail */}
          <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
            <Box p="5" borderBottom="1px solid #edf2f0">
              <HStack gap="3">
                <Flex w="32px" h="32px" bg="#e9f1ef" color="#126b68" borderRadius="8px" align="center" justify="center">
                  <FontAwesomeIcon icon={faReceipt} />
                </Flex>
                <Box>
                  <Heading size="sm">Paid transaction detail</Heading>
                </Box>
              </HStack>
            </Box>
            <Box p="5">
              {activityChartData.length === 0 ? (
                <Text py="16" textAlign="center" color="#77908b" fontSize="sm">No transactions in this range.</Text>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={activityChartData} margin={{ top: 24, right: 12, left: 4, bottom: 44 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e1e0d9" vertical={false} />
                    <XAxis
                      dataKey="key"
                      tick={chartAxisTick}
                      axisLine={{ stroke: "#c3c2b7" }}
                      tickLine={false}
                      interval={0}
                      angle={-35}
                      textAnchor="end"
                      height={60}
                      tickFormatter={(_value, index) => activityChartData[index]?.name ?? ""}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={chartYAxisTick}
                      axisLine={false}
                      tickLine={false}
                      width={54}
                      tickFormatter={(value) => compactMoney(Number(value))}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(18,107,104,0.06)" }}
                      contentStyle={chartTooltipStyle}
                      labelStyle={{ color: "#123d3b", fontWeight: 700 }}
                      labelFormatter={(_label, payloadArr) => (payloadArr?.[0]?.payload as { name?: string } | undefined)?.name ?? ""}
                      formatter={(value, _name, item) => {
                        const payload = item?.payload as { type?: string; detail?: string } | undefined;
                        return [`${money(Number(value))} · ${payload?.type ?? ""}`, payload?.detail ?? "Amount"];
                      }}
                    />
                    <Bar dataKey="amount" name="Amount" fill="#126b68" radius={[4, 4, 0, 0]} maxBarSize={40}>
                      <LabelList dataKey="amount" position="top" formatter={(value: unknown) => money(Number(value))} style={{ fontSize: 11, fontWeight: 700, fill: "#123d3b" }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Box>
          </Box>
        </Grid>
      </Box>
    </Box>
  );
}
