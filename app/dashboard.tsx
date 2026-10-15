"use client";

import { useEffect, useState } from "react";
import { Box, Flex, Grid, HStack, Text } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowTrendUp,
  faBed,
  faBoxOpen,
  faChartColumn,
  faCoins,
  faFileInvoiceDollar,
  faFlaskVial,
  faHandHoldingDollar,
  faHospital,
  faHospitalUser,
  faReceipt,
  faSackDollar,
  faUserDoctor,
  faUserGroup,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "react-toastify";
import { DateInput } from "./date-input";
import { RefreshButton } from "./refresh-button";
import { formatDate } from "../lib/format-date";
import {
  ChartBox,
  DashboardBody,
  DashboardHeader,
  EmptyState,
  KpiTile,
  Money,
  Panel,
  RankedBars,
  Segmented,
  StatLine,
  chartAxisTick,
  chartGrid,
  chartTooltipStyle,
  compactMoney,
  formatNumber,
  ink,
  money,
  series,
  status,
  type Delta,
} from "./dashboard-ui";

const serviceLabels: Record<string, string> = {
  OPD: "OPD consultation",
  LABORATORY: "Laboratory",
  ECO: "ECO",
  ECG: "ECG",
  "X-RAY": "X-Ray",
  ULTRASOUND: "Ultrasound",
  OT: "Operation theater",
  ADMISSION: "In-patient admission",
  EMERGENCY: "Minor emergency",
  MEDICAL_STORE: "Medical store",
  OTHER: "Other / unlinked",
};

type RevenueHistoryEntry = { createdAt: string; amount: number };
type ActivityRow = { id: number; patient: string; mrNumber: string; doctor: string; type: string; amount: number; method: string; createdAt: string };
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
  admittedNow: number;
  activity: ActivityRow[];
  doctorShareDetail: { doctor: string; amount: number }[];
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
  admittedNow: 0,
  activity: [],
  doctorShareDetail: [],
  revenueHistory: [],
};

const methodLabels: Record<string, string> = { CASH: "Cash", CARD: "Card", BANK_TRANSFER: "Bank", ONLINE: "Online", FREE: "Free" };

function toDateStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
const parseDay = (value: string) => new Date(`${value}T00:00:00`);
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

type Period = "daily" | "weekly" | "monthly" | "custom";

function periodRange(period: "daily" | "weekly" | "monthly") {
  const now = new Date();
  const end = toDateStr(now);
  if (period === "daily") return { start: end, end };
  if (period === "weekly") {
    const day = now.getDay(); // 0 = Sunday
    const diffToMonday = day === 0 ? 6 : day - 1;
    return { start: toDateStr(addDays(now, -diffToMonday)), end };
  }
  return { start: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), end };
}

// The window the selected range is compared with: yesterday for today, the same days of last
// week / last month for week- and month-to-date, and the equally long stretch just before a custom range.
function comparisonRange(period: Period, start: Date, end: Date) {
  if (period === "daily") return { start: addDays(start, -1), end: addDays(end, -1), label: "vs yesterday" };
  if (period === "weekly") return { start: addDays(start, -7), end: addDays(end, -7), label: "vs last week" };
  if (period === "monthly") {
    const prevStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
    const lastDayPrev = new Date(start.getFullYear(), start.getMonth(), 0).getDate();
    const prevEnd = new Date(prevStart.getFullYear(), prevStart.getMonth(), Math.min(end.getDate(), lastDayPrev));
    return { start: prevStart, end: prevEnd, label: "vs last month" };
  }
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  return { start: addDays(start, -days), end: addDays(start, -1), label: "vs previous period" };
}

// Both sides come from the same payment history, so the percentage compares like with like.
function grossDelta(history: RevenueHistoryEntry[], period: Period, startStr: string, endStr: string): Delta {
  const start = parseDay(startStr);
  const end = parseDay(endStr);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
  const prev = comparisonRange(period, start, end);
  // The API sends one year of history; anything older can't be compared fairly.
  const oldest = addDays(new Date(), -364);
  if (prev.start < oldest) return null;
  const sumBetween = (from: Date, to: Date) => {
    const upper = addDays(to, 1).getTime();
    return history.reduce((sum, p) => {
      const t = new Date(p.createdAt).getTime();
      return t >= from.getTime() && t < upper ? sum + p.amount : sum;
    }, 0);
  };
  const current = sumBetween(start, end);
  const previous = sumBetween(prev.start, prev.end);
  if (previous <= 0) return null;
  return { percent: ((current - previous) / previous) * 100, label: prev.label };
}

