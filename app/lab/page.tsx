"use client";

import { useEffect, useState } from "react";
import { usePolling } from "../use-polling";
import { Box, Button, Flex, Grid, HStack, Heading, Input, NativeSelect, Text, VStack } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartColumn,
  faCheckDouble,
  faClipboardList,
  faFlaskVial,
  faHourglassHalf,
  faListCheck,
  faMoneyBillWave,
} from "@fortawesome/free-solid-svg-icons";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "react-toastify";
import { StatCard } from "../stat-card";

type ResultItem = { id: number; name: string; done: boolean; resultUploadedAt: string | null };
type ResultReceipt = {
  id: number;
  receiptNumber: string;
  module: string;
  moduleToken: number;
  resultStatus: "PENDING" | "DONE";
  createdAt: string;
  printedAt: string | null;
  patient: { name: string; mrNumber: string };
  doctor: { name: string };
  items: ResultItem[];
  payments: { amount: string; method: string; status: string }[];
};

function toDateStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const money = (value: number) => `PKR ${value.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;

type StatsPeriod = "today" | "weekly" | "monthly" | "custom";

function statsPeriodRange(period: "today" | "weekly" | "monthly") {
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

const statsPeriodLabel: Record<StatsPeriod, string> = {
  today: "Today",
  weekly: "This Week",
  monthly: "This Month",
  custom: "In Range",
};

const chartTooltipStyle = { borderRadius: 8, border: "1px solid #e1e9e6", fontSize: 12, boxShadow: "0 8px 20px rgba(18,59,59,0.12)" };
const chartAxisTick = { fontSize: 12, fill: "#898781" };
const chartYAxisTick = { fontSize: 12, fill: "#3e5e58", fontWeight: 600 };

// Same fixed categorical order used for pie/bar charts elsewhere in the app (Income by
// Service, Medical Store reports), kept consistent app-wide rather than generating hues.
const categoricalPalette = ["#dce96f", "#7fb9a8", "#5fa8c9", "#9b8cd6", "#e0a45f", "#e084a0", "#e06c6c"];

type ReceiptsPeriod = "weekly" | "monthly" | "yearly";

const receiptsPeriodCopy: Record<ReceiptsPeriod, { title: string }> = {
  weekly: { title: "Receipts — Last 7 Days" },
  monthly: { title: "Receipts — Last 30 Days" },
  yearly: { title: "Receipts — Last 12 Months" },
};

function buildReceiptsTrend(receipts: ResultReceipt[], period: ReceiptsPeriod) {
  if (period === "yearly") {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date();
      d.setDate(1); // pin to day 1 first, so subtracting months never rolls into the wrong month
      d.setMonth(d.getMonth() - (11 - i));
      const label = d.toLocaleDateString("en-PK", { month: "short" });
      return {
        label,
        axisText: label,
        count: receipts.filter((r) => {
          const rd = new Date(r.createdAt);
          return rd.getFullYear() === d.getFullYear() && rd.getMonth() === d.getMonth();
        }).length,
      };
    });
  }
  if (period === "monthly") {
    // Day-by-day bars. `label` stays unique per bar (so the chart's category axis
    // never collapses same-named ticks and hover/tooltip stays correctly aligned
    // to each bar) while `axisText` — shown only once per month, at its first bar —
    // is what the axis actually prints.
    let lastMonth = -1;
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      const key = toDateStr(d);
      const month = d.getMonth();
      const showMonthLabel = month !== lastMonth;
      lastMonth = month;
      return {
        label: d.toLocaleDateString("en-PK", { day: "2-digit", month: "short" }),
        axisText: showMonthLabel ? d.toLocaleDateString("en-PK", { month: "short" }) : "",
        count: receipts.filter((r) => toDateStr(new Date(r.createdAt)) === key).length,
      };
    });
  }
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = toDateStr(d);
    const label = d.toLocaleDateString("en-PK", { weekday: "short" });
    return {
      label,
      axisText: label,
      count: receipts.filter((r) => toDateStr(new Date(r.createdAt)) === key).length,
    };
  });
}

export default function LabDashboardPage() {
  const [receipts, setReceipts] = useState<ResultReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [receiptsPeriod, setReceiptsPeriod] = useState<ReceiptsPeriod>("weekly");
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>("today");
  const [customStart, setCustomStart] = useState(() => toDateStr(new Date()));
  const [customEnd, setCustomEnd] = useState(() => toDateStr(new Date()));

  function changeStatsPeriod(next: "today" | "weekly" | "monthly") {
    const range = statsPeriodRange(next);
    setStatsPeriod(next);
    setCustomStart(range.start);
    setCustomEnd(range.end);
  }

  // silent=true is used for the background auto-refresh poll — no loading spinner,
  // no error toast spam, just quietly keep the stats current.
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

  // Pending backlog is a "right now" snapshot, not tied to any date range — it stays as-is
  // regardless of which period is selected below.
  const pendingItems = receipts.flatMap((r) => r.items.filter((item) => !item.done).map((item) => ({ ...item, receipt: r })));
  const pendingReceipts = receipts.filter((r) => r.resultStatus === "PENDING");

  const inRange = (dateStr: string) => {
    const d = toDateStr(new Date(dateStr));
    return d >= customStart && d <= customEnd;
  };
  const receiptsInRange = receipts.filter((r) => inRange(r.createdAt));
  const completedInRange = receipts.flatMap((r) => r.items).filter((item) => item.resultUploadedAt && inRange(item.resultUploadedAt));
  const totalTestsInRange = receiptsInRange.reduce((sum, r) => sum + r.items.length, 0);
  const cashCollectedInRange = receiptsInRange.reduce(
    (sum, r) => sum + r.payments.filter((p) => p.method === "CASH" && p.status === "PAID").reduce((s, p) => s + Number(p.amount), 0),
    0
  );
  const periodSuffix = statsPeriodLabel[statsPeriod];

  const stats = [
    { label: "Pending Tests", value: pendingItems.length, icon: faHourglassHalf, color: "#b26732" },
    { label: `Completed ${periodSuffix}`, value: completedInRange.length, icon: faCheckDouble, color: "#22633e" },
    { label: `New Receipts ${periodSuffix}`, value: receiptsInRange.length, icon: faClipboardList, color: "#3e5e58" },
    { label: `Tests Ordered ${periodSuffix}`, value: totalTestsInRange, icon: faListCheck, color: "#123d3b" },
    { label: `Cash Collected ${periodSuffix}`, value: money(cashCollectedInRange), icon: faMoneyBillWave, color: "#126b68" },
  ];

  const receiptsTrend = buildReceiptsTrend(receipts, receiptsPeriod);

  const doneUnprinted = receipts.filter((r) => r.resultStatus === "DONE" && !r.printedAt).length;

  const statusPieData = [
    { name: "Pending", value: pendingReceipts.length, color: "#b26732" },
    { name: "Done", value: receipts.length - pendingReceipts.length, color: "#22633e" },
    { name: "Unprinted", value: doneUnprinted, color: "#a34258" },
  ].filter((slice) => slice.value > 0);

  // Test-type breakdown for the selected period — how many of each distinct test was
  // ordered. Top 7 by count get their own bar; anything past that folds into "Other" so
  // the chart never outgrows the fixed 7-color categorical palette.
  const testTypeCounts = new Map<string, number>();
  for (const item of receiptsInRange.flatMap((r) => r.items)) {
    testTypeCounts.set(item.name, (testTypeCounts.get(item.name) ?? 0) + 1);
  }
  const sortedTestTypes = [...testTypeCounts.entries()].sort((a, b) => b[1] - a[1]);
  const topTestTypes = sortedTestTypes.slice(0, 7);
  const otherTestTypes = sortedTestTypes.slice(7);
  const testTypeData = topTestTypes.map(([name, count], i) => ({ name, count, color: categoricalPalette[i] }));
  if (otherTestTypes.length > 0) {
    testTypeData.push({ name: "Other", count: otherTestTypes.reduce((sum, [, count]) => sum + count, 0), color: "#9aa8a4" });
  }

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
        px={{ base: "20px", md: "42px" }}
      >
        <Box>
          <Heading size="lg" letterSpacing="-0.04em" color="#0e2420">
            Laboratory Dashboard
          </Heading>
        </Box>
      </Flex>

      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>
        <VStack align="flex-end" gap="3" mb="5">
          <HStack gap="2">
            {(["today", "weekly", "monthly"] as const).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={statsPeriod === p ? "solid" : "outline"}
                bg={statsPeriod === p ? "linear-gradient(135deg, #1a8070 0%, #0f5a52 100%)" : "white"}
                color={statsPeriod === p ? "white" : "#3e5e58"}
                borderColor={statsPeriod === p ? "transparent" : "#c8dad5"}
                borderRadius="8px"
                fontWeight="700"
                boxShadow={statsPeriod === p ? "0 2px 8px rgba(26,128,112,0.25)" : "none"}
                onClick={() => changeStatsPeriod(p)}
              >
                {p === "today" ? "Today" : p.charAt(0).toUpperCase() + p.slice(1)}
              </Button>
            ))}
            <Button
              size="sm"
              variant={statsPeriod === "custom" ? "solid" : "outline"}
              bg={statsPeriod === "custom" ? "linear-gradient(135deg, #1a8070 0%, #0f5a52 100%)" : "white"}
              color={statsPeriod === "custom" ? "white" : "#3e5e58"}
              borderColor={statsPeriod === "custom" ? "transparent" : "#c8dad5"}
              borderRadius="8px"
              fontWeight="700"
              boxShadow={statsPeriod === "custom" ? "0 2px 8px rgba(26,128,112,0.25)" : "none"}
              onClick={() => setStatsPeriod("custom")}
            >
              Custom
            </Button>
          </HStack>

          {statsPeriod === "custom" && (
            <HStack gap="2" flexWrap="wrap">
              <Input size="sm" type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} w="150px" borderRadius="8px" bg="white" />
              <Text fontSize="sm" color="#77908b">to</Text>
              <Input size="sm" type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} w="150px" borderRadius="8px" bg="white" />
            </HStack>
          )}
        </VStack>

        <Grid templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(5, 1fr)" }} gap="4" mb="8">
          {stats.map((stat) => (
            <StatCard key={stat.label} label={stat.label} value={loading ? "…" : stat.value} icon={stat.icon} color={stat.color} />
          ))}
        </Grid>

        <Grid templateColumns={{ base: "1fr", lg: "1.1fr 0.9fr" }} gap="6">
          <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
            <Box p="5" borderBottom="1px solid #edf2f0">
              <Flex align="center" justify="space-between" gap="3" flexWrap="wrap">
                <Flex align="center" gap="3">
                  <Flex w="32px" h="32px" bg="#e9f1ef" color="#126b68" borderRadius="8px" align="center" justify="center">
                    <FontAwesomeIcon icon={faClipboardList} size="sm" />
                  </Flex>
                  <Box>
                    <Heading size="sm">{receiptsPeriodCopy[receiptsPeriod].title}</Heading>
                  </Box>
                </Flex>
                <NativeSelect.Root size="sm" width="120px">
                  <NativeSelect.Field
                    value={receiptsPeriod}
                    onChange={(event) => setReceiptsPeriod(event.target.value as ReceiptsPeriod)}
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </NativeSelect.Field>
                </NativeSelect.Root>
              </Flex>
            </Box>
            <Box p="5">
              {!loading && receipts.length === 0 ? (
                <Text py="16" textAlign="center" color="#77908b" fontSize="sm">No receipts yet to chart.</Text>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={receiptsTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e1e0d9" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={chartAxisTick}
                      axisLine={{ stroke: "#c3c2b7" }}
                      tickLine={false}
                      interval={0}
                      tickFormatter={(_value, index) => receiptsTrend[index]?.axisText ?? ""}
                    />
                    <YAxis allowDecimals={false} tick={chartYAxisTick} axisLine={false} tickLine={false} width={40} />
                    <Tooltip
                      cursor={{ fill: "rgba(18,107,104,0.06)" }}
                      contentStyle={chartTooltipStyle}
                      labelStyle={{ color: "#123d3b", fontWeight: 700 }}
                    />
                    <Bar dataKey="count" name="Receipts" fill="#126b68" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Box>
          </Box>

          <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
            <Box p="5" borderBottom="1px solid #edf2f0">
              <Flex align="center" gap="3">
                <Flex w="32px" h="32px" bg="#f8e8d8" color="#b26732" borderRadius="8px" align="center" justify="center">
                  <FontAwesomeIcon icon={faFlaskVial} size="sm" />
                </Flex>
                <Box>
                  <Heading size="sm">Result & Print Status</Heading>
                </Box>
              </Flex>
            </Box>
            <Box p="5">
              {!loading && statusPieData.length === 0 ? (
                <Text py="16" textAlign="center" color="#77908b" fontSize="sm">No receipts yet to chart.</Text>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <Pie
                      data={statusPieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={62}
                      outerRadius={92}
                      paddingAngle={statusPieData.length > 1 ? 3 : 0}
                      stroke="#ffffff"
                      strokeWidth={2}
                    >
                      {statusPieData.map((slice) => (
                        <Cell key={slice.name} fill={slice.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: "#123d3b", fontWeight: 700 }} />
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
        </Grid>

        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden" mt="6">
          <Box p="5" borderBottom="1px solid #edf2f0">
            <Flex align="center" gap="3">
              <Flex w="32px" h="32px" bg="#e9f1ef" color="#126b68" borderRadius="8px" align="center" justify="center">
                <FontAwesomeIcon icon={faChartColumn} size="sm" />
              </Flex>
              <Box>
                <Heading size="sm">Test Type Analytics</Heading>
              </Box>
            </Flex>
          </Box>
          <Box p="5">
            {!loading && testTypeData.length === 0 ? (
              <Text py="16" textAlign="center" color="#77908b" fontSize="sm">No tests ordered in this period.</Text>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={testTypeData} margin={{ top: 8, right: 12, left: 4, bottom: 32 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e1e0d9" vertical={false} />
                  <XAxis dataKey="name" tick={chartAxisTick} axisLine={{ stroke: "#c3c2b7" }} tickLine={false} angle={-30} textAnchor="end" interval={0} />
                  <YAxis allowDecimals={false} tick={chartYAxisTick} axisLine={false} tickLine={false} width={40} />
                  <Tooltip
                    cursor={{ fill: "rgba(18,107,104,0.06)" }}
                    contentStyle={chartTooltipStyle}
                    labelStyle={{ color: "#123d3b", fontWeight: 700 }}
                    formatter={(value) => [`${value} test(s)`, "Ordered"]}
                  />
                  <Bar dataKey="count" name="Tests" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {testTypeData.map((row) => (
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
