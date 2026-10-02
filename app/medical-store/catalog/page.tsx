"use client";

import { FormEvent, useEffect, useState } from "react";
import { Badge, Box, Button, Field, Flex, Grid, Heading, HStack, Input, NativeSelect, Table, Text } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen, faPlus, faPrescriptionBottleMedical, faTrash, faXmark } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";

const categories = ["TABLET", "SYRUP", "INJECTION", "CAPSULE", "OINTMENT", "OTHER"];
const units = ["STRIP", "BOTTLE", "BOX", "PIECE", "VIAL"];

type PackagingLevel = { level: number; name: string; unitsInLevel: number; cumulativeUnits: number };

type MedicineItem = {
  id: number;
  name: string;
  genericName: string | null;
  category: string;
  unit: string;
  packagingLevels: PackagingLevel[];
  salePrice: string;
  reorderLevel: string;
  active: boolean;
  totalQuantity: number;
  nearestExpiry: string | null;
  neverStocked: boolean;
  lowStock: boolean;
  expired: boolean;
  expiringSoon: boolean;
};

type LevelRow = { name: string; unitsInLevel: string };

const emptyForm = { name: "", genericName: "", category: "TABLET", unit: "STRIP", salePrice: "", reorderLevel: "" };

function daysUntil(dateStr: string) {
  // Compare pure calendar dates in UTC on both sides — the expiry date is stored as
  // UTC midnight, so mixing it with a local-midnight "today" can round a day off
  // depending on the timezone (e.g. UTC+5 turned "9 days" into "10 days").
  const target = new Date(dateStr);
  const now = new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const targetUTC = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  return Math.max(0, Math.round((targetUTC - todayUTC) / (24 * 60 * 60 * 1000)));
}

function cumulativePreview(unit: string, rows: LevelRow[]) {
  let cumulative = 1;
  return rows.map((row) => {
    const n = Number(row.unitsInLevel || 0);
    cumulative *= n > 0 ? n : 0;
    return { name: row.name || "(level)", cumulative };
  });
}

// Rough size order of common pack names, so the form can catch a level list typed upside down
// (e.g. "BOX contains 100 CARTONs"). Unknown names are never flagged for order.
const packSize: Record<string, number> = { TABLET: 1, CAPSULE: 1, PIECE: 1, STRIP: 1, BOTTLE: 1, VIAL: 1, SACHET: 1, PACK: 2, BOX: 3, CARTON: 4, CASE: 5 };
const levelPlaceholders = ["e.g. BOX", "e.g. CARTON", "e.g. CASE"];

// One message per row (null = fine), checked live while typing so mistakes show before saving.
function levelRowProblems(unit: string, rows: LevelRow[]): (string | null)[] {
  const base = unit.trim().toUpperCase();
  return rows.map((row, index) => {
    const name = row.name.trim().toUpperCase();
    if (!name) return null;
    if (/\d/.test(name)) return `Write only the pack name (like BOX), without numbers. The quantity goes in the next box.`;
    if (name === base) return `${name} is already the base unit. Give this pack a different name (e.g. BOX or PACK).`;
    if (rows.slice(0, index).some((r) => r.name.trim().toUpperCase() === name)) return `${name} is used twice. Each level needs its own name.`;
    const below = index === 0 ? base : rows[index - 1].name.trim().toUpperCase();
    if (packSize[name] && packSize[below] && packSize[name] <= packSize[below]) {
      return `A ${name} is not bigger than a ${below}. Start with the smallest pack and go bigger in each row.`;
    }
    return null;
  });
}

