"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Flex, Grid, Text } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBed,
  faBedPulse,
  faCashRegister,
  faChartColumn,
  faCircleCheck,
  faClockRotateLeft,
  faFlask,
  faHospitalUser,
  faHourglassHalf,
  faKitMedical,
  faNotesMedical,
  faPrint,
  faUserDoctor,
  faUserPlus,
  faVial,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "react-toastify";
import { RefreshButton } from "./refresh-button";
import { usePolling } from "./use-polling";
import {
  ChartBox,
  DashboardBody,
  DashboardHeader,
  EmptyState,
  IconChip,
  KpiTile,
  Money,
  Panel,
  RankedBars,
  StatLine,
  chartAxisTick,
  chartGrid,
  chartTooltipStyle,
  formatNumber,
  ink,
  money,
  series,
  status,
} from "./dashboard-ui";

type DoctorRow = { id: number; name: string; specialization: string; patients: number; free: number; lastToken: number; onDutyNow: boolean };
type TestRow = { module: string; receipts: number; items: number; ready: number; pending: number; readyToPrint: number };
type ActivityRow = { kind: "OPD" | "TEST" | "EMERGENCY" | "ADMISSION" | "OT"; at: string; patient: string; mrNumber: string; detail: string };
type DeskData = {
  generatedAt: string;
  user: { name: string };
  opd: { visits: number; uniquePatients: number; freeVisits: number; newPatientVisits: number; newPatients: number };
  doctors: DoctorRow[];
  hourly: { hour: number; opd: number; tests: number; emergency: number }[];
  tests: TestRow[];
  emergency: { visits: number };
  admissions: { inHouse: number; awaitingDischarge: number; admittedToday: number; dischargedToday: number };
  ot: { booked: number; inProgress: number; readyForDischarge: number; newToday: number; dischargedToday: number };
  collection: { total: number; mine: number; payments: number; byService: { key: string; label: string; amount: number; count: number }[]; byMethod: { method: string; amount: number }[] };
  activity: ActivityRow[];
};

// Live screen: refresh every minute while the tab is open (usePolling pauses it when hidden).
const POLL_MS = 60000;

const moduleLabels: Record<string, string> = { LABORATORY: "Laboratory", "X-RAY": "X-Ray", ULTRASOUND: "Ultrasound", ECG: "ECG", ECO: "ECO" };
const methodLabels: Record<string, string> = { CASH: "Cash", CARD: "Card", BANK_TRANSFER: "Bank transfer", ONLINE: "Online" };
const activityLook: Record<ActivityRow["kind"], { label: string; icon: IconDefinition; color: string }> = {
  OPD: { label: "OPD", icon: faNotesMedical, color: series.teal },
  TEST: { label: "Tests", icon: faFlask, color: series.violet },
  EMERGENCY: { label: "Emergency", icon: faKitMedical, color: series.orange },
  ADMISSION: { label: "Admission", icon: faHospitalUser, color: "#0e7490" },
  OT: { label: "OT", icon: faBed, color: status.critical },
};

const quickActions = [
  { label: "New patient", icon: faUserPlus, href: "/patients" },
  { label: "OPD token", icon: faNotesMedical, href: "/opd" },
  { label: "Book tests", icon: faFlask, href: "/diagnostics" },
  { label: "Lab results", icon: faVial, href: "/results" },
  { label: "Admissions", icon: faHospitalUser, href: "/admissions" },
  { label: "OT cases", icon: faBed, href: "/ot" },
  { label: "Emergency", icon: faKitMedical, href: "/emergency" },
];

const hourLabel = (hour: number) => `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? "am" : "pm"}`;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-PK", { hour: "numeric", minute: "2-digit" });

function greeting(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <Flex align="center" gap="1.5">
      <Box w="9px" h="9px" borderRadius="2px" bg={color} />
      <Text fontSize="xs" color={ink.secondary}>
        {label}
      </Text>
    </Flex>
  );
}

