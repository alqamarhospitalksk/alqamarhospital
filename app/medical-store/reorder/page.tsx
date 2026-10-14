"use client";

import { useEffect, useState } from "react";
import { Badge, Box, Button, Flex, Heading, HStack, Table, Text } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPrint } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";
import { TablePagination } from "../../table-pagination";

type ReorderItem = {
  medicineId: number;
  name: string;
  unit: string;
  currentStock: number;
  reorderLevel: number;
  neverStocked: boolean;
  suggestedQuantity: number | null;
  lastSupplierName: string | null;
  lastUnitCost: number | null;
  estimatedCost: number | null;
};

const money = (value: number) => `PKR ${value.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

export default function ReorderListPage() {
  const [items, setItems] = useState<ReorderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNeverStocked, setShowNeverStocked] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    fetch("/api/medical-store/reorder")
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) setItems(data.items ?? []);
        else toast.error(data.error ?? "Unable to load the reorder list.");
      })
      .catch(() => toast.error("Unable to reach the clinic server."))
      .finally(() => setLoading(false));
  }, []);

  const shown = items.filter((i) => showNeverStocked || !i.neverStocked);
  const totalEstimate = shown.reduce((sum, i) => sum + (i.estimatedCost ?? 0), 0);
  const visible = shown.slice((page - 1) * pageSize, page * pageSize);

  function printList() {
    const rows = shown
      .map((i) => `<tr><td>${escapeHtml(i.name)}</td><td>${i.currentStock} ${escapeHtml(i.unit.toLowerCase())}</td><td>${i.suggestedQuantity ?? ""}</td><td>${escapeHtml(i.lastSupplierName ?? "")}</td><td></td></tr>`)
      .join("");
    const win = window.open("", "reorder-list", "width=800,height=900");
    if (!win) {
      toast.error("Allow pop-ups to print the list.");
      return;
    }
    win.addEventListener("load", () => {
      win.focus();
      win.print();
      win.addEventListener("afterprint", () => win.close(), { once: true });
    }, { once: true });
    win.document.write(`<!doctype html><html><head><title>Reorder List</title><style>
      body { font-family: Arial, sans-serif; font-size: 11pt; padding: 12mm; }
      h1 { font-size: 16pt; margin: 0 0 4mm; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #999; padding: 2mm 3mm; text-align: left; }
      th { background: #eee; }
    </style></head><body>
      <h1>Medicine Reorder List</h1>
      <p>${escapeHtml(new Date().toLocaleDateString("en-GB"))}</p>
      <table><thead><tr><th>Medicine</th><th>In stock</th><th>Order qty</th><th>Last supplier</th><th>Ordered ✓</th></tr></thead><tbody>${rows}</tbody></table>
    </body></html>`);
    win.document.close();
  }

  return (
    <Box minH="100vh" bg="#f5f7f8" color="#17252b">
      <Flex as="header" h="78px" bg="white" borderBottom="1px solid #e2e9e6" align="center" justify="space-between" px={{ base: "20px", md: "42px" }}>
        <Heading size="lg" letterSpacing="-0.04em">Reorder List</Heading>
        <Button bg="#123d3b" color="white" _hover={{ bg: "#255d58" }} onClick={printList} disabled={shown.length === 0}>
          <FontAwesomeIcon icon={faPrint} />
          &nbsp; Print List
        </Button>
      </Flex>

      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>
        <HStack justify="space-between" mb="4" flexWrap="wrap" gap="3">
          <Button
            size="sm"
            variant={showNeverStocked ? "solid" : "outline"}
            bg={showNeverStocked ? "linear-gradient(135deg, #1a8070 0%, #0f5a52 100%)" : "white"}
            color={showNeverStocked ? "white" : "#3e5e58"}
            borderColor={showNeverStocked ? "transparent" : "#c8dad5"}
            borderRadius="8px"
            fontWeight="700"
            boxShadow={showNeverStocked ? "0 2px 8px rgba(26,128,112,0.25)" : "none"}
            onClick={() => { setShowNeverStocked((v) => !v); setPage(1); }}
          >
            {showNeverStocked ? "Hide never-purchased medicines" : "Also show never-purchased medicines"}
          </Button>
        </HStack>

        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>Medicine</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">In stock</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Low Stock level</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Suggested order</Table.ColumnHeader>
                  <Table.ColumnHeader>Last supplier</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Last cost / unit</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Estimated cost</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {shown.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={7}>
                      <Text py="8" textAlign="center" color="#77908b" fontSize="sm">{loading ? "Loading…" : "Nothing needs reordering right now."}</Text>
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  visible.map((i) => (
                    <Table.Row key={i.medicineId}>
                      <Table.Cell fontWeight="700" fontSize="sm">
                        {i.name}
                        {i.neverStocked && <Badge colorPalette="gray" borderRadius="full" ml="2">Never purchased</Badge>}
                        {!i.neverStocked && i.currentStock === 0 && <Badge colorPalette="red" borderRadius="full" ml="2">Out of stock</Badge>}
                      </Table.Cell>
                      <Table.Cell textAlign="right" fontSize="sm">{i.currentStock} {i.unit.toLowerCase()}</Table.Cell>
                      <Table.Cell textAlign="right" fontSize="sm">{i.reorderLevel}</Table.Cell>
                      <Table.Cell textAlign="right" fontSize="sm" fontWeight="800" color="#126b68">
                        {i.suggestedQuantity != null ? `${i.suggestedQuantity} ${i.unit.toLowerCase()}` : <Text as="span" fontSize="xs" fontWeight="500" color="#77908b">Set a Low Stock level</Text>}
                      </Table.Cell>
                      <Table.Cell fontSize="xs">{i.lastSupplierName ?? "—"}</Table.Cell>
                      <Table.Cell textAlign="right" fontSize="sm">{i.lastUnitCost != null ? money(i.lastUnitCost) : "—"}</Table.Cell>
                      <Table.Cell textAlign="right" fontSize="sm">{i.estimatedCost != null ? money(i.estimatedCost) : "—"}</Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table.Root>
          </Box>
          {shown.length > 0 && (
            <Flex justify="flex-end" px="5" py="4" borderTop="1px solid #edf2f0">
              <Text fontWeight="800" color="#123d3b">Estimated total: {money(totalEstimate)}</Text>
            </Flex>
          )}
          <TablePagination total={shown.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </Box>
      </Box>
    </Box>
  );
}
