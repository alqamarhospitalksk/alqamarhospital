"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Box, Button, Flex, Grid, Heading, HStack, Table, Text } from "@chakra-ui/react";
import { faCoins, faHourglassHalf, faSkullCrossbones } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";
import { StatCard } from "../../stat-card";
import { TablePagination } from "../../table-pagination";

type Batch = {
  batchId: number;
  medicineName: string;
  unit: string;
  batchNumber: string | null;
  expiryDate: string;
  daysLeft: number;
  quantity: number;
  costValue: number;
  supplierId: number;
  supplierName: string;
};
type Filter = "expired" | "30" | "60" | "90" | "all";

const filters: { value: Filter; label: string }[] = [
  { value: "expired", label: "Already expired" },
  { value: "30", label: "Within 30 days" },
  { value: "60", label: "Within 60 days" },
  { value: "90", label: "Within 90 days" },
  { value: "all", label: "All stock" },
];

const money = (value: number) => `PKR ${value.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;

function matches(batch: Batch, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "expired") return batch.daysLeft < 0;
  return batch.daysLeft >= 0 && batch.daysLeft <= Number(filter);
}

export default function ExpiryTrackerPage() {
  const router = useRouter();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("30");
  const [writingOffId, setWritingOffId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  async function load() {
    try {
      const res = await fetch("/api/medical-store/expiry");
      const data = await res.json();
      if (res.ok) setBatches(data.batches ?? []);
      else toast.error(data.error ?? "Unable to load expiry data.");
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function writeOff(batch: Batch) {
    setWritingOffId(batch.batchId);
    try {
      const res = await fetch("/api/medical-store/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: batch.batchId,
          type: "EXPIRED",
          quantity: batch.quantity,
          reason: batch.daysLeft < 0 ? "Expired stock written off from Expiry Tracker" : `Written off ${batch.daysLeft} day(s) before expiry from Expiry Tracker`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Unable to write off this batch.");
        return;
      }
      toast.success(`${batch.quantity} ${batch.unit.toLowerCase()} of ${batch.medicineName} written off.`);
      await load();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setWritingOffId(null);
    }
  }

  function confirmWriteOff(batch: Batch) {
    toast.warn(
      ({ closeToast }) => (
        <Box>
          <Text fontSize="sm" fontWeight="700" mb="1">Write off {batch.medicineName}?</Text>
          <Text fontSize="xs" mb="3">
            All {batch.quantity} {batch.unit.toLowerCase()} in this batch will be removed from stock and {money(batch.costValue)} will be recorded as store wastage.
          </Text>
          <HStack gap="2" justify="flex-end">
            <Button size="xs" variant="outline" onClick={closeToast}>Cancel</Button>
            <Button
              size="xs"
              bg="#a34258"
              color="white"
              _hover={{ bg: "#8a3549" }}
              onClick={() => {
                closeToast();
                void writeOff(batch);
              }}
            >
              Write Off
            </Button>
          </HStack>
        </Box>
      ),
      { toastId: `write-off-${batch.batchId}`, autoClose: false, closeOnClick: false, draggable: false }
    );
  }

  const shown = batches.filter((b) => matches(b, filter));
  // A write-off can empty the last page; fall back to the last page that still has rows.
  const currentPage = Math.min(page, Math.max(1, Math.ceil(shown.length / pageSize)));
  const visible = shown.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const expired = batches.filter((b) => b.daysLeft < 0);
  const within30 = batches.filter((b) => b.daysLeft >= 0 && b.daysLeft <= 30);

  return (
    <Box minH="100vh" bg="#f5f7f8" color="#17252b">
      <Flex as="header" h="78px" bg="white" borderBottom="1px solid #e2e9e6" align="center" px={{ base: "20px", md: "42px" }}>
        <Heading size="lg" letterSpacing="-0.04em">Expiry Tracker</Heading>
      </Flex>

      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>
        <Grid templateColumns={{ base: "1fr", sm: "repeat(3, 1fr)" }} gap="4" mb="6">
          <StatCard label="Already expired" value={loading ? "…" : `${expired.length} batch${expired.length === 1 ? "" : "es"}`} icon={faSkullCrossbones} color="#7c2d2d" />
          <StatCard label="Expiring within 30 days" value={loading ? "…" : `${within30.length} batch${within30.length === 1 ? "" : "es"}`} icon={faHourglassHalf} color="#a34258" />
          <StatCard label="Value at risk (30 days + expired)" value={loading ? "…" : money([...expired, ...within30].reduce((sum, b) => sum + b.costValue, 0))} icon={faCoins} color="#b26732" />
        </Grid>

        <HStack gap="2" mb="4" flexWrap="wrap" justify="flex-end">
          {filters.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={filter === f.value ? "solid" : "outline"}
              bg={filter === f.value ? "linear-gradient(135deg, #1a8070 0%, #0f5a52 100%)" : "white"}
              color={filter === f.value ? "white" : "#3e5e58"}
              borderColor={filter === f.value ? "transparent" : "#c8dad5"}
              borderRadius="8px"
              fontWeight="700"
              boxShadow={filter === f.value ? "0 2px 8px rgba(26,128,112,0.25)" : "none"}
              onClick={() => { setFilter(f.value); setPage(1); }}
            >
              {f.label}
            </Button>
          ))}
        </HStack>

        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>Medicine</Table.ColumnHeader>
                  <Table.ColumnHeader>Batch</Table.ColumnHeader>
                  <Table.ColumnHeader>Expiry</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Quantity</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Value (cost)</Table.ColumnHeader>
                  <Table.ColumnHeader>Supplier</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Action</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {shown.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={7}>
                      <Text py="8" textAlign="center" color="#77908b" fontSize="sm">{loading ? "Loading…" : "Nothing in this range."}</Text>
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  visible.map((b) => (
                    <Table.Row key={b.batchId}>
                      <Table.Cell fontWeight="700" fontSize="sm">{b.medicineName}</Table.Cell>
                      <Table.Cell fontSize="xs">{b.batchNumber ?? "—"}</Table.Cell>
                      <Table.Cell>
                        <Text fontSize="sm">{new Date(b.expiryDate).toLocaleDateString("en-GB", { timeZone: "UTC" })}</Text>
                        <Badge colorPalette={b.daysLeft < 0 ? "red" : b.daysLeft <= 30 ? "orange" : b.daysLeft <= 90 ? "yellow" : "green"} borderRadius="full" mt="1">
                          {b.daysLeft < 0 ? `Expired ${-b.daysLeft} day${b.daysLeft === -1 ? "" : "s"} ago` : b.daysLeft === 0 ? "Expires today" : `${b.daysLeft} day${b.daysLeft === 1 ? "" : "s"} left`}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell textAlign="right" fontSize="sm">{b.quantity} {b.unit.toLowerCase()}</Table.Cell>
                      <Table.Cell textAlign="right" fontSize="sm">{money(b.costValue)}</Table.Cell>
                      <Table.Cell fontSize="xs">{b.supplierName}</Table.Cell>
                      <Table.Cell textAlign="right">
                        <HStack gap="2" justify="flex-end">
                          <Button size="xs" variant="outline" borderColor="#c8dad5" color="#126b68" onClick={() => router.push(`/medical-store/returns/purchase?supplierId=${b.supplierId}`)}>
                            Return to supplier
                          </Button>
                          <Button size="xs" bg="#a34258" color="white" _hover={{ bg: "#8a3549" }} loading={writingOffId === b.batchId} onClick={() => confirmWriteOff(b)}>
                            Write off
                          </Button>
                        </HStack>
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table.Root>
          </Box>
          <TablePagination total={shown.length} page={currentPage} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </Box>
      </Box>
    </Box>
  );
}