export default function MedicineCatalogPage() {
  const [items, setItems] = useState<MedicineItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [levelRows, setLevelRows] = useState<LevelRow[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/medical-store/medicines");
      const data = await res.json();
      if (res.ok) setItems(data.items ?? []);
      else toast.error(data.error ?? "Unable to load the medicine catalog.");
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openAddModal() {
    setEditingId(null);
    setForm(emptyForm);
    setLevelRows([]);
    setShowModal(true);
  }

  function openEditModal(item: MedicineItem) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      genericName: item.genericName ?? "",
      category: item.category,
      unit: item.unit,
      salePrice: item.salePrice,
      reorderLevel: item.reorderLevel,
    });
    setLevelRows(
      item.packagingLevels
        .slice()
        .sort((a, b) => a.level - b.level)
        .map((l) => ({ name: l.name, unitsInLevel: String(l.unitsInLevel) }))
    );
    setShowModal(true);
  }

  function addLevelRow() {
    setLevelRows((prev) => [...prev, { name: "", unitsInLevel: "" }]);
  }
  function updateLevelRow(index: number, patch: Partial<LevelRow>) {
    setLevelRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function removeLevelRow(index: number) {
    setLevelRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    for (const row of levelRows) {
      if (!row.name.trim() || !Number(row.unitsInLevel) || Number(row.unitsInLevel) <= 0) {
        toast.error("Each packaging level needs a name and a quantity greater than zero.");
        return;
      }
    }
    const levelProblem = levelRowProblems(form.unit, levelRows).find(Boolean);
    if (levelProblem) {
      toast.error(levelProblem);
      return;
    }
    setSaving(true);
    try {
      const url = editingId ? `/api/medical-store/medicines/${editingId}` : "/api/medical-store/medicines";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          packagingLevels: levelRows.map((r) => ({ name: r.name.trim().toUpperCase(), unitsInLevel: Number(r.unitsInLevel) })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Unable to save medicine.");
        return;
      }
      toast.success(editingId ? "Medicine updated." : "Medicine added to catalog.");
      setShowModal(false);
      await load();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setSaving(false);
    }
  }

  const preview = cumulativePreview(form.unit, levelRows);
  const rowProblems = levelRowProblems(form.unit, levelRows);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const visibleItems = items.slice((page - 1) * pageSize, page * pageSize);
  const firstRecord = items.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRecord = Math.min(page * pageSize, items.length);

  return (
    <Box minH="100vh" bg="#f5f7f8" color="#17252b">
      <Flex as="header" h="78px" bg="white" borderBottom="1px solid #e2e9e6" align="center" justify="space-between" px={{ base: "20px", md: "42px" }}>
        <Box>
          <Heading size="lg" letterSpacing="-0.04em">
            Medicine Catalog
          </Heading>
        </Box>
        <Button bg="#123d3b" color="white" borderRadius="8px" _hover={{ bg: "#255d58" }} onClick={openAddModal}>
          <FontAwesomeIcon icon={faPlus} />
          &nbsp; Add Medicine
        </Button>
      </Flex>

      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
          <Box px="24px" py="20px" borderBottom="1px solid #edf2f0">
            <HStack gap="3">
              <Flex w="34px" h="34px" bg="#e9f1ef" color="#126b68" borderRadius="9px" align="center" justify="center">
                <FontAwesomeIcon icon={faPrescriptionBottleMedical} />
              </Flex>
              <Heading size="sm">Medicines in Catalog</Heading>
            </HStack>
          </Box>
          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg="#fafcfb">
                  <Table.ColumnHeader>Name</Table.ColumnHeader>
                  <Table.ColumnHeader>Category</Table.ColumnHeader>
                  <Table.ColumnHeader>Packaging</Table.ColumnHeader>
                  <Table.ColumnHeader>Stock</Table.ColumnHeader>
                  <Table.ColumnHeader>Nearest Expiry</Table.ColumnHeader>
                  <Table.ColumnHeader>Sale Price</Table.ColumnHeader>
                  <Table.ColumnHeader>Status</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Actions</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {loading ? (
                  <Table.Row><Table.Cell colSpan={8}><Text py="8" textAlign="center" color="#77908b">Loading catalog...</Text></Table.Cell></Table.Row>
                ) : items.length === 0 ? (
                  <Table.Row><Table.Cell colSpan={8}><Text py="8" textAlign="center" color="#77908b">No medicines added yet.</Text></Table.Cell></Table.Row>
                ) : (
                  visibleItems.map((item) => (
                    <Table.Row key={item.id} _hover={{ bg: "#f9fbfa" }}>
                      <Table.Cell>
                        <Text fontWeight="700" fontSize="sm">{item.name}</Text>
                        {item.genericName && <Text fontSize="xs" color="#77908b">{item.genericName}</Text>}
                      </Table.Cell>
                      <Table.Cell fontSize="xs">
                        <Badge colorPalette="purple" borderRadius="full">{item.category}</Badge>
                      </Table.Cell>
                      <Table.Cell fontSize="xs" color="#556e68">
                        {item.packagingLevels.length === 0
                          ? "—"
                          : item.packagingLevels
                              .slice()
                              .sort((a, b) => a.level - b.level)
                              .map((l) => `1 ${l.name} = ${l.cumulativeUnits} ${item.unit.toLowerCase()}`)
                              .join(" · ")}
                      </Table.Cell>
                      <Table.Cell>{item.totalQuantity} {item.unit.toLowerCase()}</Table.Cell>
                      <Table.Cell fontSize="sm">{item.nearestExpiry ? new Date(item.nearestExpiry).toLocaleDateString("en-PK") : "—"}</Table.Cell>
                      <Table.Cell fontWeight="700" color="#126b68">PKR {item.salePrice}</Table.Cell>
                      <Table.Cell>
                        <HStack gap="1" flexWrap="wrap">
                          {item.expired && <Badge colorPalette="red" borderRadius="full">Expired</Badge>}
                          {!item.expired && item.expiringSoon && item.nearestExpiry && (
                            <Badge colorPalette="orange" borderRadius="full">
                              Expiring soon ({daysUntil(item.nearestExpiry)} day{daysUntil(item.nearestExpiry) === 1 ? "" : "s"})
                            </Badge>
                          )}
                          {item.neverStocked && <Badge colorPalette="gray" borderRadius="full">No stock yet</Badge>}
                          {item.lowStock && <Badge colorPalette="yellow" borderRadius="full">Low stock</Badge>}
                          {!item.neverStocked && !item.expired && !item.expiringSoon && !item.lowStock && <Badge colorPalette="green" borderRadius="full">OK</Badge>}
                        </HStack>
                      </Table.Cell>
                      <Table.Cell textAlign="right">
                        <Button size="xs" variant="outline" borderColor="#c8dad5" color="#126b68" onClick={() => openEditModal(item)}>
                          <FontAwesomeIcon icon={faPen} />
                          &nbsp; Edit
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table.Root>
          </Box>
          <Flex
            px="5"
            py="4"
            borderTop="1px solid #edf2f0"
            justify="space-between"
            align={{ base: "stretch", md: "center" }}
            direction={{ base: "column", md: "row" }}
            gap="3"
          >
            <Text fontSize="sm" color="#607d76">
              {items.length ? `Showing ${firstRecord}-${lastRecord} of ${items.length}` : "No records"}
            </Text>
            <HStack gap="2" flexWrap="wrap">
              <Text fontSize="sm" color="#607d76">Rows per page</Text>
              <NativeSelect.Root width="90px" size="sm">
                <NativeSelect.Field
                  value={String(pageSize)}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                >
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </NativeSelect.Field>
              </NativeSelect.Root>
              <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </Button>
              {Array.from({ length: pageCount }, (_, index) => index + 1).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={p === page ? "solid" : "outline"}
                  bg={p === page ? "#123d3b" : undefined}
                  color={p === page ? "white" : undefined}
                  onClick={() => setPage(p)}
                >
                  {p}
                </Button>
              ))}
              <Button size="sm" variant="outline" disabled={page === pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
                Next
              </Button>
            </HStack>
          </Flex>
        </Box>
      </Box>

      {showModal && (
        <Flex position="fixed" inset="0" bg="rgba(15, 30, 28, 0.55)" backdropFilter="blur(3px)" zIndex="100" align="center" justify="center" p="4">
          <Box bg="white" borderRadius="16px" w="full" maxW="640px" boxShadow="0 20px 40px rgba(0,0,0,0.2)" overflow="hidden">
            <Flex justify="space-between" align="center" px="28px" py="20px" bg="#123d3b" color="white">
              <Heading size="sm">{editingId ? "Edit Medicine" : "Add Medicine"}</Heading>
              <Button variant="ghost" color="white" _hover={{ bg: "#255d58" }} p="2" minW="auto" onClick={() => setShowModal(false)}>
                <FontAwesomeIcon icon={faXmark} size="lg" />
              </Button>
            </Flex>
            <form onSubmit={submit}>
              <Box p="28px" maxH="70vh" overflowY="auto">
                <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap="5" mb="6">
                  <Field.Root required>
                    <Field.Label fontWeight="700">Medicine Name</Field.Label>
                    <Input placeholder="e.g. Amoxicillin 500mg" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </Field.Root>
                  <Field.Root>
                    <Field.Label fontWeight="700">Generic Name</Field.Label>
                    <Input placeholder="e.g. Amoxicillin" value={form.genericName} onChange={(e) => setForm({ ...form, genericName: e.target.value })} />
                  </Field.Root>
                  <Field.Root required>
                    <Field.Label fontWeight="700">Category</Field.Label>
                    <NativeSelect.Root>
                      <NativeSelect.Field value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                      </NativeSelect.Field>
                    </NativeSelect.Root>
                  </Field.Root>
                  <Field.Root required>
                    <Field.Label fontWeight="700">Base (Smallest) Unit</Field.Label>
                    <NativeSelect.Root>
                      <NativeSelect.Field value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                        {units.map((u) => <option key={u} value={u}>{u}</option>)}
                      </NativeSelect.Field>
                    </NativeSelect.Root>
                  </Field.Root>
                  <Field.Root required>
                    <Field.Label fontWeight="700">Sale Price (PKR, per {form.unit.toLowerCase() || "unit"})</Field.Label>
                    <Input type="number" min="0" step="0.01" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} />
                  </Field.Root>
                  <Field.Root required>
                    <Field.Label fontWeight="700">Low Stock</Field.Label>
                    <Input type="number" min="0" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} />
                  </Field.Root>
                </Grid>

                <Box borderTop="1px solid #edf2f0" pt="5">
                  <HStack justify="space-between" mb="2">
                    <Text fontWeight="700" fontSize="sm">Packaging Levels</Text>
                    <Button size="xs" variant="outline" borderColor="#c8dad5" color="#126b68" onClick={addLevelRow} type="button">
                      <FontAwesomeIcon icon={faPlus} />
                      &nbsp; Add Level
                    </Button>
                  </HStack>
                  <Box fontSize="xs" color="#556e68" mb="3" bg="#f5f9f8" borderRadius="8px" p="3">
                    <Text mb="1">
                      The <b>base unit</b> is the smallest thing you sell ({form.unit.toLowerCase() || "unit"}). Add bigger packs here, <b>smallest first</b>:
                    </Text>
                    <Text>Row 1: <b>BOX</b> contains <b>10</b> strips</Text>
                    <Text>Row 2: <b>CARTON</b> contains <b>10</b> boxes <Text as="span" color="#77908b">(= 100 strips)</Text></Text>
                    <Text mt="1" color="#77908b">Leave empty if this medicine is only sold loose.</Text>
                  </Box>

                  {levelRows.length === 0 && (
                    <Text fontSize="sm" color="#a0aeaa" mb="3">No packaging levels configured — sold as loose {form.unit.toLowerCase() || "units"} only.</Text>
                  )}

                  {levelRows.map((row, index) => (
                    <Box key={index} mb="2">
                    <HStack gap="2" align="center">
                      <Input size="sm" placeholder={levelPlaceholders[index] ?? "e.g. CASE"} value={row.name} borderColor={rowProblems[index] ? "#d9534f" : undefined} onChange={(e) => updateLevelRow(index, { name: e.target.value })} maxW="160px" />
                      <Text fontSize="sm" color="#556e68">contains</Text>
                      <Input size="sm" type="number" min="1" step="1" placeholder="10" value={row.unitsInLevel} onChange={(e) => updateLevelRow(index, { unitsInLevel: e.target.value })} maxW="90px" />
                      <Text fontSize="sm" color="#556e68">
                        {index === 0 ? (form.unit.toLowerCase() || "units") : `${levelRows[index - 1]?.name || "(level below)"}${row.unitsInLevel && Number(row.unitsInLevel) === 1 ? "" : "s"}`}
                      </Text>
                      <Button size="xs" variant="ghost" color="#a34258" onClick={() => removeLevelRow(index)} type="button">
                        <FontAwesomeIcon icon={faTrash} />
                      </Button>
                    </HStack>
                    {rowProblems[index] && <Text fontSize="xs" color="#c0392b" mt="1">{rowProblems[index]}</Text>}
                    </Box>
                  ))}

                  {preview.length > 0 && (
                    <Box bg="#f5f7f8" borderRadius="8px" p="3" mt="3">
                      <Text fontSize="10px" fontWeight="700" color="#77908b" mb="1" textTransform="uppercase">Calculated</Text>
                      {preview.map((p, i) => (
                        <Text key={i} fontSize="sm" color="#123d3b">
                          1 {p.name.toUpperCase()}
                          {i > 0 && ` = ${levelRows[i].unitsInLevel || 0} ${levelRows[i - 1].name.toUpperCase() || "(level)"}`}
                          {` = ${p.cumulative || 0} ${form.unit.toLowerCase() || "units"}`}
                        </Text>
                      ))}
                    </Box>
                  )}
                </Box>
              </Box>
              <Flex justify="flex-end" gap="3" px="28px" py="18px" bg="#f7faf9" borderTop="1px solid #e2e9e6">
                <Button variant="outline" borderColor="#c8dad5" onClick={() => setShowModal(false)}>Cancel</Button>
                <Button type="submit" loading={saving} bg="#123d3b" color="white" _hover={{ bg: "#255d58" }}>
                  {editingId ? "Save Changes" : "Add Medicine"}
                </Button>
              </Flex>
            </form>
          </Box>
        </Flex>
      )}
    </Box>
  );
}