export default function OperatorDashboard() {
  const router = useRouter();
  const [data, setData] = useState<DeskData | null>(null);

  async function load() {
    const response = await fetch("/api/dashboard/operator");
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(body.error ?? "Unable to load today's figures.");
      throw new Error("load failed"); // lets usePolling slow down after a failure
    }
    setData(body);
  }

  usePolling(load, POLL_MS);

  const now = data ? new Date(data.generatedAt) : new Date();
  const dateText = now.toLocaleDateString("en-PK", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  // Show the working day from 8 am (or the first earlier activity) up to now (or the last later activity).
  const hourly = data?.hourly ?? [];
  const active = hourly.filter((h) => h.opd + h.tests + h.emergency > 0).map((h) => h.hour);
  const firstHour = Math.min(8, ...active);
  const lastHour = Math.min(23, Math.max(now.getHours(), firstHour, ...active));
  const flow = hourly.filter((h) => h.hour >= firstHour && h.hour <= lastHour).map((h) => ({ ...h, label: hourLabel(h.hour) }));
  const flowTotal = flow.reduce((sum, h) => sum + h.opd + h.tests + h.emergency, 0);
  const busiest = flow.reduce<(typeof flow)[number] | null>((best, h) => (!best || h.opd + h.tests + h.emergency > best.opd + best.tests + best.emergency ? h : best), null);

  const tests = data?.tests ?? [];
  const testReceipts = tests.reduce((sum, t) => sum + t.receipts, 0);
  const testsReady = tests.reduce((sum, t) => sum + t.ready, 0);
  const testsPending = tests.reduce((sum, t) => sum + t.pending, 0);
  const readyToPrint = tests.reduce((sum, t) => sum + t.readyToPrint, 0);
  const otOpen = data ? data.ot.booked + data.ot.inProgress + data.ot.readyForDischarge : 0;
  const maxPatients = Math.max(1, ...(data?.doctors ?? []).map((d) => d.patients));

  return (
    <Box minH="100%" bg="#eef2f0" color={ink.primary}>
      <DashboardHeader
        eyebrow="Front desk · Today"
        title={data ? `${greeting(now)}, ${data.user.name}` : "Today at the desk"}
        subtitle={
          <Flex as="span" align="center" gap="2" display="inline-flex" flexWrap="wrap">
            {dateText}
            {data && (
              <Flex as="span" align="center" gap="1.5" color={ink.muted} fontSize="xs">
                <Box as="span" w="7px" h="7px" borderRadius="full" bg={status.good} boxShadow={`0 0 0 3px ${status.good}26`} />
                Live · updated {timeOf(data.generatedAt)}
              </Flex>
            )}
          </Flex>
        }
        actions={<RefreshButton onRefresh={() => load().catch(() => undefined)} />}
      />

      <DashboardBody>
        <Grid templateColumns={{ base: "repeat(2, minmax(0, 1fr))", sm: "repeat(4, minmax(0, 1fr))", "2xl": "repeat(7, minmax(0, 1fr))" }} gap="2.5">
          {quickActions.map((action) => (
            <Button
              key={action.href}
              onClick={() => router.push(action.href)}
              h="auto"
              py="2.5"
              px="3"
              bg="white"
              color={ink.primary}
              border={`1px solid ${ink.border}`}
              borderRadius="12px"
              justifyContent="flex-start"
              gap="2.5"
              fontSize="sm"
              fontWeight="600"
              minW="0"
              _hover={{ borderColor: "#b0d4cd", bg: "#f6fbfa", transform: "translateY(-1px)" }}
              transition="all 0.15s ease"
            >
              <IconChip icon={action.icon} color={series.teal} size="28px" />
              <Text as="span" lineClamp={1} textAlign="left">
                {action.label}
              </Text>
            </Button>
          ))}
        </Grid>

        <Grid templateColumns={{ base: "repeat(2, minmax(0, 1fr))", md: "repeat(3, minmax(0, 1fr))", xl: "repeat(6, minmax(0, 1fr))" }} gap={{ base: "3", md: "4" }} opacity={data ? 1 : 0.6}>
          <KpiTile label="OPD patients" value={formatNumber(data?.opd.visits ?? 0)} icon={faNotesMedical} color={series.teal} hint={`${data?.opd.newPatients ?? 0} new registrations`} />
          <KpiTile label="Test receipts" value={formatNumber(testReceipts)} icon={faFlask} color={series.violet} hint={`${testsReady} ready · ${testsPending} waiting`} />
          <KpiTile label="Emergency visits" value={formatNumber(data?.emergency.visits ?? 0)} icon={faKitMedical} color={series.orange} hint="Minor emergency today" />
          <KpiTile label="In-patients now" value={formatNumber(data?.admissions.inHouse ?? 0)} icon={faBedPulse} color="#0e7490" hint={`+${data?.admissions.admittedToday ?? 0} in · ${data?.admissions.dischargedToday ?? 0} out today`} />
          <KpiTile label="Open OT cases" value={formatNumber(otOpen)} icon={faBed} color={status.critical} hint={`${data?.ot.newToday ?? 0} booked today`} />
          <KpiTile label="Collected at desk" value={<Money value={data?.collection.total ?? 0} size="inherit" />} icon={faCashRegister} color={status.good} hint={`By you: ${money(data?.collection.mine ?? 0)}`} />
        </Grid>

        <Grid templateColumns={{ base: "minmax(0, 1fr)", xl: "minmax(0, 1.75fr) minmax(0, 1fr)" }} gap={{ base: "4", md: "5" }}>
          <Panel
            title="Patient flow by hour"
            subtitle={flowTotal > 0 && busiest ? `${flowTotal} registrations today · busiest at ${busiest.label}` : "Registrations at the desk, hour by hour"}
            icon={faChartColumn}
            action={
              <Flex gap="3" flexWrap="wrap">
                <Swatch color={series.teal} label="OPD" />
                <Swatch color={series.violet} label="Tests" />
                <Swatch color={series.orange} label="Emergency" />
              </Flex>
            }
          >
            {data && flowTotal === 0 ? (
              <EmptyState text="No patients through the desk yet today." py="20" />
            ) : (
              <ChartBox vh={32}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={flow} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke={chartGrid} vertical={false} />
                    <XAxis dataKey="label" tick={chartAxisTick} axisLine={{ stroke: ink.border }} tickLine={false} minTickGap={6} />
                    <YAxis allowDecimals={false} tick={chartAxisTick} axisLine={false} tickLine={false} width={40} />
                    <Tooltip cursor={{ fill: "rgba(15,143,127,0.07)" }} contentStyle={chartTooltipStyle} labelStyle={{ color: ink.primary, fontWeight: 700 }} />
                    {/* The white outline leaves a hairline gap between stacked parts. */}
                    <Bar dataKey="opd" name="OPD" stackId="flow" fill={series.teal} stroke="#fff" strokeWidth={1} maxBarSize={30} />
                    <Bar dataKey="tests" name="Tests" stackId="flow" fill={series.violet} stroke="#fff" strokeWidth={1} maxBarSize={30} />
                    <Bar dataKey="emergency" name="Emergency" stackId="flow" fill={series.orange} stroke="#fff" strokeWidth={1} maxBarSize={30} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartBox>
            )}
          </Panel>

          <Panel title="Doctors today" subtitle="OPD patients and the last token issued" icon={faUserDoctor} iconColor={series.violet} bodyPadding={false}>
            {!data || data.doctors.length === 0 ? (
              <Box px={{ base: "4", md: "5" }} pb="4">
                <EmptyState text={data ? "No doctors scheduled or seen today." : "Loading…"} />
              </Box>
            ) : (
              <Box maxH={{ xl: "clamp(220px, 36vh, 400px)" }} overflowY="auto">
                {data.doctors.map((doctor) => (
                  <Box key={doctor.id} px={{ base: "4", md: "5" }} py="2.5" borderTop={`1px solid ${ink.hairline}`}>
                    <Flex align="center" justify="space-between" gap="3">
                      <Box minW="0">
                        <Text fontSize="sm" fontWeight="600" lineClamp={1}>
                          {doctor.name}
                        </Text>
                        <Flex align="center" gap="2" fontSize="xs" color={ink.muted}>
                          <Flex align="center" gap="1" color={doctor.onDutyNow ? status.good : ink.muted} fontWeight="600" flexShrink="0">
                            <Box w="6px" h="6px" borderRadius="full" bg={doctor.onDutyNow ? status.good : "#c5d3cf"} />
                            {doctor.onDutyNow ? "On duty" : "Off now"}
                          </Flex>
                          {doctor.specialization && <Text as="span" lineClamp={1}>{doctor.specialization}</Text>}
                        </Flex>
                      </Box>
                      <Box textAlign="right" flexShrink="0">
                        <Text fontSize="lg" fontWeight="800" lineHeight="1.1" style={{ fontVariantNumeric: "tabular-nums" }}>
                          {doctor.patients}
                        </Text>
                        <Text fontSize="11px" color={ink.muted}>
                          {doctor.lastToken ? `last token ${doctor.lastToken}` : "no tokens yet"}
                        </Text>
                      </Box>
                    </Flex>
                    <Box h="4px" bg={ink.hairline} borderRadius="3px" mt="2" overflow="hidden">
                      <Box h="100%" w={`${(doctor.patients / maxPatients) * 100}%`} bg={series.teal} borderRadius="3px" />
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Panel>
        </Grid>

        <Grid templateColumns={{ base: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(3, minmax(0, 1fr))" }} gap={{ base: "4", md: "5" }}>
          <Panel
            title="Test results"
            subtitle="Today's receipts and what the lab has returned"
            icon={faVial}
            iconColor={series.violet}
            action={
              readyToPrint > 0 ? (
                <Button size="xs" bg={series.teal} color="white" _hover={{ bg: "#0c7568" }} onClick={() => router.push("/results")}>
                  <FontAwesomeIcon icon={faPrint} /> {readyToPrint} to print
                </Button>
              ) : undefined
            }
          >
            {testReceipts === 0 ? (
              <EmptyState text="No tests booked today yet." />
            ) : (
              <Flex direction="column" gap="3.5">
                {tests
                  .filter((t) => t.receipts > 0)
                  .map((t) => (
                    <Box key={t.module}>
                      <Flex justify="space-between" align="baseline" mb="1.5" gap="2">
                        <Text fontSize="sm" fontWeight="600">
                          {moduleLabels[t.module] ?? t.module}
                          <Text as="span" fontWeight="400" color={ink.muted} ml="1.5" fontSize="xs">
                            {t.receipts} receipt{t.receipts === 1 ? "" : "s"} · {t.items} test{t.items === 1 ? "" : "s"}
                          </Text>
                        </Text>
                        <Flex gap="2.5" fontSize="xs" fontWeight="700" flexShrink="0">
                          <Flex align="center" gap="1" color={status.good}>
                            <FontAwesomeIcon icon={faCircleCheck} /> {t.ready} ready
                          </Flex>
                          {t.pending > 0 && (
                            <Flex align="center" gap="1" color={status.warning}>
                              <FontAwesomeIcon icon={faHourglassHalf} /> {t.pending} waiting
                            </Flex>
                          )}
                        </Flex>
                      </Flex>
                      <Box h="6px" bg={`${status.warning}33`} borderRadius="4px" overflow="hidden">
                        <Box h="100%" w={`${(t.ready / t.receipts) * 100}%`} bg={status.good} borderRadius="4px" transition="width 0.4s ease" />
                      </Box>
                    </Box>
                  ))}
              </Flex>
            )}
          </Panel>

          <Panel title="In-patients & OT" subtitle="Beds and operations right now" icon={faHospitalUser} iconColor="#0e7490">
            <StatLine icon={faBedPulse} color="#0e7490" label="Admitted (in a bed)" value={data?.admissions.inHouse ?? 0} />
            <StatLine icon={faHourglassHalf} color={status.warning} label="Invoiced, awaiting discharge" value={data?.admissions.awaitingDischarge ?? 0} />
            <StatLine icon={faUserPlus} color={series.teal} label="Admitted today" value={data?.admissions.admittedToday ?? 0} />
            <StatLine icon={faCircleCheck} color={status.good} label="Discharged today" value={data?.admissions.dischargedToday ?? 0} />
            <Text fontSize="11px" fontWeight="700" color={ink.muted} textTransform="uppercase" letterSpacing="0.06em" mt="3" mb="1">
              Operation theater
            </Text>
            <StatLine label="Booked" value={data?.ot.booked ?? 0} />
            <StatLine label="In progress" value={data?.ot.inProgress ?? 0} />
            <StatLine label="Ready for discharge" value={data?.ot.readyForDischarge ?? 0} />
          </Panel>

          <Panel title="Today's collection" subtitle={`${data?.collection.payments ?? 0} payments at the desk`} icon={faCashRegister} iconColor={status.good} gridColumn={{ md: "span 2", xl: "auto" }}>
            <Flex align="end" justify="space-between" gap="3" mb="3" flexWrap="wrap">
              <Money value={data?.collection.total ?? 0} size="2xl" />
              <Flex gap="1.5" flexWrap="wrap">
                {(data?.collection.byMethod ?? []).map((m) => (
                  <Box key={m.method} fontSize="xs" bg={ink.wash} border={`1px solid ${ink.border}`} borderRadius="6px" px="2" py="0.5" color={ink.secondary}>
                    {methodLabels[m.method] ?? m.method} <Text as="span" fontWeight="700" color={ink.primary}>{formatNumber(m.amount)}</Text>
                  </Box>
                ))}
              </Flex>
            </Flex>
            <RankedBars
              emptyText="No payments taken yet today."
              rows={(data?.collection.byService ?? []).map((row) => ({ key: row.key, label: row.label, value: row.amount, display: formatNumber(row.amount), note: `×${row.count}` }))}
            />
            {data && data.opd.freeVisits > 0 && (
              <Text fontSize="xs" color={ink.muted} mt="3">
                {data.opd.freeVisits} OPD visit{data.opd.freeVisits === 1 ? " was" : "s were"} free of charge.
              </Text>
            )}
          </Panel>
        </Grid>

        <Panel title="Today's activity" subtitle="Latest registrations at the desk" icon={faClockRotateLeft} bodyPadding={false}>
          {!data || data.activity.length === 0 ? (
            <Box px={{ base: "4", md: "5" }} pb="4">
              <EmptyState text={data ? "Nothing registered yet today." : "Loading…"} />
            </Box>
          ) : (
            // Two columns on wide screens, filled top-to-bottom so the newest-first order still reads down the page.
            <Grid
              templateColumns={{ base: "minmax(0, 1fr)", lg: "repeat(2, minmax(0, 1fr))" }}
              templateRows={{ lg: `repeat(${Math.ceil(data.activity.length / 2)}, auto)` }}
              gridAutoFlow={{ lg: "column" }}
              columnGap="0"
            >
              {data.activity.map((row, index) => {
                const look = activityLook[row.kind];
                return (
                  <Flex key={`${row.kind}-${row.at}-${index}`} align="center" gap="3" px={{ base: "4", md: "5" }} py="2.5" borderTop={`1px solid ${ink.hairline}`} minW="0">
                    <IconChip icon={look.icon} color={look.color} size="30px" />
                    <Box flex="1" minW="0">
                      <Flex align="baseline" gap="2" minW="0">
                        <Text fontSize="sm" fontWeight="600" lineClamp={1}>
                          {row.patient}
                        </Text>
                        <Text fontSize="xs" color={ink.muted} flexShrink="0">
                          {row.mrNumber}
                        </Text>
                      </Flex>
                      <Text fontSize="xs" color={ink.secondary} lineClamp={1}>
                        <Text as="span" fontWeight="700" color={look.color}>
                          {look.label}
                        </Text>{" "}
                        · {row.detail}
                      </Text>
                    </Box>
                    <Text fontSize="xs" color={ink.muted} flexShrink="0" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {timeOf(row.at)}
                    </Text>
                  </Flex>
                );
              })}
            </Grid>
          )}
        </Panel>
      </DashboardBody>
    </Box>
  );
}
