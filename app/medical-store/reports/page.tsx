"use client";

import { useEffect, useState } from "react";
import { Box, Button, Flex, Grid, Heading, HStack, Input, Table, Text, VStack } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChartLine, faCoins, faDownload, faFileInvoiceDollar, faPrint, faRotateLeft, faWarehouse } from "@fortawesome/free-solid-svg-icons";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "react-toastify";
import { StatCard } from "../../stat-card";

// Same fixed categorical order used for the Income-by-Service pie on the main
// Reports page and the Stock Status pie on the Medical Store dashboard — kept
// consistent app-wide rather than generating new hues per chart.
const categoricalPalette = ["#dce96f", "#7fb9a8", "#5fa8c9", "#9b8cd6", "#e0a45f", "#e084a0", "#e06c6c"];
const chartTooltipStyle = { borderRadius: 8, border: "1px solid #e1e9e6", fontSize: 12, boxShadow: "0 8px 20px rgba(18,59,59,0.12)" };
const chartAxisTick = { fontSize: 12, fill: "#898781" };

type Report = {
  totals: {
    salesRevenue: number;
    salesDiscount: number;
    salesCount: number;
    saleReturnsRefund: number;
    purchasesCost: number;
    purchasesCount: number;
    purchaseReturnsAmount: number;
    netRevenue: number;
    stockValue: number;
    costOfGoodsSold: number;
    grossProfit: number;
    profitMarginPercent: number;
    linesWithoutCost: number;
    revenueWithoutCost: number;
  };
  profitByMedicine: { medicineName: string; quantitySold: number; revenue: number; cost: number; profit: number; marginPercent: number }[];
  topMedicines: { medicineName: string; quantitySold: number; revenue: number }[];
  byCategory: { category: string; quantitySold: number; revenue: number }[];
  bySupplier: { supplierName: string; totalCost: number; purchaseCount: number }[];
};

const money = (value: number) => `PKR ${value.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
const compactMoney = (value: number) => {
  if (value >= 100000) return `${(value / 100000).toFixed(value % 100000 === 0 ? 0 : 1)}L`;
  if (value >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}K`;
  return String(value);
};

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

