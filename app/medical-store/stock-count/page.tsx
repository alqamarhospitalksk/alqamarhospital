"use client";

import { useEffect, useState } from "react";
import { Box, Button, Flex, Heading, HStack, Input, Table, Text } from "@chakra-ui/react";
import { toast } from "react-toastify";
import { TablePagination } from "../../table-pagination";

type CountBatch = { batchId: number; medicineName: string; unit: string; batchNumber: string | null; expiryDate: string; systemQuantity: number };

export default function StockCountPage() {
  const [batches, setBatches] = useState<CountBatch[]>([]);
  const [counted, setCounted] = useState<Record<number, string>>({});
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/medical-store/stock-count");
      const data = await res.json();
      if (res.ok) {
        setBatches(data.batches ?? []);
        setCounted({});
      } else toast.error(data.error ?? "Unable to load the count sheet.");
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Only lines where a count was typed AND it differs from the system are sent.
  const differences = batches
    .filter((b) => counted[b.batchId] !== undefined && counted[b.batchId] !== "" && Number(counted[b.batchId]) !== b.systemQuantity)
    .map((b) => ({ ...b, countedQuantity: Number(counted[b.batchId]) }));

  async function save() {
    if (differences.some((d) => !Number.isFinite(d.countedQuantity) || d.countedQuantity < 0)) {
      toast.error("Counts must be zero or more.");
      return;
    }
    if (differences.length === 0) {
      toast.info("Every count matches the system — nothing to save.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/medical-store/stock-count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note,
          counts: differences.map((d) => ({ batchId: d.batchId, systemQuantity: d.systemQuantity, countedQuantity: d.countedQuantity })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Unable to save the stock count.");
        return;
      }
      toast.success(
        `Stock count saved: ${data.losses} short, ${data.gains} extra.${data.lossValue > 0 ? ` PKR ${Number(data.lossValue).toLocaleString("en-PK")} recorded as store wastage.` : ""}`
      );
      setNote("");
      await load();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setSaving(false);
    }
  }

  const shown = batches.filter((b) => b.medicineName.toLowerCase().includes(search.trim().toLowerCase()));
  // Typed counts live in `counted` (keyed by batch), so they survive paging and are all saved together.
  const currentPage = Math.min(page, Math.max(1, Math.ceil(shown.length / pageSize)));
  const visible = shown.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <Box minH="100vh" bg="#f5f7f8" color="#17252b">
      <Flex as="header" h="78px" bg="white" borderBottom="1px solid #e2e9e6" align="center" px={{ base: "20px", md: "42px" }}>
        <Heading size="lg" letterSpacing="-0.04em">Stock Count</Heading>
      </Flex>

      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>

        <HStack mb="4" gap="3" flexWrap="wrap">
          <Input maxW="320px" bg="white" placeholder="Search medicine…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <Button size="sm" variant="outline" borderColor="#c8dad5" color="#126b68" onClick={() => void load()} loading={loading}>
            Reload sheet
          </Button>
        </HStack>

        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden" mb="5">
          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>Medicine</Table.ColumnHeader>
                  <Table.ColumnHeader>Batch</Table.ColumnHeader>
                  <Table.ColumnHeader>Expiry</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">System says</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Counted</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Difference</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {shown.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={6}><Text py="8" textAlign="center" color="#77908b" fontSize="sm">{loading ? "Loading…" : "No stock to count."}</Text></Table.Cell>
                  </Table.Row>
                ) : (
                  visible.map((b) => {
                    const value = counted[b.batchId] ?? "";
                    const diff = value === "" ? null : Number(value) - b.systemQuantity;
                    return (
                      <Table.Row key={b.batchId} bg={diff != null && diff !== 0 ? "#fdf8ef" : undefined}>
                        <Table.Cell fontWeight="700" fontSize="sm">{b.medicineName}</Table.Cell>
                        <Table.Cell fontSize="xs">{b.batchNumber ?? "—"}</Table.Cell>
                        <Table.Cell fontSize="xs">{new Date(b.expiryDate).toLocaleDateString("en-GB", { timeZone: "UTC" })}</Table.Cell>
                        <Table.Cell textAlign="right" fontSize="sm">{b.systemQuantity} {b.unit.toLowerCase()}</Table.Cell>
                        <Table.Cell textAlign="right" w="130px">
                          <Input
                            size="sm"
                            type="number"
                            min="0"
                            placeholder={String(b.systemQuantity)}
                            value={value}
                            onChange={(e) => setCounted((prev) => ({ ...prev, [b.batchId]: e.target.value }))}
                          />
                        </Table.Cell>
                        <Table.Cell textAlign="right" fontWeight="800" color={diff == null || diff === 0 ? "#77908b" : diff > 0 ? "#22633e" : "#a34258"}>
                          {diff == null ? "—" : diff === 0 ? "Matches" : diff > 0 ? `+${diff}` : diff}
                        </Table.Cell>
                      </Table.Row>
                    );
                  })
                )}
              </Table.Body>
            </Table.Root>
          </Box>
          <TablePagination total={shown.length} page={currentPage} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </Box>

        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" p="5">
          <Text fontSize="sm" fontWeight="700" mb="2">Note (optional)</Text>
          <Input mb="4" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Monthly count, September" />
          <HStack justify="space-between" flexWrap="wrap" gap="3">
            <Text fontSize="sm" color="#607d76">
              {differences.length === 0 ? "No differences entered yet." : `${differences.length} line${differences.length === 1 ? "" : "s"} will be corrected.`}
            </Text>
            <Button bg="#123d3b" color="white" _hover={{ bg: "#255d58" }} loading={saving} onClick={save} disabled={differences.length === 0}>
              Save Count
            </Button>
          </HStack>
        </Box>
      </Box>
    </Box>
  );
}
