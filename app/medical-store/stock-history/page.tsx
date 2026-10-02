"use client";

import { useEffect, useState } from "react";
import { Badge, Box, Flex, Heading, NativeSelect, Table, Text } from "@chakra-ui/react";
import { toast } from "react-toastify";
import { TablePagination } from "../../table-pagination";

type Medicine = { id: number; name: string; unit: string };
type Movement = {
  id: number;
  type: string;
  change: number;
  quantity: number;
  beforeQuantity: number;
  afterQuantity: number;
  batchNumber: string | null;
  reference: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
};
type History = { medicine: { id: number; name: string; unit: string; currentStock: number }; movements: Movement[] };

const typeLabels: Record<string, { label: string; color: string }> = {
  OPENING_STOCK: { label: "Opening stock", color: "gray" },
  PURCHASE: { label: "Purchased", color: "green" },
  SALE: { label: "Sold", color: "blue" },
  ADJUSTMENT_IN: { label: "Added (adjustment)", color: "teal" },
  ADJUSTMENT_OUT: { label: "Removed (adjustment)", color: "orange" },
  SALE_RETURN: { label: "Customer returned", color: "purple" },
  PURCHASE_RETURN: { label: "Returned to supplier", color: "red" },
};

export default function StockHistoryPage() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [medicineId, setMedicineId] = useState("");
  const [history, setHistory] = useState<History | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    fetch("/api/medical-store/medicines")
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) setMedicines(data.items ?? []);
        else toast.error(data.error ?? "Unable to load medicines.");
      })
      .catch(() => toast.error("Unable to reach the clinic server."));
  }, []);

  async function loadHistory(id: string) {
    setMedicineId(id);
    setPage(1);
    setHistory(null);
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/medical-store/stock-history?medicineId=${id}`);
      const data = await res.json();
      if (res.ok) setHistory(data);
      else toast.error(data.error ?? "Unable to load stock history.");
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setLoading(false);
    }
  }

  const unit = history?.medicine.unit.toLowerCase() ?? "";

  return (
    <Box minH="100vh" bg="#f5f7f8" color="#17252b">
      <Flex as="header" h="78px" bg="white" borderBottom="1px solid #e2e9e6" align="center" px={{ base: "20px", md: "42px" }}>
        <Heading size="lg" letterSpacing="-0.04em">Stock History</Heading>
      </Flex>

      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" p="5" mb="6">
          <Text fontSize="sm" fontWeight="700" mb="2">Medicine</Text>
          <NativeSelect.Root maxW="420px">
            <NativeSelect.Field value={medicineId} onChange={(e) => void loadHistory(e.target.value)}>
              <option value="">Select a medicine…</option>
              {medicines.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </NativeSelect.Field>
          </NativeSelect.Root>
          {history && (
            <Text fontSize="sm" color="#607d76" mt="3">
              Current stock: <Text as="span" fontWeight="800" color="#123d3b">{history.medicine.currentStock} {unit}</Text>
            </Text>
          )}
        </Box>

        {medicineId && (
          <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
            <Box overflowX="auto">
              <Table.Root size="sm">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader>Date</Table.ColumnHeader>
                    <Table.ColumnHeader>What happened</Table.ColumnHeader>
                    <Table.ColumnHeader>Reference</Table.ColumnHeader>
                    <Table.ColumnHeader>Batch</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right">Change</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right">Batch stock (before → after)</Table.ColumnHeader>
                    <Table.ColumnHeader>By</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {loading || !history || history.movements.length === 0 ? (
                    <Table.Row>
                      <Table.Cell colSpan={7}>
                        <Text py="8" textAlign="center" color="#77908b" fontSize="sm">
                          {loading ? "Loading…" : "No stock movements recorded for this medicine yet."}
                        </Text>
                      </Table.Cell>
                    </Table.Row>
                  ) : (
                    history.movements.slice((page - 1) * pageSize, page * pageSize).map((m) => {
                      const meta = typeLabels[m.type] ?? { label: m.type, color: "gray" };
                      return (
                        <Table.Row key={m.id}>
                          <Table.Cell fontSize="xs" whiteSpace="nowrap">{new Date(m.createdAt).toLocaleString("en-PK")}</Table.Cell>
                          <Table.Cell>
                            <Badge colorPalette={meta.color} borderRadius="full">{meta.label}</Badge>
                            {m.notes && <Text fontSize="xs" color="#77908b" mt="1" maxW="280px">{m.notes}</Text>}
                          </Table.Cell>
                          <Table.Cell fontSize="xs" fontWeight="700" color="#126b68">{m.reference ?? "—"}</Table.Cell>
                          <Table.Cell fontSize="xs">{m.batchNumber ?? "—"}</Table.Cell>
                          <Table.Cell textAlign="right" fontWeight="800" color={m.change > 0 ? "#22633e" : m.change < 0 ? "#a34258" : "#77908b"}>
                            {m.change > 0 ? `+${m.change}` : m.change}
                            {m.change === 0 && m.quantity > 0 && <Text as="span" fontSize="10px" fontWeight="600"> (kept aside)</Text>}
                          </Table.Cell>
                          <Table.Cell textAlign="right" fontSize="xs" whiteSpace="nowrap">{m.beforeQuantity} → {m.afterQuantity}</Table.Cell>
                          <Table.Cell fontSize="xs">{m.createdBy}</Table.Cell>
                        </Table.Row>
                      );
                    })
                  )}
                </Table.Body>
              </Table.Root>
            </Box>
            <TablePagination total={history?.movements.length ?? 0} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </Box>
        )}
      </Box>
    </Box>
  );
}