// Same letterhead/table print style as the Management Billing & Reports PDF (app/reports/page.tsx).
function buildPrintHtml(start: string, end: string, report: Report, hospitalName: string, hospitalLogo: string): string {
  const clinicName = escapeHtml(hospitalName || "CareLedger Clinic");
  const t = report.totals;
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
    ".note{padding:10px 16px;font-size:11px;color:#8a5a2b;background:#fdf3e6}",
    ".totalrow td{border-top:2px solid #333;font-weight:800;color:#111;background:#f5f5f5}",
    ".empty{padding:20px;text-align:center;color:#777;font-size:12px}",
    ".footer{margin-top:22px;font-size:10.5px;color:#999;text-align:center;border-top:1px solid #ddd;padding-top:12px}",
    "@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}",
  ].join("");

  const row = (cells: string[], numFrom: number) =>
    "<tr>" + cells.map((c, i) => (i >= numFrom ? "<td class='num'>" + c + "</td>" : "<td>" + c + "</td>")).join("") + "</tr>";
  const table = (headers: string[], numFrom: number, rows: string[][], emptyText: string, totalRow?: string[]) => {
    if (rows.length === 0) return "<div class='empty'>" + emptyText + "</div>";
    const head = "<tr>" + headers.map((h, i) => "<th" + (i >= numFrom ? " style='text-align:right'" : "") + ">" + h + "</th>").join("") + "</tr>";
    const total = totalRow ? row(totalRow, numFrom).replace("<tr>", "<tr class='totalrow'>") : "";
    return "<table><thead>" + head + "</thead><tbody>" + rows.map((r) => row(r, numFrom)).join("") + total + "</tbody></table>";
  };
  const card = (title: string, body: string) => "<div class='card'><div class='card-head'><h2>" + title + "</h2></div>" + body + "</div>";
  const sum = <T,>(list: T[], pick: (item: T) => number) => list.reduce((s, item) => s + pick(item), 0);

  const summaryTable = table(["Metric", "Amount"], 1, [
    ["Sales revenue", money(t.salesRevenue)],
    ["Sale returns (refunded)", money(t.saleReturnsRefund)],
    ["Discounts given", money(t.salesDiscount)],
    ["Purchases cost", money(t.purchasesCost)],
    ["Purchase returns", money(t.purchaseReturnsAmount)],
    ["Current stock value", money(t.stockValue)],
  ], "", ["Net revenue (after sale returns)", money(t.netRevenue)]);

  const profitTable = table(["Metric", "Amount"], 1, [
    ["Cost of medicines sold", money(t.costOfGoodsSold)],
    ["Profit margin", t.profitMarginPercent.toFixed(1) + "%"],
  ], "", ["Profit", money(t.grossProfit)]) +
    (t.linesWithoutCost > 0
      ? "<div class='note'>" + t.linesWithoutCost + " sold item(s) (" + money(t.revenueWithoutCost) + ") were sold before cost price was saved, so they are not included in profit.</div>"
      : "");

  const p = report.profitByMedicine;
  const profitByMedicineTable = table(
    ["Medicine", "Qty sold", "Sold for", "Cost", "Profit", "Margin"], 1,
    p.map((m) => [escapeHtml(m.medicineName), String(m.quantitySold), money(m.revenue), money(m.cost), money(m.profit), m.marginPercent.toFixed(1) + "%"]),
    "No sales in this period.",
    ["Total", String(sum(p, (m) => m.quantitySold)), money(sum(p, (m) => m.revenue)), money(sum(p, (m) => m.cost)), money(sum(p, (m) => m.profit)), ""],
  );
  const topTable = table(["Medicine", "Qty sold", "Revenue"], 1,
    report.topMedicines.map((m) => [escapeHtml(m.medicineName), String(m.quantitySold), money(m.revenue)]), "No sales in this period.");
  const categoryTable = table(["Category", "Qty sold", "Revenue"], 1,
    report.byCategory.map((c) => [escapeHtml(c.category), String(c.quantitySold), money(c.revenue)]), "No sales in this period.",
    ["Total", String(sum(report.byCategory, (c) => c.quantitySold)), money(sum(report.byCategory, (c) => c.revenue))]);
  const supplierTable = table(["Supplier", "Purchases", "Total cost"], 1,
    report.bySupplier.map((s) => [escapeHtml(s.supplierName), String(s.purchaseCount), money(s.totalCost)]), "No purchases in this period.",
    ["Total", String(sum(report.bySupplier, (s) => s.purchaseCount)), money(sum(report.bySupplier, (s) => s.totalCost))]);

  const generated = new Date().toLocaleString("en-PK");
  const logoImg = hospitalLogo ? "<img src='" + hospitalLogo + "' alt='logo' />" : "";

  return [
    "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'>",
    "<title>" + clinicName + " Medical Store Report " + start + " to " + end + "</title>",
    "<style>" + css + "</style>",
    "</head><body>",
    "<div class='letterhead'>",
    "<div class='letterhead-id'>" + logoImg + "<div><h1>" + clinicName + "</h1><p>Medical Store Report</p></div></div>",
    "<div class='letterhead-meta'>Period: <strong>" + start + " to " + end + "</strong><br>Generated: " + generated + "<br>" + t.salesCount + " sales · " + t.purchasesCount + " purchases</div>",
    "</div>",
    card("Summary", summaryTable),
    card("Profit", profitTable),
    card("Profit by Medicine", profitByMedicineTable),
    card("Top-Selling Medicines", topTable),
    card("Sales by Category", categoryTable),
    card("Purchases by Supplier", supplierTable),
    "<div class='footer'>" + clinicName + " &nbsp;&middot;&nbsp; Confidential &nbsp;&middot;&nbsp; " + start + " to " + end + "</div>",
    "</body></html>",
  ].join("");
}