type TrendRange = "7d" | "30d" | "12m";

function buildRevenueTrend(history: RevenueHistoryEntry[], range: TrendRange) {
  const now = new Date();
  if (range === "12m") {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      return {
        label: d.toLocaleDateString("en-PK", { month: "short", year: "2-digit" }),
        tooltip: d.toLocaleDateString("en-PK", { month: "long", year: "numeric" }),
        total: history
          .filter((p) => {
            const pd = new Date(p.createdAt);
            return pd.getFullYear() === d.getFullYear() && pd.getMonth() === d.getMonth();
          })
          .reduce((sum, p) => sum + p.amount, 0),
      };
    });
  }
  const days = range === "30d" ? 30 : 7;
  const byDay = new Map<string, number>();
  for (const p of history) {
    const key = toDateStr(new Date(p.createdAt));
    byDay.set(key, (byDay.get(key) ?? 0) + p.amount);
  }
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(now, -(days - 1 - i));
    return {
      // Labels stay unique per bar so the axis never merges two days into one tick.
      label: days === 7 ? d.toLocaleDateString("en-PK", { weekday: "short", day: "numeric" }) : d.toLocaleDateString("en-PK", { day: "numeric", month: "short" }),
      tooltip: d.toLocaleDateString("en-PK", { weekday: "long", day: "numeric", month: "long" }),
      total: byDay.get(toDateStr(d)) ?? 0,
    };
  });
}

