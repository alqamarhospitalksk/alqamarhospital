"use client";
import { DateInput } from "../date-input";

import { useEffect, useState } from "react";
import { usePolling } from "../use-polling";
import { Box, Button, Flex, Grid, Heading, HStack, NativeSelect, Text, VStack } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCashRegister, faHourglassHalf, faSkullCrossbones, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "react-toastify";
import { StatCard } from "../stat-card";

type StockRow = {
  id: number;
  name: string;
  unit: string;
  totalQuantity: number;
  reorderLevel: number;
  nearestExpiry: string | null;
};
type StockStatusCounts = { ok: number; lowStock: number; expiringSoon: number; expired: number };
type SalesHistoryEntry = { createdAt: string; total: number };
type DashboardData = {
  todayRevenue: number;
  todaySalesCount: number;
  lowStock: StockRow[];
  expiringSoon: StockRow[];
  expired: StockRow[];
  stockStatusCounts: StockStatusCounts;
  salesHistory: SalesHistoryEntry[];
  refundsHistory: SalesHistoryEntry[];
};

const money = (val: number) => `PKR ${val.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
const compactMoney = (val: number) => {
  if (val >= 100000) return `${(val / 100000).toFixed(val % 100000 === 0 ? 0 : 1)}L`;
  if (val >= 1000) return `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}K`;
  return String(val);
};

function daysUntil(dateStr: string) {
  // Compare pure calendar dates in UTC on both sides — the expiry date is stored as
  // UTC midnight, so mixing it with a local-midnight "today" can round a day off.
  const target = new Date(dateStr);
  const now = new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const targetUTC = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  return Math.max(0, Math.round((targetUTC - todayUTC) / (24 * 60 * 60 * 1000)));
}

type SalesPeriod = "today" | "weekly" | "monthly" | "yearly";

function toDateStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const salesPeriodCopy: Record<SalesPeriod, { title: string }> = {
  today: { title: "Sales — Last 7 Days" },
  weekly: { title: "Sales — Last 7 Days" },
  monthly: { title: "Sales — Last 30 Days" },
  yearly: { title: "Sales — Last 12 Months" },
};

function buildSalesTrend(history: SalesHistoryEntry[], period: SalesPeriod) {
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
          .filter((s) => {
            const sd = new Date(s.createdAt);
            return sd.getFullYear() === d.getFullYear() && sd.getMonth() === d.getMonth();
          })
          .reduce((sum, s) => sum + s.total, 0),
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
      total: history.filter((s) => toDateStr(new Date(s.createdAt)) === key).reduce((sum, s) => sum + s.total, 0),
    };
  });
}

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

export default function MedicalStoreDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [salesPeriod, setSalesPeriod] = useState<SalesPeriod>("today");
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>("today");
  const [customStart, setCustomStart] = useState(() => toDateStr(new Date()));
  const [customEnd, setCustomEnd] = useState(() => toDateStr(new Date()));

  function changeStatsPeriod(next: "today" | "weekly" | "monthly") {
    const range = statsPeriodRange(next);
    setStatsPeriod(next);
    setCustomStart(range.start);
    setCustomEnd(range.end);
  }

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/medical-store/dashboard");
      const json = await res.json();
      if (res.ok) setData(json);
      else if (!silent) toast.error(json.error ?? "Unable to load the store dashboard.");
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
  usePolling(() => load(true), 30000, { runNow: false });

  // Revenue follows the period picker; the stock cards are "right now" snapshots and don't.
  const salesInRange = (data?.salesHistory ?? []).filter((s) => {
    const d = toDateStr(new Date(s.createdAt));
    return d >= customStart && d <= customEnd;
  });
  const refundsInRange = (data?.refundsHistory ?? []).filter((r) => {
    const d = toDateStr(new Date(r.createdAt));
    return d >= customStart && d <= customEnd;
  });
  const refundedInRange = refundsInRange.reduce((sum, r) => sum + r.total, 0);
  // Net of returns: a refunded sale is not revenue.
  const revenueInRange = salesInRange.reduce((sum, s) => sum + s.total, 0) - refundedInRange;

  const stats = [
    {
      label: `Revenue ${statsPeriodLabel[statsPeriod]}`,
      value: data ? money(revenueInRange) : "…",
      icon: faCashRegister,
      color: "#22633e",
      footnote: data ? `${salesInRange.length} sale${salesInRange.length === 1 ? "" : "s"}${refundedInRange > 0 ? ` · ${money(refundedInRange)} refunded` : ""}` : undefined,
    },
    { label: "Low Stock Items", value: data ? String(data.lowStock.length) : "…", icon: faTriangleExclamation, color: "#b26732" },
    { label: "Expiring Within 30 Days", value: data ? String(data.expiringSoon.length) : "…", icon: faHourglassHalf, color: "#a34258" },
    { label: "Already Expired", value: data ? String(data.expired.length) : "…", icon: faSkullCrossbones, color: "#7c2d2d" },
  ];

  // The chart nets refunds off the day they were paid back.
  const salesTrend = buildSalesTrend([...(data?.salesHistory ?? []), ...(data?.refundsHistory ?? []).map((r) => ({ createdAt: r.createdAt, total: -r.total }))], salesPeriod);
  // "today" reuses the 7-day view — the difference is purely which button is highlighted.

  const stockPieData = data
    ? [
        { name: "OK", value: data.stockStatusCounts.ok, color: "#22633e" },
        { name: "Low Stock", value: data.stockStatusCounts.lowStock, color: "#b26732" },
        { name: "Expiring Soon", value: data.stockStatusCounts.expiringSoon, color: "#a34258" },
        { name: "Expired", value: data.stockStatusCounts.expired, color: "#7c2d2d" },
      ].filter((slice) => slice.value > 0)
    : [];

  function renderBarCard(
    title: string,
    rows: StockRow[],
    emptyText: string,
    color: string,
    metric: (r: StockRow) => number,
    metricLabel: string,
    metricUnit: (r: StockRow) => string
  ) {
    const shown = rows.slice(0, 8);
    const chartRows = shown.map((r) => ({ name: r.name, value: metric(r), unit: metricUnit(r), expiry: r.nearestExpiry }));
    return (
      <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
        <Box p="5" borderBottom="1px solid #edf2f0">
          <Heading size="sm">{title}</Heading>
        </Box>
        <Box p="5">
          {rows.length === 0 ? (
            <Text py="10" textAlign="center" color="#77908b" fontSize="sm">{emptyText}</Text>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={Math.max(160, chartRows.length * 36)}>
                <BarChart data={chartRows} layout="vertical" margin={{ top: 4, right: 20, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e1e0d9" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={chartAxisTick} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={110} tick={chartYAxisTick} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={{ color: "#123d3b", fontWeight: 700 }}
                    formatter={(value, _name, item) => {
                      const unit = (item?.payload as { unit?: string } | undefined)?.unit ?? "";
                      return [`${value} ${unit}`, metricLabel];
                    }}
                  />
                  <Bar dataKey="value" name={metricLabel} fill={color} radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
              {rows.length > shown.length && (
                <Text fontSize="10px" color="#77908b" mt="2" textAlign="right">+{rows.length - shown.length} more not shown</Text>
              )}
            </>
          )}
        </Box>
      </Box>
    );
  }

  function urgencyColor(days: number) {
    if (days <= 7) return "#7c2d2d"; // critical — matches the "Already Expired" stat card
    if (days <= 15) return "#a34258"; // warning — matches "Expiring Within 30 Days"
    return "#b26732"; // caution — matches "Low Stock"
  }

  function renderLowStockChart(rows: StockRow[]) {
    const shown = rows.slice(0, 8);
    const chartRows = shown.map((r) => ({ name: r.name, current: r.totalQuantity, reorder: r.reorderLevel, unit: r.unit.toLowerCase() }));
    return (
      <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
        <Box p="5" borderBottom="1px solid #edf2f0">
          <Heading size="sm">Low Stock</Heading>
        </Box>
        <Box p="5">
          {rows.length === 0 ? (
            <Text py="10" textAlign="center" color="#77908b" fontSize="sm">Nothing low on stock.</Text>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={Math.max(180, chartRows.length * 44)}>
                <BarChart data={chartRows} layout="vertical" barGap={2} margin={{ top: 4, right: 34, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e1e0d9" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={chartAxisTick} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={110} tick={chartYAxisTick} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={{ color: "#123d3b", fontWeight: 700 }}
                    formatter={(value, name, item) => {
                      const unit = (item?.payload as { unit?: string } | undefined)?.unit ?? "";
                      return [`${value} ${unit}`, name];
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    height={28}
                    iconType="circle"
                    formatter={(value) => <span style={{ color: "#3e5e58", fontSize: 12 }}>{value}</span>}
                  />
                  <Bar dataKey="current" name="Current Stock" fill="#b26732" radius={[0, 4, 4, 0]} maxBarSize={14}>
                    <LabelList dataKey="current" position="right" style={{ fontSize: 11, fontWeight: 700, fill: "#123d3b" }} />
                  </Bar>
                  <Bar dataKey="reorder" name="Reorder Level" fill="#d8cfc2" radius={[0, 4, 4, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
              {rows.length > shown.length && (
                <Text fontSize="10px" color="#77908b" mt="2" textAlign="right">+{rows.length - shown.length} more not shown</Text>
              )}
            </>
          )}
        </Box>
      </Box>
    );
  }

  function renderExpiringSoonChart(rows: StockRow[]) {
    const shown = rows.slice(0, 8);
    const chartRows = shown.map((r) => ({
      name: r.name,
      days: r.nearestExpiry ? daysUntil(r.nearestExpiry) : 0,
      unit: r.unit.toLowerCase(),
      quantity: r.totalQuantity,
    }));
    return (
      <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
        <Box p="5" borderBottom="1px solid #edf2f0">
          <Heading size="sm">Expiring Soon (1 month)</Heading>
        </Box>
        <Box p="5">
          {rows.length === 0 ? (
            <Text py="10" textAlign="center" color="#77908b" fontSize="sm">Nothing expiring soon.</Text>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={Math.max(180, chartRows.length * 40)}>
                <BarChart data={chartRows} layout="vertical" margin={{ top: 4, right: 34, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e1e0d9" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={chartAxisTick} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={110} tick={chartYAxisTick} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={{ color: "#123d3b", fontWeight: 700 }}
                    formatter={(value, _name, item) => {
                      const payload = item?.payload as { quantity?: number; unit?: string } | undefined;
                      return [`${value} days · ${payload?.quantity ?? ""} ${payload?.unit ?? ""} in stock`, "Time left"];
                    }}
                  />
                  <Bar dataKey="days" name="Days left" radius={[0, 4, 4, 0]} maxBarSize={22}>
                    {chartRows.map((row) => (
                      <Cell key={row.name} fill={urgencyColor(row.days)} />
                    ))}
                    <LabelList
                      dataKey="days"
                      position="right"
                      formatter={(value) => `${value}d`}
                      style={{ fontSize: 11, fontWeight: 700, fill: "#123d3b" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {rows.length > shown.length && (
                <Text fontSize="10px" color="#77908b" mt="2" textAlign="right">+{rows.length - shown.length} more not shown</Text>
              )}
            </>
          )}
        </Box>
      </Box>
    );
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
            Store Dashboard
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
              <DateInput size="sm" value={customStart} onChange={(event) => setCustomStart(event.target.value)} w="150px" borderRadius="8px" bg="white" />
              <Text fontSize="sm" color="#77908b">to</Text>
              <DateInput size="sm" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} w="150px" borderRadius="8px" bg="white" />
            </HStack>
          )}
        </VStack>

        <Grid templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }} gap="4" mb="8">
          {stats.map((stat) => (
            <StatCard key={stat.label} label={stat.label} value={loading ? "…" : stat.value} icon={stat.icon} color={stat.color} footnote={stat.footnote} />
          ))}
        </Grid>

        <Grid templateColumns={{ base: "1fr", lg: "1.1fr 0.9fr" }} gap="6" mb="6">
          <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
            <Box p="5" borderBottom="1px solid #edf2f0">
              <Flex align="center" justify="space-between" gap="3" flexWrap="wrap">
                <Flex align="center" gap="3">
                  <Flex w="32px" h="32px" bg="#e9f1ef" color="#126b68" borderRadius="8px" align="center" justify="center">
                    <FontAwesomeIcon icon={faCashRegister} size="sm" />
                  </Flex>
                  <Box>
                    <Heading size="sm">{salesPeriodCopy[salesPeriod].title}</Heading>
                  </Box>
                </Flex>
                <NativeSelect.Root size="sm" width="120px">
                  <NativeSelect.Field value={salesPeriod} onChange={(event) => setSalesPeriod(event.target.value as SalesPeriod)}>
                    <option value="today">Today</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </NativeSelect.Field>
                </NativeSelect.Root>
              </Flex>
            </Box>
            <Box p="5">
              {!loading && (data?.salesHistory.length ?? 0) === 0 ? (
                <Text py="16" textAlign="center" color="#77908b" fontSize="sm">No sales yet to chart.</Text>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={salesTrend} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e1e0d9" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={chartAxisTick}
                      axisLine={{ stroke: "#c3c2b7" }}
                      tickLine={false}
                      interval={0}
                      tickFormatter={(_value, index) => salesTrend[index]?.axisText ?? ""}
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
                      formatter={(value) => [money(Number(value)), "Revenue"]}
                    />
                    <Bar dataKey="total" name="Revenue" fill="#126b68" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Box>
          </Box>

          <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
            <Box p="5" borderBottom="1px solid #edf2f0">
              <Flex align="center" gap="3">
                <Flex w="32px" h="32px" bg="#f8e8d8" color="#b26732" borderRadius="8px" align="center" justify="center">
                  <FontAwesomeIcon icon={faTriangleExclamation} size="sm" />
                </Flex>
                <Box>
                  <Heading size="sm">Stock Status</Heading>
                </Box>
              </Flex>
            </Box>
            <Box p="5">
              {!loading && stockPieData.length === 0 ? (
                <Text py="16" textAlign="center" color="#77908b" fontSize="sm">No medicines in catalog yet.</Text>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <Pie
                      data={stockPieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={62}
                      outerRadius={92}
                      paddingAngle={stockPieData.length > 1 ? 3 : 0}
                      stroke="#ffffff"
                      strokeWidth={2}
                    >
                      {stockPieData.map((slice) => (
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

        <Grid templateColumns={{ base: "1fr", lg: "repeat(3, 1fr)" }} gap="6">
          {renderLowStockChart(data?.lowStock ?? [])}
          {renderExpiringSoonChart(data?.expiringSoon ?? [])}
          {renderBarCard(
            "Expired",
            data?.expired ?? [],
            "No expired stock.",
            "#7c2d2d",
            (r) => r.totalQuantity,
            "Stock still in inventory",
            (r) => r.unit.toLowerCase()
          )}
        </Grid>
      </Box>
    </Box>
  );
}