export default function MedicalStoreReportsPage() {
  const [period, setPeriod] = useState<Period>("daily");
  const [start, setStart] = useState(toDateStr(new Date()));
  const [end, setEnd] = useState(toDateStr(new Date()));
  const [report, setReport] = useState<Report | null>(null);
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

  async function downloadExcel() {
    setDownloading(true);
    try {
      const response = await fetch(`/api/medical-store/reports/export?start=${start}&end=${end}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error((data as { error?: string }).error ?? "Failed to generate Excel report.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `medical-store-report-${start}-to-${end}.xlsx`;
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

  // Prints from a hidden iframe (same as the Management report) — only the print dialog is shown,
  // where "Save as PDF" gives the PDF file.
  function printReport() {
    if (!report) {
      toast.error("The report is still loading.");
      return;
    }
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

  async function load(rangeStart = start, rangeEnd = end) {
    setLoading(true);
    try {
      const res = await fetch(`/api/medical-store/reports?start=${rangeStart}&end=${rangeEnd}`);
      const data = await res.json();
      if (res.ok) setReport(data);
      else toast.error(data.error ?? "Unable to load the report.");
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changePeriod(next: "daily" | "weekly" | "monthly") {
    const range = periodRange(next);
    setPeriod(next);
    setStart(range.start);
    setEnd(range.end);
    void load(range.start, range.end);
  }

  const t = report?.totals;

  // Top 6 medicines get their own slice; anything past that folds into "Other" so the
  // pie never exceeds the fixed 7-color categorical palette (topMedicines can be up to 15).
  const topMedicinesPieData = (() => {
    if (!report || report.topMedicines.length === 0) return [];
    const shown = report.topMedicines.slice(0, 6);
    const rest = report.topMedicines.slice(6);
    const rows = shown.map((m, i) => ({ name: m.medicineName, value: m.revenue, qty: m.quantitySold, color: categoricalPalette[i] }));
    if (rest.length > 0) {
      rows.push({
        name: "Other",
        value: rest.reduce((sum, m) => sum + m.revenue, 0),
        qty: rest.reduce((sum, m) => sum + m.quantitySold, 0),
        color: categoricalPalette[6],
      });
    }
    return rows.filter((r) => r.value > 0);
  })();

  const byCategoryBarData = report?.byCategory.map((c, i) => ({
    name: c.category,
    revenue: c.revenue,
    qty: c.quantitySold,
    color: categoricalPalette[i % categoricalPalette.length],
  })) ?? [];

  // Suppliers are unbounded — cap to the top 8 by cost (already sorted desc by the API),
  // matching the same "top 8" cap the Medical Store dashboard uses for its bar charts.
  const bySupplierBarData = (report?.bySupplier.slice(0, 8) ?? []).map((s, i) => ({
    name: s.supplierName,
    totalCost: s.totalCost,
    count: s.purchaseCount,
    color: categoricalPalette[i % categoricalPalette.length],
  }));

  const stats = [
    { label: "Sales Revenue", value: t ? money(t.salesRevenue) : "…", icon: faChartLine, color: "#126b68" },
    { label: "Net Revenue (after sale returns)", value: t ? money(t.netRevenue) : "…", icon: faCoins, color: "#22633e" },
    { label: "Purchases Cost", value: t ? money(t.purchasesCost) : "…", icon: faFileInvoiceDollar, color: "#b26732" },
    { label: "Purchase Returns", value: t ? money(t.purchaseReturnsAmount) : "…", icon: faRotateLeft, color: "#a34258" },
    { label: "Current Stock Value", value: t ? money(t.stockValue) : "…", icon: faWarehouse, color: "#123d3b" },
    { label: "Discounts Given", value: t ? money(t.salesDiscount) : "…", icon: faCoins, color: "#77908b" },
  ];

  return (
    <Box minH="100vh" bg="#f5f7f8" color="#17252b">
      <Flex as="header" minH="78px" bg="white" borderBottom="1px solid #e2e9e6" align="center" justify="space-between" gap="3" flexWrap="wrap" py="3" px={{ base: "20px", md: "42px" }}>
        <Box>
          <Heading size="lg" letterSpacing="-0.04em">
            Reports
          </Heading>
        </Box>
        <HStack gap="3">
          <Button variant="outline" borderColor="#c8dad5" color="#126b68" bg="white" borderRadius="8px" onClick={printReport} disabled={loading || !report}>
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

      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>
        <Flex justify="flex-end" mb="6">
          <VStack gap="3" align="flex-end">
            <HStack gap="2">
              {(["daily", "weekly", "monthly"] as const).map((p) => (
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
                  {p === "daily" ? "Today" : p.charAt(0).toUpperCase() + p.slice(1)}
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
                <Input size="sm" type="date" value={start} onChange={(e) => setStart(e.target.value)} w="150px" borderRadius="8px" bg="white" />
                <Text fontSize="sm" color="#77908b">to</Text>
                <Input size="sm" type="date" value={end} onChange={(e) => setEnd(e.target.value)} w="150px" borderRadius="8px" bg="white" />
                <Button
                  size="sm"
                  bg="linear-gradient(135deg, #1a8070 0%, #0f5a52 100%)"
                  color="white"
                  borderRadius="8px"
                  fontWeight="700"
                  boxShadow="0 2px 8px rgba(26,128,112,0.25)"
                  loading={loading}
                  onClick={() => void load()}
                >
                  Apply
                </Button>
              </HStack>
            )}
          </VStack>
        </Flex>

        <Grid templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" }} gap="4" mb="8">
          {stats.map((stat) => (
            <StatCard key={stat.label} label={stat.label} value={loading ? "…" : stat.value} icon={stat.icon} color={stat.color} />
          ))}
        </Grid>

        <Heading size="md" mb="1" letterSpacing="-0.02em">Profit</Heading>
        <Text fontSize="sm" color="#607d76" mb="4">
          Profit = what you sold medicines for, minus what you paid the supplier for them, minus discounts. Returned items are taken out.
        </Text>
        <Grid templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }} gap="4" mb="4">
          <StatCard label="Sales (with known cost)" value={loading || !t ? "…" : money(t.costOfGoodsSold + t.grossProfit + t.salesDiscount)} icon={faChartLine} color="#126b68" />
          <StatCard label="Cost of medicines sold" value={loading || !t ? "…" : money(t.costOfGoodsSold)} icon={faFileInvoiceDollar} color="#b26732" />
          <StatCard
            label="Profit"
            value={loading || !t ? "…" : money(t.grossProfit)}
            icon={faCoins}
            color={t && t.grossProfit < 0 ? "#a34258" : "#22633e"}
            valueColor={t && t.grossProfit < 0 ? "#a34258" : "#22633e"}
          />
          <StatCard label="Profit margin" value={loading || !t ? "…" : `${t.profitMarginPercent.toFixed(1)}%`} icon={faChartLine} color="#22633e" />
        </Grid>
        {t && t.linesWithoutCost > 0 && (
          <Text fontSize="xs" color="#b26732" bg="#fdf3e6" borderRadius="8px" px="3" py="2" mb="4">
            {t.linesWithoutCost} sold item{t.linesWithoutCost === 1 ? "" : "s"} (PKR {t.revenueWithoutCost.toLocaleString("en-PK")}) were sold before cost price was being saved, so they are not included in profit.
          </Text>
        )}
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden" mb="8">
          <Box p="5" borderBottom="1px solid #edf2f0">
            <Heading size="sm">Profit by Medicine</Heading>
          </Box>
          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>Medicine</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Qty sold</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Sold for</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Cost</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Profit</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Margin</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {!report || report.profitByMedicine.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={6}>
                      <Text py="8" textAlign="center" color="#77908b" fontSize="sm">{loading ? "Loading…" : "No sales in this period."}</Text>
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  report.profitByMedicine.map((m) => (
                    <Table.Row key={m.medicineName}>
                      <Table.Cell fontWeight="700" fontSize="sm">{m.medicineName}</Table.Cell>
                      <Table.Cell textAlign="right" fontSize="sm">{m.quantitySold}</Table.Cell>
                      <Table.Cell textAlign="right" fontSize="sm">{money(m.revenue)}</Table.Cell>
                      <Table.Cell textAlign="right" fontSize="sm">{money(m.cost)}</Table.Cell>
                      <Table.Cell textAlign="right" fontSize="sm" fontWeight="800" color={m.profit < 0 ? "#a34258" : "#22633e"}>{money(m.profit)}</Table.Cell>
                      <Table.Cell textAlign="right" fontSize="sm">{m.marginPercent.toFixed(1)}%</Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table.Root>
          </Box>
        </Box>

        <Grid templateColumns={{ base: "1fr", lg: "1fr 1fr" }} gap="6" mb="6">
          <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
            <Box p="5" borderBottom="1px solid #edf2f0">
              <Heading size="sm">Top-Selling Medicines</Heading>
            </Box>
            <Box p="5">
              {!loading && topMedicinesPieData.length === 0 ? (
                <Text py="16" textAlign="center" color="#77908b" fontSize="sm">No sales in this period.</Text>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <Pie
                      data={topMedicinesPieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={62}
                      outerRadius={92}
                      paddingAngle={topMedicinesPieData.length > 1 ? 3 : 0}
                      stroke="#ffffff"
                      strokeWidth={2}
                    >
                      {topMedicinesPieData.map((slice) => (
                        <Cell key={slice.name} fill={slice.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      labelStyle={{ color: "#123d3b", fontWeight: 700 }}
                      formatter={(value, _name, item) => [`${money(Number(value))} · ${item.payload.qty} sold`, item.payload.name]}
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

          <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
            <Box p="5" borderBottom="1px solid #edf2f0">
              <Heading size="sm">Sales by Category</Heading>
            </Box>
            <Box p="5">
              {!loading && byCategoryBarData.length === 0 ? (
                <Text py="16" textAlign="center" color="#77908b" fontSize="sm">No sales in this period.</Text>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={byCategoryBarData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#edf2f0" />
                    <XAxis type="category" dataKey="name" tick={chartAxisTick} axisLine={false} tickLine={false} />
                    <YAxis type="number" tick={chartAxisTick} tickFormatter={(v) => compactMoney(Number(v))} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      labelStyle={{ color: "#123d3b", fontWeight: 700 }}
                      formatter={(value, _name, item) => [`${money(Number(value))} · ${item.payload.qty} sold`, "Revenue"]}
                    />
                    <Bar dataKey="revenue" radius={[4, 4, 0, 0]} barSize={36}>
                      {byCategoryBarData.map((row) => (
                        <Cell key={row.name} fill={row.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Box>
          </Box>
        </Grid>

        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
          <Box p="5" borderBottom="1px solid #edf2f0">
            <Heading size="sm">Purchases by Supplier</Heading>
          </Box>
          <Box p="5">
            {!loading && bySupplierBarData.length === 0 ? (
              <Text py="16" textAlign="center" color="#77908b" fontSize="sm">No purchases in this period.</Text>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={bySupplierBarData} margin={{ top: 8, right: 12, left: 4, bottom: 32 }}>
                  <CartesianGrid vertical={false} stroke="#edf2f0" />
                  <XAxis type="category" dataKey="name" tick={chartAxisTick} axisLine={false} tickLine={false} angle={-35} textAnchor="end" interval={0} />
                  <YAxis type="number" tick={chartAxisTick} tickFormatter={(v) => compactMoney(Number(v))} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={{ color: "#123d3b", fontWeight: 700 }}
                    formatter={(value, _name, item) => [`${money(Number(value))} · ${item.payload.count} purchases`, "Total Cost"]}
                  />
                  <Bar dataKey="totalCost" radius={[4, 4, 0, 0]} barSize={36}>
                    {bySupplierBarData.map((row) => (
                      <Cell key={row.name} fill={row.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
