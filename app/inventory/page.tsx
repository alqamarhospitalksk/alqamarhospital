"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Box, Button, Field, Flex, Grid, Heading, HStack, Input, Link, NativeSelect, Table, Text } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faBoxOpen, faPlus, faRotate, faXmark } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";

type InventoryItem = {
  id: number;
  name: string;
  category: string;
  unit: string;
  quantity: string;
  lowStockAt: string;
  unitPrice: string;
};

const categories = ["MEDICINE", "TOOL", "CONSUMABLE"];
const emptyForm = { name: "", category: "MEDICINE", unit: "piece", quantity: "", lowStockAt: "", unitPrice: "", method: "CASH" };

export default function InventoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [form, setForm] = useState(emptyForm);
  const [showAddModal, setShowAddModal] = useState(false);
  const [restockItem, setRestockItem] = useState<InventoryItem | null>(null);
  const [restock, setRestock] = useState("");
  const [reason, setReason] = useState("");
  const [costPaid, setCostPaid] = useState("");
  const [costPaidTouched, setCostPaidTouched] = useState(false);
  const [restockMethod, setRestockMethod] = useState("CASH");
  const [saving, setSaving] = useState(false);

  async function loadItems() {
    const response = await fetch("/api/inventory");
    const data = await response.json();
    if (response.ok) setItems(data.items);
    else toast.error(data.error ?? "Unable to load inventory.");
  }

  useEffect(() => {
    async function loadInitial() {
      const userRes = await fetch("/api/auth/me");
      if (userRes.ok) {
        const userData = await userRes.json();
        if (userData.user?.role !== "MANAGEMENT") {
          router.replace("/");
          return;
        }
      }
      await loadItems();
    }
    void loadInitial();
  }, [router]);

  function openAddModal() {
    setForm(emptyForm);
    setShowAddModal(true);
  }

  function openRestockModal(item: InventoryItem) {
    setRestockItem(item);
    setRestock("");
    setReason("");
    setCostPaid("");
    setCostPaidTouched(false);
    setRestockMethod("CASH");
  }

  // Defaults the cost to qty × unit price, but only until the user manually edits it —
  // after that, their typed value is left alone even if the quantity changes again.
  function updateRestockQuantity(value: string) {
    setRestock(value);
    if (!costPaidTouched && restockItem) {
      const qty = Number(value || 0);
      const estimated = qty * Number(restockItem.unitPrice);
      setCostPaid(estimated > 0 ? String(estimated) : "");
    }
  }

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          quantity: Number(form.quantity || 0),
          lowStockAt: Number(form.lowStockAt || 0),
          unitPrice: Number(form.unitPrice || 0),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Unable to add inventory item.");
        return;
      }
      toast.success(`${data.item.name} added to inventory.`);
      setForm(emptyForm);
      setShowAddModal(false);
      await loadItems();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setSaving(false);
    }
  }

  async function submitRestock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!restockItem) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/inventory/${restockItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restock: Number(restock), reason, costPaid, method: restockMethod }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Unable to restock item.");
        return;
      }
      toast.success(`${restockItem.name} restocked. New quantity: ${data.item.quantity} ${data.item.unit}.`);
      setRestockItem(null);
      setRestock("");
      setReason("");
      setCostPaid("");
      setCostPaidTouched(false);
      await loadItems();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setSaving(false);
    }
  }

  const lowStockCount = items.filter((item) => Number(item.quantity) <= Number(item.lowStockAt)).length;
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const visibleItems = items.slice((page - 1) * pageSize, page * pageSize);
  const firstRecord = items.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRecord = Math.min(page * pageSize, items.length);

  return (
    <Box minH="100vh" bg="#eef2f0" color="#0e2420">
      {/* Header */}
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
        justify="space-between"
        px={{ base: "20px", md: "42px" }}
      >
        <HStack gap="4">
          <Link href="/" color="#2da08b" _hover={{ color: "#1a8070" }} transition="color 0.15s ease">
            <FontAwesomeIcon icon={faArrowLeft} />
          </Link>
          <Box>
            <Heading size="lg" letterSpacing="-0.04em" color="#0e2420">
              Inventory Catalog
            </Heading>
          </Box>
        </HStack>
        <Button
          bg="linear-gradient(135deg, #1a8070 0%, #0f5a52 100%)"
          color="white"
          borderRadius="9px"
          fontWeight="700"
          boxShadow="0 3px 12px rgba(26,128,112,0.28)"
          _hover={{ boxShadow: "0 5px 20px rgba(26,128,112,0.42)", transform: "translateY(-1px)" }}
          _active={{ transform: "translateY(0)" }}
          transition="all 0.18s ease"
          onClick={openAddModal}
        >
          <FontAwesomeIcon icon={faPlus} />
          &nbsp; Add Inventory Item
        </Button>
      </Flex>

      {/* Main Content */}
      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>
        <Flex justify="space-between" align="center" mb="6">
          <Box>
            <Text fontWeight="700" mt="1">
              {items.length} items · {lowStockCount} low-stock
            </Text>
          </Box>
          <Badge colorPalette={lowStockCount ? "red" : "green"} borderRadius="full" px="3">
            {lowStockCount ? `${lowStockCount} items low-stock` : "Stock healthy"}
          </Badge>
        </Flex>



        {/* Stock Register Table */}
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
          <Box p="5" borderBottom="1px solid #edf2f0">
            <HStack justify="space-between">
              <HStack gap="3">
                <Flex w="34px" h="34px" bg="#e9f1ef" color="#126b68" borderRadius="9px" align="center" justify="center">
                  <FontAwesomeIcon icon={faBoxOpen} />
                </Flex>
                <Box>
                  <Heading size="sm">Stock Register</Heading>
                </Box>
              </HStack>
            </HStack>
          </Box>

          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg="#fafcfb">
                  <Table.ColumnHeader>Item Name</Table.ColumnHeader>
                  <Table.ColumnHeader>Category</Table.ColumnHeader>
                  <Table.ColumnHeader>On Hand</Table.ColumnHeader>
                  <Table.ColumnHeader>Low-Stock Threshold</Table.ColumnHeader>
                  <Table.ColumnHeader>Unit Price</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Action</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {items.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={6}>
                      <Text py="8" textAlign="center" color="#77908b">
                        No inventory items configured.
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  visibleItems.map((item) => {
                    const low = Number(item.quantity) <= Number(item.lowStockAt);
                    return (
                      <Table.Row key={item.id} _hover={{ bg: "#f9fbfa" }}>
                        <Table.Cell fontWeight="700">{item.name}</Table.Cell>
                        <Table.Cell fontSize="sm">{item.category}</Table.Cell>
                        <Table.Cell>
                          <Text fontWeight="800" color={low ? "#a34258" : "#126b68"}>
                            {item.quantity} {item.unit}
                          </Text>
                        </Table.Cell>
                        <Table.Cell fontSize="sm">
                          {item.lowStockAt} {item.unit}
                        </Table.Cell>
                        <Table.Cell fontWeight="700">PKR {item.unitPrice}</Table.Cell>
                        <Table.Cell textAlign="right">
                          <Button size="xs" variant="outline" borderColor="#c8dad5" color="#126b68" onClick={() => openRestockModal(item)}>
                            <FontAwesomeIcon icon={faRotate} />
                            &nbsp; Restock
                          </Button>
                        </Table.Cell>
                      </Table.Row>
                    );
                  })
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

      {/* Add Inventory Item Modal */}
      {showAddModal && (
        <Flex
          position="fixed"
          inset="0"
          bg="rgba(15, 30, 28, 0.55)"
          backdropFilter="blur(3px)"
          zIndex="100"
          align="center"
          justify="center"
          p="4"
        >
          <Box
            bg="white"
            borderRadius="16px"
            w="full"
            maxW="620px"
            boxShadow="0 20px 40px rgba(0,0,0,0.2)"
            overflow="hidden"
          >
            <Flex justify="space-between" align="center" px="28px" py="20px" bg="#123d3b" color="white">
              <HStack gap="3">
                <Flex w="36px" h="36px" bg="#d6e66c" color="#123d3b" borderRadius="10px" align="center" justify="center">
                  <FontAwesomeIcon icon={faBoxOpen} />
                </Flex>
                <Box>
                  <Heading size="sm">Add New Inventory Item</Heading>
                  <Text fontSize="xs" color="#a8c5bd">
                    Medicine, surgical tool, or consumable.
                  </Text>
                </Box>
              </HStack>
              <Button
                variant="ghost"
                color="white"
                _hover={{ bg: "#255d58" }}
                p="2"
                minW="auto"
                onClick={() => setShowAddModal(false)}
              >
                <FontAwesomeIcon icon={faXmark} size="lg" />
              </Button>
            </Flex>

            <form onSubmit={addItem}>
              <Box p="28px" maxH="75vh" overflowY="auto">


                <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap="5">
                  <Field.Root required gridColumn={{ md: "span 2" }}>
                    <Field.Label fontWeight="700">Item Name</Field.Label>
                    <Input
                      placeholder="e.g. Ceftriaxone 1g Injection"
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label fontWeight="700">Category</Field.Label>
                    <NativeSelect.Root>
                      <NativeSelect.Field
                        value={form.category}
                        onChange={(event) => setForm({ ...form, category: event.target.value })}
                      >
                        {categories.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </NativeSelect.Field>
                    </NativeSelect.Root>
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label fontWeight="700">Unit</Field.Label>
                    <Input
                      placeholder="e.g. vial, piece, box"
                      value={form.unit}
                      onChange={(event) => setForm({ ...form, unit: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root>
                    <Field.Label fontWeight="700">Opening Quantity</Field.Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="100"
                      value={form.quantity}
                      onChange={(event) => setForm({ ...form, quantity: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root>
                    <Field.Label fontWeight="700">Low-Stock Alert Level</Field.Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="15"
                      value={form.lowStockAt}
                      onChange={(event) => setForm({ ...form, lowStockAt: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root>
                    <Field.Label fontWeight="700">Unit Price (PKR)</Field.Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="450"
                      value={form.unitPrice}
                      onChange={(event) => setForm({ ...form, unitPrice: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root>
                    <Field.Label fontWeight="700">Payment Method</Field.Label>
                    <NativeSelect.Root>
                      <NativeSelect.Field value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })}>
                        <option value="CASH">Cash</option>
                        <option value="CARD">Card</option>
                        <option value="BANK_TRANSFER">Bank transfer</option>
                        <option value="ONLINE">Online</option>
                      </NativeSelect.Field>
                    </NativeSelect.Root>
                  </Field.Root>

                  {Number(form.quantity || 0) > 0 && Number(form.unitPrice || 0) > 0 && (
                    <Text fontSize="xs" color="#77908b" gridColumn={{ md: "span 2" }}>
                      This opening stock (PKR {(Number(form.quantity) * Number(form.unitPrice)).toLocaleString("en-PK")}) will be recorded as an Inventory expense.
                    </Text>
                  )}
                </Grid>
              </Box>

              <Flex justify="flex-end" gap="3" px="28px" py="18px" bg="#f7faf9" borderTop="1px solid #e2e9e6">
                <Button variant="outline" borderColor="#c8dad5" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={saving} bg="#123d3b" color="white" _hover={{ bg: "#255d58" }}>
                  Save Item
                </Button>
              </Flex>
            </form>
          </Box>
        </Flex>
      )}

      {/* Restock Item Modal */}
      {restockItem && (
        <Flex
          position="fixed"
          inset="0"
          bg="rgba(15, 30, 28, 0.55)"
          backdropFilter="blur(3px)"
          zIndex="100"
          align="center"
          justify="center"
          p="4"
        >
          <Box
            bg="white"
            borderRadius="16px"
            w="full"
            maxW="520px"
            boxShadow="0 20px 40px rgba(0,0,0,0.2)"
            overflow="hidden"
          >
            <Flex justify="space-between" align="center" px="28px" py="20px" bg="#123d3b" color="white">
              <HStack gap="3">
                <Flex w="36px" h="36px" bg="#d6e66c" color="#123d3b" borderRadius="10px" align="center" justify="center">
                  <FontAwesomeIcon icon={faRotate} />
                </Flex>
                <Box>
                  <Heading size="sm">Restock {restockItem.name}</Heading>
                  <Text fontSize="xs" color="#a8c5bd">
                    Current stock: {restockItem.quantity} {restockItem.unit}
                  </Text>
                </Box>
              </HStack>
              <Button
                variant="ghost"
                color="white"
                _hover={{ bg: "#255d58" }}
                p="2"
                minW="auto"
                onClick={() => setRestockItem(null)}
              >
                <FontAwesomeIcon icon={faXmark} size="lg" />
              </Button>
            </Flex>

            <form onSubmit={submitRestock}>
              <Box p="28px">
                <Grid templateColumns="1fr" gap="5">
                  <Field.Root required>
                    <Field.Label fontWeight="700">Quantity to Add ({restockItem.unit})</Field.Label>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="e.g. 50"
                      value={restock}
                      onChange={(event) => updateRestockQuantity(event.target.value)}
                    />
                  </Field.Root>

                  <Field.Root>
                    <Field.Label fontWeight="700">Cost Paid (PKR, total)</Field.Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0"
                      value={costPaid}
                      onChange={(event) => {
                        setCostPaid(event.target.value);
                        setCostPaidTouched(true);
                      }}
                    />
                    <Text fontSize="xs" color="#77908b" mt="1">
                      Defaults to quantity × unit price (PKR {restockItem.unitPrice}); recorded as an Inventory expense.
                    </Text>
                  </Field.Root>

                  <Field.Root>
                    <Field.Label fontWeight="700">Payment Method</Field.Label>
                    <NativeSelect.Root>
                      <NativeSelect.Field value={restockMethod} onChange={(event) => setRestockMethod(event.target.value)}>
                        <option value="CASH">Cash</option>
                        <option value="CARD">Card</option>
                        <option value="BANK_TRANSFER">Bank transfer</option>
                        <option value="ONLINE">Online</option>
                      </NativeSelect.Field>
                    </NativeSelect.Root>
                  </Field.Root>

                  <Field.Root>
                    <Field.Label fontWeight="700">Reason / Reference Note</Field.Label>
                    <Input
                      placeholder="e.g. Vendor delivery invoice #1042"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </Field.Root>
                </Grid>
              </Box>

              <Flex justify="flex-end" gap="3" px="28px" py="18px" bg="#f7faf9" borderTop="1px solid #e2e9e6">
                <Button variant="outline" borderColor="#c8dad5" onClick={() => setRestockItem(null)}>
                  Cancel
                </Button>
                <Button type="submit" loading={saving} bg="#123d3b" color="white" _hover={{ bg: "#255d58" }}>
                  Confirm Restock
                </Button>
              </Flex>
            </form>
          </Box>
        </Flex>
      )}
    </Box>
  );
}
