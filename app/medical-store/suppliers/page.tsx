"use client";

import { FormEvent, useEffect, useState } from "react";
import { Badge, Box, Button, Field, Flex, Grid, Heading, HStack, Input, NativeSelect, Table, Text } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBan, faCheck, faPen, faPlus, faTruckMedical, faXmark } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";

type Supplier = { id: number; name: string; contactPerson: string | null; phone: string | null; address: string | null; active: boolean };
const emptyForm = { name: "", contactPerson: "", phone: "", address: "" };

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/medical-store/suppliers?includeInactive=1");
      const data = await res.json();
      if (res.ok) setSuppliers(data.suppliers ?? []);
      else toast.error(data.error ?? "Unable to load suppliers.");
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
    setShowModal(true);
  }

  function openEditModal(supplier: Supplier) {
    setEditingId(supplier.id);
    setForm({
      name: supplier.name,
      contactPerson: supplier.contactPerson ?? "",
      phone: supplier.phone ?? "",
      address: supplier.address ?? "",
    });
    setShowModal(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const url = editingId ? `/api/medical-store/suppliers/${editingId}` : "/api/medical-store/suppliers";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Unable to save supplier.");
        return;
      }
      toast.success(editingId ? "Supplier updated." : `${data.supplier.name} added.`);
      setForm(emptyForm);
      setEditingId(null);
      setShowModal(false);
      await load();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(supplier: Supplier) {
    const nextActive = !supplier.active;
    if (nextActive === false && !window.confirm(`Deactivate ${supplier.name}? They'll no longer be selectable for new purchases, but existing purchase history is kept.`)) return;
    setTogglingId(supplier.id);
    try {
      const res = await fetch(`/api/medical-store/suppliers/${supplier.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Unable to update supplier.");
        return;
      }
      toast.success(nextActive ? `${supplier.name} reactivated.` : `${supplier.name} deactivated.`);
      await load();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setTogglingId(null);
    }
  }

  const pageCount = Math.max(1, Math.ceil(suppliers.length / pageSize));
  const visibleSuppliers = suppliers.slice((page - 1) * pageSize, page * pageSize);
  const firstRecord = suppliers.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRecord = Math.min(page * pageSize, suppliers.length);

  return (
    <Box minH="100vh" bg="#f5f7f8" color="#17252b">
      <Flex as="header" h="78px" bg="white" borderBottom="1px solid #e2e9e6" align="center" justify="space-between" px={{ base: "20px", md: "42px" }}>
        <Box>
          <Heading size="lg" letterSpacing="-0.04em">
            Suppliers
          </Heading>
        </Box>
        <Button bg="#123d3b" color="white" borderRadius="8px" _hover={{ bg: "#255d58" }} onClick={openAddModal}>
          <FontAwesomeIcon icon={faPlus} />
          &nbsp; Add Supplier
        </Button>
      </Flex>

      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
          <Box px="24px" py="20px" borderBottom="1px solid #edf2f0">
            <HStack gap="3">
              <Flex w="34px" h="34px" bg="#e9f1ef" color="#126b68" borderRadius="9px" align="center" justify="center">
                <FontAwesomeIcon icon={faTruckMedical} />
              </Flex>
              <Heading size="sm">Suppliers registered</Heading>
            </HStack>
          </Box>
          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg="#fafcfb">
                  <Table.ColumnHeader>Name</Table.ColumnHeader>
                  <Table.ColumnHeader>Contact Person</Table.ColumnHeader>
                  <Table.ColumnHeader>Phone</Table.ColumnHeader>
                  <Table.ColumnHeader>Address</Table.ColumnHeader>
                  <Table.ColumnHeader>Status</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Action</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {loading ? (
                  <Table.Row><Table.Cell colSpan={6}><Text py="8" textAlign="center" color="#77908b">Loading suppliers...</Text></Table.Cell></Table.Row>
                ) : suppliers.length === 0 ? (
                  <Table.Row><Table.Cell colSpan={6}><Text py="8" textAlign="center" color="#77908b">No suppliers registered yet.</Text></Table.Cell></Table.Row>
                ) : (
                  visibleSuppliers.map((s) => (
                    <Table.Row key={s.id} _hover={{ bg: "#f9fbfa" }} opacity={s.active ? 1 : 0.6}>
                      <Table.Cell fontWeight="700">{s.name}</Table.Cell>
                      <Table.Cell fontSize="sm">{s.contactPerson ?? "—"}</Table.Cell>
                      <Table.Cell fontSize="sm">{s.phone ?? "—"}</Table.Cell>
                      <Table.Cell fontSize="sm" color="#556e68">{s.address ?? "—"}</Table.Cell>
                      <Table.Cell>
                        <Badge colorPalette={s.active ? "green" : "gray"} borderRadius="full">
                          {s.active ? "Active" : "Inactive"}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell textAlign="right">
                        <HStack gap="2" justify="flex-end">
                          <Button size="xs" variant="outline" borderColor="#c8dad5" color="#126b68" onClick={() => openEditModal(s)}>
                            <FontAwesomeIcon icon={faPen} />
                            &nbsp; Edit
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            borderColor={s.active ? "#e3b8b8" : "#c8dad5"}
                            color={s.active ? "#a34242" : "#22633e"}
                            loading={togglingId === s.id}
                            onClick={() => void toggleActive(s)}
                          >
                            <FontAwesomeIcon icon={s.active ? faBan : faCheck} />
                            &nbsp; {s.active ? "Deactivate" : "Reactivate"}
                          </Button>
                        </HStack>
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
              {suppliers.length ? `Showing ${firstRecord}-${lastRecord} of ${suppliers.length}` : "No records"}
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
          <Box bg="white" borderRadius="16px" w="full" maxW="520px" boxShadow="0 20px 40px rgba(0,0,0,0.2)" overflow="hidden">
            <Flex justify="space-between" align="center" px="28px" py="20px" bg="#123d3b" color="white">
              <Heading size="sm">{editingId ? "Edit Supplier" : "Add Supplier"}</Heading>
              <Button variant="ghost" color="white" _hover={{ bg: "#255d58" }} p="2" minW="auto" onClick={() => setShowModal(false)}>
                <FontAwesomeIcon icon={faXmark} size="lg" />
              </Button>
            </Flex>
            <form onSubmit={submit}>
              <Box p="28px">
                <Grid templateColumns="1fr" gap="4">
                  <Field.Root required>
                    <Field.Label fontWeight="700">Supplier Name</Field.Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </Field.Root>
                  <Field.Root>
                    <Field.Label fontWeight="700">Contact Person</Field.Label>
                    <Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
                  </Field.Root>
                  <Field.Root>
                    <Field.Label fontWeight="700">Phone</Field.Label>
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </Field.Root>
                  <Field.Root>
                    <Field.Label fontWeight="700">Address</Field.Label>
                    <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                  </Field.Root>
                </Grid>
              </Box>
              <Flex justify="flex-end" gap="3" px="28px" py="18px" bg="#f7faf9" borderTop="1px solid #e2e9e6">
                <Button variant="outline" borderColor="#c8dad5" onClick={() => setShowModal(false)}>Cancel</Button>
                <Button type="submit" loading={saving} bg="#123d3b" color="white" _hover={{ bg: "#255d58" }}>{editingId ? "Save Changes" : "Save Supplier"}</Button>
              </Flex>
            </form>
          </Box>
        </Flex>
      )}
    </Box>
  );
}
