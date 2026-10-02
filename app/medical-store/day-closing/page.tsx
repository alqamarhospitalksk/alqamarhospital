"use client";

import { useEffect, useState } from "react";
import { Badge, Box, Button, Flex, Grid, Heading, HStack, Input, Table, Text } from "@chakra-ui/react";
import { faArrowTrendDown, faArrowTrendUp, faCashRegister } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";
import { StatCard } from "../../stat-card";

type Summary = {
  cashSales: number;
  cashRefunds: number;
  expectedCash: number;
  otherMethods: { method: string; amount: number }[];
  salesCount: number;
  refundsCount: number;
};
type Closing = {
  closingDate: string;
  cashSales: number;
  cashRefunds: number;
  expectedCash: number;
  countedCash: number;
  difference: number;
  note: string | null;
  closedBy: string;
  updatedAt: string;
};

const money = (value: number) => `PKR ${value.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function differenceLabel(diff: number) {
  if (Math.abs(diff) < 0.005) return { text: "Matches", color: "green" };
  return diff > 0 ? { text: `Over by ${money(diff)}`, color: "blue" } : { text: `Short by ${money(-diff)}`, color: "red" };
}

export default function DayClosingPage() {
  const [date, setDate] = useState(todayStr);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [closing, setClosing] = useState<Closing | null>(null);
  const [recent, setRecent] = useState<Closing[]>([]);
  const [countedCash, setCountedCash] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load(day: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/medical-store/day-closing?date=${day}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Unable to load the day's figures.");
        return;
      }
      setSummary(data.summary);
      setClosing(data.closing);
      setRecent(data.recent ?? []);
      setCountedCash(data.closing ? String(data.closing.countedCash) : "");
      setNote(data.closing?.note ?? "");
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(date);
  }, [date]);

  async function save() {
    if (countedCash === "" || !(Number(countedCash) >= 0)) {
      toast.error("Enter the cash you counted in the drawer.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/medical-store/day-closing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, countedCash: Number(countedCash), note }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Unable to save the day closing.");
        return;
      }
      const label = differenceLabel(data.difference);
      toast.success(`Day closed. Cash ${label.text.toLowerCase()}.`);
      await load(date);
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setSaving(false);
    }
  }

  const liveDiff = summary && countedCash !== "" ? Number(countedCash) - summary.expectedCash : null;

  return (
    <Box minH="100vh" bg="#f5f7f8" color="#17252b">
      <Flex as="header" h="78px" bg="white" borderBottom="1px solid #e2e9e6" align="center" justify="space-between" px={{ base: "20px", md: "42px" }}>
        <Heading size="lg" letterSpacing="-0.04em">Day Closing</Heading>
        <Input type="date" w="170px" bg="white" value={date} max={todayStr()} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </Flex>

      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>
        <Grid templateColumns={{ base: "1fr", sm: "repeat(3, 1fr)" }} gap="4" mb="4">
          <StatCard label="Cash sales" value={loading || !summary ? "…" : money(summary.cashSales)} icon={faArrowTrendUp} color="#22633e" />
          <StatCard label="Cash refunds" value={loading || !summary ? "…" : money(summary.cashRefunds)} icon={faArrowTrendDown} color="#a34258" />
          <StatCard label="Cash that should be in the drawer" value={loading || !summary ? "…" : money(summary.expectedCash)} icon={faCashRegister} color="#123d3b" />
        </Grid>
        {summary && summary.otherMethods.length > 0 && (
          <Text fontSize="xs" color="#607d76" mb="4">
            Not in the drawer: {summary.otherMethods.map((m) => `${m.method.replaceAll("_", " ").toLowerCase()} ${money(m.amount)}`).join(" · ")}
          </Text>
        )}

        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" p={{ base: "20px", md: "28px" }} mb="6">
          <HStack justify="space-between" mb="4" flexWrap="wrap" gap="2">
            <Heading size="sm">Count the Drawer</Heading>
            {closing && <Badge colorPalette="green" borderRadius="full">Closed by {closing.closedBy} — saving again will update it</Badge>}
          </HStack>
          <Grid templateColumns={{ base: "1fr", md: "1fr 2fr" }} gap="3" mb="4">
            <Box>
              <Text fontSize="sm" fontWeight="700" mb="2">Cash counted (PKR)</Text>
              <Input type="number" min="0" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} />
            </Box>
            <Box>
              <Text fontSize="sm" fontWeight="700" mb="2">Note (optional)</Text>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. reason for any difference" />
            </Box>
          </Grid>
          <HStack justify="space-between" flexWrap="wrap" gap="3">
            {liveDiff == null ? (
              <Text fontSize="sm" color="#607d76">Enter the cash you counted to see if it matches.</Text>
            ) : (
              <Badge colorPalette={differenceLabel(liveDiff).color} borderRadius="full" px="3" py="1" fontSize="sm">{differenceLabel(liveDiff).text}</Badge>
            )}
            <Button bg="#123d3b" color="white" _hover={{ bg: "#255d58" }} loading={saving} onClick={save}>
              {closing ? "Update Closing" : "Close Day"}
            </Button>
          </HStack>
        </Box>

        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
          <Box p="5" borderBottom="1px solid #edf2f0">
            <Heading size="sm">Past Closings</Heading>
          </Box>
          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>Date</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Should be</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Counted</Table.ColumnHeader>
                  <Table.ColumnHeader>Result</Table.ColumnHeader>
                  <Table.ColumnHeader>Note</Table.ColumnHeader>
                  <Table.ColumnHeader>By</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {recent.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={6}><Text py="8" textAlign="center" color="#77908b" fontSize="sm">No days closed yet.</Text></Table.Cell>
                  </Table.Row>
                ) : (
                  recent.map((c) => {
                    const label = differenceLabel(c.difference);
                    return (
                      <Table.Row key={c.closingDate}>
                        <Table.Cell fontSize="sm" fontWeight="700">{new Date(c.closingDate).toLocaleDateString("en-PK", { timeZone: "UTC" })}</Table.Cell>
                        <Table.Cell textAlign="right" fontSize="sm">{money(c.expectedCash)}</Table.Cell>
                        <Table.Cell textAlign="right" fontSize="sm">{money(c.countedCash)}</Table.Cell>
                        <Table.Cell><Badge colorPalette={label.color} borderRadius="full">{label.text}</Badge></Table.Cell>
                        <Table.Cell fontSize="xs" color="#556e68">{c.note ?? "—"}</Table.Cell>
                        <Table.Cell fontSize="xs">{c.closedBy}</Table.Cell>
                      </Table.Row>
                    );
                  })
                )}
              </Table.Body>
            </Table.Root>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
