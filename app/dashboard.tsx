"use client";
import { DateInput } from "./date-input";

import { useEffect, useState } from "react";
import { Box, Button, Flex, Grid, Heading, HStack, NativeSelect, Text, VStack } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowTrendUp, faBed, faChevronDown, faChartLine, faCoins, faFileInvoiceDollar, faFlaskVial, faSackDollar, faTrashCan, faUserDoctor, faUserGroup, faUsers } from "@fortawesome/free-solid-svg-icons";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "react-toastify";
import { StatCard } from "./stat-card";

const allServices = [
  { key: "OPD", label: "OPD Consultation", color: "#4ade80" },
  { key: "LABORATORY", label: "Laboratory", color: "#2dd4bf" },
  { key: "ECO", label: "ECO", color: "#60a5fa" },
  { key: "ECG", label: "ECG", color: "#a78bfa" },
  { key: "X-RAY", label: "X-Ray", color: "#fb923c" },
  { key: "ULTRASOUND", label: "Ultrasound", color: "#f472b6" },
  { key: "OT", label: "Operation Theater", color: "#f87171" },
  { key: "EMERGENCY", label: "Minor Emergency", color: "#94a3b8" },
  { key: "MEDICAL_STORE", label: "Medical Store", color: "#d4b96a" },
  { key: "OTHER", label: "Other / unlinked", color: "#cbd5d1" },
];
type RevenueHistoryEntry = { createdAt: string; amount: number };
type Summary = {
  totals: Record<string, number>;
  collected: number;
  doctorShare: number;
  doctorPayouts: number;
  doctorRemaining: number;
  doctorEarnedTotal: number;
  doctorPaidTotal: number;
  totalExpenses: number;
  medicineWastage: number;
  supplierRefunds: number;
  netRevenue: number;
  patientsSeen: number;
  patientCount: number;
  doctorCount: number;
  labTestCount: number;
  otCaseCount: number;
  revenueHistory: RevenueHistoryEntry[];
};
const emptySummary: Summary = {
  totals: {},
  collected: 0,
  doctorShare: 0,
  doctorPayouts: 0,
  doctorRemaining: 0,
  doctorEarnedTotal: 0,
  doctorPaidTotal: 0,
  totalExpenses: 0,
  medicineWastage: 0,
  supplierRefunds: 0,
  netRevenue: 0,
  patientsSeen: 0,
  patientCount: 0,
  doctorCount: 0,
  labTestCount: 0,
  otCaseCount: 0,
  revenueHistory: [],
};
const money = (value: number) => `PKR ${value.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
const compactMoney = (val: number) => {
  if (val >= 100000) return `${(val / 100000).toFixed(val % 100000 === 0 ? 0 : 1)}L`;
  if (val >= 1000) return `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}K`;
  return String(val);
};

function toDateStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
const localDate = () => toDateStr(new Date());

type ChartPeriod = "today" | "weekly" | "monthly" | "yearly";

const revenuePeriodCopy: Record<ChartPeriod, { title: string }> = {
  today: { title: "Revenue — Last 7 Days" },
  weekly: { title: "Revenue — Last 7 Days" },
  monthly: { title: "Revenue — Last 30 Days" },
  yearly: { title: "Revenue — Last 12 Months" },
};

function buildRevenueTrend(history: RevenueHistoryEntry[], period: ChartPeriod) {
  if (period === "yearly") {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date();
      d.setDate(1); // pin to day 1 first, so subtracting months never rolls into the wrong month
      d.setMonth(d.getMonth() - (11 - i));
      const label = d.toLocaleDateString("en-PK", { month: "short" });
      return {
        label,
        axisText: label,
        total: history
          .filter((p) => {
            const pd = new Date(p.createdAt);
            return pd.getFullYear() === d.getFullYear() && pd.getMonth() === d.getMonth();
          })
          .reduce((sum, p) => sum + p.amount, 0),
      };
    });
  }
  const days = period === "monthly" ? 30 : 7;
  // `label` stays unique per bar (so the chart's category axis never collapses
  // same-named ticks and hover/tooltip stays correctly aligned to each bar) while
  // `axisText` — shown only once per month, at its first bar, for the 30-day view —
  // is what the axis actually prints.
  let lastMonth = -1;
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const key = toDateStr(d);
    const month = d.getMonth();
    const showMonthLabel = days > 7 && month !== lastMonth;
    lastMonth = month;
    const weekdayLabel = d.toLocaleDateString("en-PK", { weekday: "short" });
    const dateLabel = d.toLocaleDateString("en-PK", { day: "2-digit", month: "short" });
    return {
      label: days > 7 ? dateLabel : weekdayLabel,
      axisText: days > 7 ? (showMonthLabel ? d.toLocaleDateString("en-PK", { month: "short" }) : "") : weekdayLabel,
      total: history.filter((p) => toDateStr(new Date(p.createdAt)) === key).reduce((sum, p) => sum + p.amount, 0),
    };
  });
}

const chartTooltipStyle = {
  borderRadius: 10,
  border: "1px solid rgba(14,36,32,0.08)",
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(14,36,32,0.12)",
  background: "rgba(255,255,255,0.96)",
  backdropFilter: "blur(8px)",
};
const chartAxisTick = { fontSize: 11, fill: "#8aa09a" };
const chartYAxisTick = { fontSize: 11, fill: "#4a7870", fontWeight: 600 };

type Period = "daily" | "weekly" | "monthly" | "custom";

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

export default function Dashboard() {
  const [period, setPeriod] = useState<Period>("daily");
  const [start, setStart] = useState(localDate);
  const [end, setEnd] = useState(localDate);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("today");

  async function loadSummary() {
    setLoading(true);
    try {
      const response = await fetch(`/api/dashboard?start=${start}&end=${end}`);
      const data = await response.json();
      if (response.ok) setSummary(data);
      else toast.error(data.error ?? "Unable to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [end, start]);

  function changePeriod(next: "daily" | "weekly" | "monthly") {
    const range = periodRange(next);
    setPeriod(next);
    setStart(range.start);
    setEnd(range.end);
  }

  const serviceTotal = allServices.reduce((sum, s) => sum + (summary.totals[s.key] ?? 0), 0);
  const allServiceChartData = allServices.map((s) => ({ name: s.label, value: summary.totals[s.key] ?? 0, color: s.color }));
  const revenueTrend = buildRevenueTrend(summary.revenueHistory, chartPeriod);

  return (
    <Flex minH="100vh" bg="#eef2f0" color="#17252b">
      <Box flex="1" minW="0">
        <Flex
          as="header"
          position="sticky"
          top="0"
          zIndex="40"
          h="72px"
          bg="rgba(255,255,255,0.88)"
          style={{ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
          borderBottom="1px solid rgba(14,36,32,0.07)"
          align="center"
          justify="space-between"
          px={{ base: "20px", md: "42px" }}
          boxShadow="0 1px 0 rgba(14,36,32,0.05)"
        >
          <Box>
            <Heading size="lg" letterSpacing="-0.03em" color="#0e2420">Management Dashboard</Heading>
          </Box>
        </Flex>

        <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>
          <Flex
            justify="space-between"
            align={{ base: "start", md: "center" }}
            direction={{ base: "column", md: "row" }}
            gap="4"
            mb="28px"
            flexWrap="wrap"
          >
            <Box>
              <Text fontWeight="700" mt="1">
                {start === end ? start : `${start} to ${end}`}
              </Text>
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
                    borderColor="#dbe5e1"
                    borderRadius="8px"
                    boxShadow={period === p ? "0 2px 8px rgba(26,128,112,0.30)" : "none"}
                    fontWeight={period === p ? "700" : "500"}
                    onClick={() => changePeriod(p)}
                    transition="all 0.15s ease"
                    _hover={{ bg: period === p ? "linear-gradient(135deg, #1a8070 0%, #0f5a52 100%)" : "#f0faf9", borderColor: "#b0d4cd" }}
                  >
                    {p === "daily" ? "Today" : p.charAt(0).toUpperCase() + p.slice(1)}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant={period === "custom" ? "solid" : "outline"}
                  bg={period === "custom" ? "linear-gradient(135deg, #1a8070 0%, #0f5a52 100%)" : "white"}
                  color={period === "custom" ? "white" : "#3e5e58"}
                  borderColor="#dbe5e1"
                  borderRadius="8px"
                  boxShadow={period === "custom" ? "0 2px 8px rgba(26,128,112,0.30)" : "none"}
                  fontWeight={period === "custom" ? "700" : "500"}
                  onClick={() => setPeriod("custom")}
                  transition="all 0.15s ease"
                  _hover={{ bg: period === "custom" ? "linear-gradient(135deg, #1a8070 0%, #0f5a52 100%)" : "#f0faf9", borderColor: "#b0d4cd" }}
                >
                  Custom
                </Button>
              </HStack>

              {period === "custom" && (
                <HStack bg="white" border="1px solid #dbe5e1" borderRadius="8px" px="3" h="44px">
                  <Text fontSize="sm" color="#4b6862">
                    From
                  </Text>
                  <DateInput
variant="flushed"
                    value={start}
                    onChange={(event) => setStart(event.target.value)}
                    w="130px"
                    fontSize="sm"
                  />
                  <Text fontSize="sm" color="#4b6862">
                    to
                  </Text>
                  <DateInput
variant="flushed"
                    value={end}
                    onChange={(event) => setEnd(event.target.value)}
                    w="130px"
                    fontSize="sm"
                  />
                  <Button size="sm" bg="#123d3b" color="white" onClick={() => void loadSummary()} loading={loading}>
                    <FontAwesomeIcon icon={faChevronDown} />
                  </Button>
                </HStack>
              )}
            </VStack>
          </Flex>

          {/* Top rows: these figures move with the Today/Weekly/Monthly/Custom period picker above, except Doctor remaining amount, which is always the all-time balance. */}
          <Grid templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }} gap="4" mb="4">
            <StatCard compact label="Total collected (gross)" value={money(summary.collected)} icon={faArrowTrendUp} color="#22633e" />
            <StatCard compact label="Patients seen" value={summary.patientsSeen} icon={faUserGroup} color="#126b68" />
            <StatCard compact label="Doctor share" value={money(summary.doctorShare)} icon={faUserDoctor} color="#4a3aa7" />
            <StatCard
              compact
              label="Doctor remaining amount"
              value={money(summary.doctorRemaining)}
              icon={faUserDoctor}
              color={summary.doctorRemaining > 0 ? "#a34258" : "#22633e"}
              valueColor={summary.doctorRemaining > 0 ? "#a34258" : "#22633e"}
            />
            <StatCard compact label="Net revenue (hospital)" value={money(summary.netRevenue)} icon={faSackDollar} color="#22633e" />
            <StatCard compact label="Total Expenses" value={money(summary.totalExpenses)} icon={faCoins} color="#b26732" />
            <StatCard
              compact
              label="Store Wastage & Refunds"
              value={money(summary.supplierRefunds - summary.medicineWastage)}
              icon={faTrashCan}
              color={summary.supplierRefunds - summary.medicineWastage >= 0 ? "#22633e" : "#a34258"}
              valueColor={summary.supplierRefunds - summary.medicineWastage >= 0 ? "#22633e" : "#a34258"}
            />
            <StatCard compact label="Paid to doctors" value={money(summary.doctorPayouts)} icon={faCoins} color="#4a3aa7" />
          </Grid>

          {/* Lifetime figures — not tied to the period picker. */}
          <Grid templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }} gap="4" mb="8">
            <StatCard compact label="Active Doctors" value={summary.doctorCount} icon={faUserDoctor} color="#4a3aa7" />
            <StatCard compact label="Total Registered Patients" value={summary.patientCount} icon={faUsers} color="#126b68" />
            <StatCard compact label="Total Lab Tests" value={summary.labTestCount} icon={faFlaskVial} color="#b26732" />
            <StatCard compact label="Total OT Cases" value={summary.otCaseCount} icon={faBed} color="#a34258" />
          </Grid>

          <Grid templateColumns={{ base: "1fr", lg: "1.1fr 0.9fr" }} gap="16px" mb="28px">
            <Box
              bg="white" border="1px solid rgba(14,36,32,0.06)" borderRadius="16px"
              overflow="hidden" boxShadow="0 2px 12px rgba(14,36,32,0.05)"
            >
              <Box p="5" borderBottom="1px solid rgba(14,36,32,0.05)">
                <Flex align="center" justify="space-between" gap="3" flexWrap="wrap">
                  <Flex align="center" gap="3">
                    <Flex
                      w="34px" h="34px"
                      bgGradient="to-br" gradientFrom="rgba(45,212,191,0.18)" gradientTo="rgba(74,222,128,0.12)"
                      border="1px solid rgba(45,212,191,0.2)"
                      color="#0e8e8a" borderRadius="9px" align="center" justify="center"
                    >
                      <FontAwesomeIcon icon={faChartLine} size="sm" />
                    </Flex>
                    <Box>
                      <Heading size="sm" color="#0e2420">{revenuePeriodCopy[chartPeriod].title}</Heading>
                    </Box>
                  </Flex>
                  <NativeSelect.Root size="sm" width="120px">
                    <NativeSelect.Field value={chartPeriod} onChange={(event) => setChartPeriod(event.target.value as ChartPeriod)}>
                      <option value="today">Today</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </NativeSelect.Field>
                  </NativeSelect.Root>
                </Flex>
              </Box>
              <Box p="5">
                {!loading && summary.revenueHistory.length === 0 ? (
                  <Text py="16" textAlign="center" color="#77908b" fontSize="sm">No revenue yet to chart.</Text>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={revenueTrend} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                      <defs>
                        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#1a8070" stopOpacity={0.85} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(14,36,32,0.06)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={chartAxisTick}
                        axisLine={{ stroke: "rgba(14,36,32,0.08)" }}
                        tickLine={false}
                        interval={0}
                        tickFormatter={(_value, index) => revenueTrend[index]?.axisText ?? ""}
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
                        cursor={{ fill: "rgba(14,142,138,0.06)" }}
                        contentStyle={chartTooltipStyle}
                        labelStyle={{ color: "#0e2420", fontWeight: 700 }}
                        formatter={(value) => [money(Number(value)), "Revenue"]}
                      />
                      <Bar dataKey="total" name="Revenue" fill="url(#barGrad)" radius={[5, 5, 0, 0]} maxBarSize={38} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Box>
            </Box>

            <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" p="24px">
              <HStack justify="space-between">
                <HStack gap="3">
                  <Flex w="34px" h="34px" bg="#e9f1ef" color="#126b68" borderRadius="9px" align="center" justify="center">
                    <FontAwesomeIcon icon={faFileInvoiceDollar} />
                  </Flex>
                  <Box>
                    <Heading size="sm">All Services Analytics</Heading>
                  </Box>
                </HStack>
              </HStack>

              <Box mt="20px">
                {allServiceChartData.every((row) => row.value === 0) ? (
                  <Text py="10" textAlign="center" color="#77908b" fontSize="sm">No billed revenue yet in this range.</Text>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <Pie
                        data={allServiceChartData.filter((row) => row.value > 0)}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={56}
                        outerRadius={82}
                        paddingAngle={3}
                        stroke="#ffffff"
                        strokeWidth={2}
                      >
                        {allServiceChartData.filter((row) => row.value > 0).map((row) => (
                          <Cell key={row.name} fill={row.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={chartTooltipStyle}
                        labelStyle={{ color: "#123d3b", fontWeight: 700 }}
                        formatter={(value) => [money(Number(value)), "Revenue"]}
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

              <Flex justify="space-between" align="center" borderTop="1px solid #edf2f0" mt="6" pt="4">
                <Text fontSize="sm" fontWeight="800" color="#126b68" textTransform="uppercase" letterSpacing="0.06em">
                  Total
                </Text>
                <Heading size="md" color="#123d3b">{money(serviceTotal)}</Heading>
              </Flex>
            </Box>
          </Grid>
        </Box>
      </Box>
    </Flex>
  );
}