async function fetchSummary(start: string, end: string): Promise<Summary | null> {
  try {
    const response = await fetch(`/api/dashboard?start=${start}&end=${end}`);
    const data = await response.json();
    if (response.ok) return { ...emptySummary, ...data };
    toast.error(data.error ?? "Unable to load dashboard data.");
  } catch {
    toast.error("Unable to load dashboard data.");
  }
  return null;
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-PK", { hour: "numeric", minute: "2-digit" });

export default function Dashboard() {
  const [period, setPeriod] = useState<Period>("daily");
  const [start, setStart] = useState(() => toDateStr(new Date()));
  const [end, setEnd] = useState(() => toDateStr(new Date()));
  const [summary, setSummary] = useState<Summary>(emptySummary);
  // The range the figures on screen belong to; while it differs from the picker, a load is under way.
  const [loadedRange, setLoadedRange] = useState("");
  const loading = loadedRange !== `${start}|${end}`;
  const [trendRange, setTrendRange] = useState<TrendRange>("7d");

  function show(data: Summary | null, range: string) {
    if (data) setSummary(data);
    setLoadedRange(range);
  }

  async function loadSummary() {
    show(await fetchSummary(start, end), `${start}|${end}`);
  }

  useEffect(() => {
    if (!start || !end) return;
    // A slower answer for a range the user has already moved away from is dropped.
    let stale = false;
    const range = `${start}|${end}`;
    void fetchSummary(start, end).then((data) => {
      if (!stale) show(data, range);
    });
    return () => {
      stale = true;
    };
  }, [end, start]);

  function changePeriod(next: Period) {
    setPeriod(next);
    if (next === "custom") return;
    const range = periodRange(next);
    setStart(range.start);
    setEnd(range.end);
  }

  const rangeText = start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`;
  const periodName = { daily: "Today", weekly: "This week", monthly: "This month", custom: "Selected range" }[period];

  const serviceRows = Object.entries(serviceLabels)
    .map(([key, label]) => ({ key, label, value: summary.totals[key] ?? 0 }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
  const serviceTotal = serviceRows.reduce((sum, row) => sum + row.value, 0);

  const trend = buildRevenueTrend(summary.revenueHistory, trendRange);
  const trendTotal = trend.reduce((sum, row) => sum + row.total, 0);
  const trendAverage = trend.length ? trendTotal / trend.length : 0;
  const delta = grossDelta(summary.revenueHistory, period, start, end);

  const storeNet = summary.supplierRefunds - summary.medicineWastage;
  const topDoctors = summary.doctorShareDetail.slice(0, 6);

  // How each rupee collected in the period was split. Only drawn when the split adds up to the gross.
  const split = [
    // Lighter steps of the chart teal / violet / orange, so they stand out on the dark card.
    { key: "net", label: "Hospital net", value: summary.netRevenue, color: "#5fd4bf" },
    { key: "doctor", label: "Doctor share", value: summary.doctorShare, color: "#a99cf0" },
    { key: "expenses", label: "Expenses", value: summary.totalExpenses, color: "#f0a35e" },
  ];
  const showSplit = summary.collected > 0 && split.every((part) => part.value >= 0);

  return (
    <Box minH="100%" bg="#eef2f0" color={ink.primary}>
      <DashboardHeader
        eyebrow="Management"
        title="Hospital overview"
        subtitle={
          <>
            {periodName} · {rangeText}
          </>
        }
        actions={
          <>
            <Segmented
              value={period}
              onChange={changePeriod}
              options={[
                { value: "daily", label: "Today" },
                { value: "weekly", label: "This week" },
                { value: "monthly", label: "This month" },
                { value: "custom", label: "Custom" },
              ]}
            />
            <RefreshButton onRefresh={loadSummary} />
          </>
        }
      />

      <DashboardBody>
        {period === "custom" && (
          <Flex bg="white" border={`1px solid ${ink.border}`} borderRadius="12px" px="4" py="3" gap="3" align="center" flexWrap="wrap">
            <Text fontSize="sm" fontWeight="600" color={ink.secondary}>
              Show figures from
            </Text>
            <HStack gap="2" flexWrap="wrap">
              <DateInput value={start} onChange={(event) => setStart(event.target.value)} max={end} w="150px" size="sm" />
              <Text fontSize="sm" color={ink.muted}>
                to
              </Text>
              <DateInput value={end} onChange={(event) => setEnd(event.target.value)} min={start} w="150px" size="sm" />
            </HStack>
          </Flex>
        )}

        {/* Money for the selected period. Net + doctor share + expenses add up to the gross collected. */}
        <Grid templateColumns={{ base: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))", "2xl": "repeat(6, minmax(0, 1fr))" }} gap={{ base: "3", md: "4" }} opacity={loading ? 0.65 : 1} transition="opacity 0.2s ease">
          <Box
            gridColumn={{ base: "span 2", md: "span 4", "2xl": "span 2" }}
            bg="linear-gradient(135deg, #0e2a27 0%, #12403b 100%)"
            color="white"
            borderRadius="14px"
            p={{ base: "4", md: "5" }}
            boxShadow="0 6px 20px rgba(14,42,39,0.22)"
            display="flex"
            flexDirection={{ base: "column", md: "row", "2xl": "column" }}
            gap={{ base: "4", md: "8", "2xl": "4" }}
            justifyContent="space-between"
            minW="0"
          >
            <Box minW="0">
              <Flex align="center" gap="2" mb="1.5">
                <FontAwesomeIcon icon={faSackDollar} style={{ color: "#5fd4bf" }} />
                <Text fontSize="11px" fontWeight="700" textTransform="uppercase" letterSpacing="0.08em" color="#a9cfc8">
                  Net revenue (hospital)
                </Text>
              </Flex>
              <Text fontSize={{ base: "2xl", md: "3xl" }} fontWeight="800" letterSpacing="-0.03em" lineHeight="1.1" color={summary.netRevenue < 0 ? "#ff9b8f" : "white"} whiteSpace="nowrap">
                <Text as="span" fontSize="0.5em" color="#a9cfc8" mr="1.5" fontWeight="700">
                  PKR
                </Text>
                {formatNumber(summary.netRevenue)}
              </Text>
              <Text fontSize="xs" color="#a9cfc8" mt="1.5">
                Gross collected, less doctor share and expenses
              </Text>
            </Box>
            {showSplit ? (
              <Box flex="1" minW="0" maxW={{ md: "520px", "2xl": "none" }} alignSelf={{ md: "center", "2xl": "stretch" }}>
                <Flex h="10px" borderRadius="5px" overflow="hidden" gap="2px" bg="rgba(255,255,255,0.08)">
                  {split
                    .filter((part) => part.value > 0)
                    .map((part) => (
                      <Box key={part.key} h="100%" bg={part.color} w={`${(part.value / summary.collected) * 100}%`} title={`${part.label}: ${money(part.value)}`} />
                    ))}
                </Flex>
                <Grid templateColumns="repeat(3, minmax(0, 1fr))" gap="3" mt="3">
                  {split.map((part) => (
                    <Box key={part.key} minW="0">
                      <Flex align="center" gap="1.5">
                        <Box w="8px" h="8px" borderRadius="2px" flexShrink="0" bg={part.color} />
                        <Text fontSize="11px" color="#a9cfc8" lineClamp={1}>
                          {part.label}
                        </Text>
                      </Flex>
                      <Text fontSize="sm" fontWeight="700" whiteSpace="nowrap">
                        {Math.round((part.value / summary.collected) * 100)}%
                      </Text>
                    </Box>
                  ))}
                </Grid>
              </Box>
            ) : null}
          </Box>
          <KpiTile label="Gross collected" value={<Money value={summary.collected} size="inherit" />} icon={faArrowTrendUp} color={series.teal} delta={delta} />
          <KpiTile label="Doctor share" value={<Money value={summary.doctorShare} size="inherit" />} icon={faUserDoctor} color={series.violet} hint="Earned by doctors this period" />
          <KpiTile label="Expenses" value={<Money value={summary.totalExpenses} size="inherit" />} icon={faCoins} color={series.orange} hint="Excludes doctor payouts" />
          <KpiTile label="Patients seen" value={formatNumber(summary.patientsSeen)} icon={faUserGroup} color={series.teal} hint="Unique OPD patients" />
        </Grid>

        <Grid templateColumns={{ base: "minmax(0, 1fr)", xl: "minmax(0, 1.75fr) minmax(0, 1fr)" }} gap={{ base: "4", md: "5" }}>
          <Panel
            title="Revenue trend"
            subtitle={`Total ${money(trendTotal)} · average ${money(Math.round(trendAverage))} per ${trendRange === "12m" ? "month" : "day"}`}
            icon={faChartColumn}
            action={
              <Segmented
                size="xs"
                value={trendRange}
                onChange={setTrendRange}
                options={[
                  { value: "7d", label: "7 days" },
                  { value: "30d", label: "30 days" },
                  { value: "12m", label: "12 months" },
                ]}
              />
            }
          >
            {!loading && summary.revenueHistory.length === 0 ? (
              <EmptyState text="No payments in the last year to chart yet." py="20" />
            ) : (
              <ChartBox>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trend} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={chartGrid} vertical={false} />
                    <XAxis dataKey="label" tick={chartAxisTick} axisLine={{ stroke: ink.border }} tickLine={false} minTickGap={10} />
                    <YAxis allowDecimals={false} tick={chartAxisTick} axisLine={false} tickLine={false} width={46} tickFormatter={(value) => compactMoney(Number(value))} />
                    <Tooltip
                      cursor={{ fill: "rgba(15,143,127,0.07)" }}
                      contentStyle={chartTooltipStyle}
                      labelStyle={{ color: ink.primary, fontWeight: 700 }}
                      labelFormatter={(_label, payload) => payload?.[0]?.payload?.tooltip ?? _label}
                      formatter={(value) => [money(Number(value)), "Collected"]}
                    />
                    <Bar dataKey="total" name="Collected" fill={series.teal} radius={[4, 4, 0, 0]} maxBarSize={34} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartBox>
            )}
          </Panel>

          <Panel title="Revenue by service" subtitle={`${periodName} · ${money(serviceTotal)} in total`} icon={faFileInvoiceDollar}>
            <RankedBars
              emptyText="Nothing billed in this period yet."
              rows={serviceRows.map((row) => ({
                key: row.key,
                label: row.label,
                value: row.value,
                display: formatNumber(row.value),
                note: serviceTotal > 0 ? `${Math.round((row.value / serviceTotal) * 100)}%` : undefined,
              }))}
            />
          </Panel>
        </Grid>

        <Grid templateColumns={{ base: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(3, minmax(0, 1fr))" }} gap={{ base: "4", md: "5" }}>
          <Panel title="Doctor accounts" subtitle="Balance is all-time; payouts follow the period" icon={faHandHoldingDollar} iconColor={series.violet}>
            <Box bg={summary.doctorRemaining > 0 ? `${status.critical}0d` : `${status.good}0d`} border="1px solid" borderColor={summary.doctorRemaining > 0 ? `${status.critical}26` : `${status.good}26`} borderRadius="10px" px="3.5" py="3" mb="3">
              <Text fontSize="11px" fontWeight="700" textTransform="uppercase" letterSpacing="0.06em" color={summary.doctorRemaining > 0 ? status.critical : status.good}>
                {summary.doctorRemaining > 0 ? "Still owed to doctors" : "Doctors fully paid"}
              </Text>
              <Money value={summary.doctorRemaining} size="xl" color={summary.doctorRemaining > 0 ? status.critical : status.good} />
            </Box>
            <StatLine label={`Paid to doctors (${periodName.toLowerCase()})`} value={money(summary.doctorPayouts)} />
            <StatLine label="Earned, all time" value={money(summary.doctorEarnedTotal)} />
            <StatLine label="Paid, all time" value={money(summary.doctorPaidTotal)} />
          </Panel>

          <Panel title="Medical store adjustments" subtitle={`${periodName} · already inside expenses`} icon={faBoxOpen} iconColor={series.orange}>
            <StatLine label="Wastage written off" value={<Text as="span" color={summary.medicineWastage > 0 ? status.critical : ink.primary}>{summary.medicineWastage > 0 ? "− " : ""}{money(summary.medicineWastage)}</Text>} />
            <StatLine label="Supplier refunds received" value={<Text as="span" color={summary.supplierRefunds > 0 ? status.good : ink.primary}>{summary.supplierRefunds > 0 ? "+ " : ""}{money(summary.supplierRefunds)}</Text>} />
            <StatLine strong label="Net effect" value={<Text as="span" color={storeNet < 0 ? status.critical : storeNet > 0 ? status.good : ink.primary}>{money(storeNet)}</Text>} />
            <Text fontSize="xs" color={ink.muted} mt="3">
              Cash cut for damaged or expired stock, against money suppliers paid back.
            </Text>
          </Panel>

          <Panel title="Hospital at a glance" subtitle="Live and all-time counts" icon={faHospital} gridColumn={{ md: "span 2", xl: "auto" }}>
            <StatLine icon={faHospitalUser} color="#0e7490" label="Currently admitted" value={formatNumber(summary.admittedNow)} />
            <StatLine icon={faUserDoctor} color={series.violet} label="Active doctors" value={formatNumber(summary.doctorCount)} />
            <StatLine icon={faUsers} color={series.teal} label="Registered patients" value={formatNumber(summary.patientCount)} />
            <StatLine icon={faFlaskVial} color={series.orange} label="Lab receipts, all time" value={formatNumber(summary.labTestCount)} />
            <StatLine icon={faBed} color={status.critical} label="OT cases, all time" value={formatNumber(summary.otCaseCount)} />
          </Panel>
        </Grid>

        <Grid templateColumns={{ base: "minmax(0, 1fr)", xl: "minmax(0, 1.75fr) minmax(0, 1fr)" }} gap={{ base: "4", md: "5" }}>
          <Panel title="Latest payments" subtitle={`Most recent in ${periodName.toLowerCase()}`} icon={faReceipt} bodyPadding={false}>
            {summary.activity.length === 0 ? (
              <Box px={{ base: "4", md: "5" }} pb="4">
                <EmptyState text="No payments in this period yet." />
              </Box>
            ) : (
              <Box>
                {summary.activity.map((row) => (
                  <Flex key={row.id} align="center" gap="3" px={{ base: "4", md: "5" }} py="2.5" borderTop={`1px solid ${ink.hairline}`} _hover={{ bg: ink.wash }}>
                    <Text fontSize="xs" color={ink.muted} w="58px" flexShrink="0" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {timeOf(row.createdAt)}
                    </Text>
                    <Box flex="1" minW="0">
                      <Text fontSize="sm" fontWeight="600" color={ink.primary} lineClamp={1}>
                        {row.patient}
                      </Text>
                      <Text fontSize="xs" color={ink.muted} lineClamp={1}>
                        {[row.type, row.mrNumber, row.doctor].filter(Boolean).join(" · ")}
                      </Text>
                    </Box>
                    <Box textAlign="right" flexShrink="0">
                      <Text fontSize="sm" fontWeight="700" color={row.amount < 0 ? status.critical : ink.primary} style={{ fontVariantNumeric: "tabular-nums" }}>
                        {money(row.amount)}
                      </Text>
                      <Text fontSize="xs" color={ink.muted}>
                        {methodLabels[row.method] ?? row.method}
                      </Text>
                    </Box>
                  </Flex>
                ))}
              </Box>
            )}
          </Panel>

          <Panel title="Doctor share by doctor" subtitle={periodName} icon={faUserDoctor} iconColor={series.violet}>
            <RankedBars
              color={series.violet}
              emptyText="No doctor earnings in this period."
              rows={topDoctors.map((row) => ({ key: row.doctor, label: row.doctor, value: row.amount, display: money(row.amount) }))}
            />
            {summary.doctorShareDetail.length > topDoctors.length && (
              <Text fontSize="xs" color={ink.muted} mt="3">
                Showing the top {topDoctors.length} of {summary.doctorShareDetail.length} doctors.
              </Text>
            )}
          </Panel>
        </Grid>

      </DashboardBody>
    </Box>
  );
}

