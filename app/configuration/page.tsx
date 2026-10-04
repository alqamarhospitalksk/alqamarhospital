"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Box, Button, Field, Flex, Grid, Heading, HStack, Input, Link, NativeSelect, Table, Text } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faFlask, faPlus, faPen, faXmark } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";

const moduleOptions = ["LABORATORY", "ECO", "X-RAY", "ECG", "ULTRASOUND"];

type CatalogItem = {
  id: number;
  module: string;
  name: string;
  price: string;
  active: boolean;
};

export default function ConfigurationPage() {
  const router = useRouter();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [module, setModule] = useState("LABORATORY");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  async function loadItems() {
    const response = await fetch("/api/catalog");
    const data = await response.json();
    if (response.ok) setItems(data.items);
    else toast.error(data.error ?? "Unable to load catalog.");
  }

  useEffect(() => {
    async function loadInitial() {
      await loadItems();
    }
    void loadInitial();
  }, []);

  function openAddModal() {
    setEditing(null);
    setName("");
    setPrice("");
    setShowModal(true);
  }

  function openEditModal(item: CatalogItem) {
    setEditing(item.id);
    setModule(item.module);
    setName(item.name);
    setPrice(item.price);
    setShowModal(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const endpoint = editing ? `/api/catalog/${editing}` : "/api/catalog";
      const response = await fetch(endpoint, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { name, price } : { module, name, price }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Unable to save test.");
        return;
      }
      toast.success(editing ? "Test pricing updated successfully." : "Test added to the catalog successfully.");
      setName("");
      setPrice("");
      setEditing(null);
      setShowModal(false);
      await loadItems();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(item: CatalogItem) {
    await fetch(`/api/catalog/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !item.active }),
    });
    await loadItems();
  }

  const moduleItems = items.filter((item) => item.module === module);
  // Search matches any part of the test name, in any case; it only narrows the list on screen.
  const searchQuery = search.trim().toLowerCase();
  const visible = searchQuery ? moduleItems.filter((item) => item.name.toLowerCase().includes(searchQuery)) : moduleItems;
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const pagedVisible = visible.slice((page - 1) * pageSize, page * pageSize);
  const firstRecord = visible.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRecord = Math.min(page * pageSize, visible.length);

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
              Test & Price Catalog
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
          &nbsp; Add New Test
        </Button>
      </Flex>

      {/* Main Content */}
      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>

        <Flex gap="3" mb="5" align="center" justify="space-between" direction={{ base: "column", md: "row" }}>
        <HStack gap="2" overflowX="auto" w={{ base: "full", md: "auto" }}>
          {moduleOptions.map((option) => (
            <Button
              key={option}
              size="sm"
              variant={module === option ? "solid" : "outline"}
              bg={module === option ? "linear-gradient(135deg, #1a8070 0%, #0f5a52 100%)" : "white"}
              color={module === option ? "white" : "#506c65"}
              borderColor={module === option ? "transparent" : "#c8dad5"}
              borderRadius="8px"
              fontWeight="700"
              boxShadow={module === option ? "0 2px 8px rgba(26,128,112,0.25)" : "none"}
              onClick={() => {
                setModule(option);
                setEditing(null);
                setSearch("");
                setPage(1);
              }}
            >
              {option.replace("LABORATORY", "LAB")}
            </Button>
          ))}
        </HStack>

        <Flex gap="2" align="center" w={{ base: "full", md: "320px" }} flexShrink="0">
          <Input
            placeholder={`Search ${module === "LABORATORY" ? "lab" : module.toLowerCase()} tests by name…`}
            value={search}
            autoComplete="off"
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setSearch("");
                setPage(1);
              }
            }}
            bg="white"
            fontSize="sm"
          />
          {search && (
            <Button
              size="sm"
              variant="outline"
              borderColor="#c8dad5"
              color="#126b68"
              flexShrink="0"
              onClick={() => {
                setSearch("");
                setPage(1);
              }}
            >
              Clear
            </Button>
          )}
        </Flex>
        </Flex>



        {/* Catalog Table */}
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="12px" overflow="hidden">
          <Box px="24px" py="20px" borderBottom="1px solid #edf2f0">
            <HStack justify="space-between">
              <HStack gap="3">
                <Flex w="34px" h="34px" bg="#e9f1ef" color="#126b68" borderRadius="9px" align="center" justify="center">
                  <FontAwesomeIcon icon={faFlask} />
                </Flex>
                <Box>
                  <Heading size="sm">{module.replace("LABORATORY", "Laboratory")} Tests</Heading>
                </Box>
              </HStack>
            </HStack>
          </Box>

          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg="#fafcfb">
                  <Table.ColumnHeader>Test Name</Table.ColumnHeader>
                  <Table.ColumnHeader>Price</Table.ColumnHeader>
                  <Table.ColumnHeader>Status</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Actions</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {visible.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={4}>
                      <Text py="8" textAlign="center" color="#77908b">
                        {moduleItems.length > 0 ? `No tests found for "${search.trim()}".` : "No tests configured for this module."}
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  pagedVisible.map((item) => (
                    <Table.Row key={item.id} _hover={{ bg: "#f9fbfa" }}>
                      <Table.Cell fontWeight="700">{item.name}</Table.Cell>
                      <Table.Cell fontWeight="700" color="#126b68">
                        PKR {item.price}
                      </Table.Cell>
                      <Table.Cell>
                        <Badge colorPalette={item.active ? "green" : "gray"} borderRadius="full">
                          {item.active ? "Active" : "Inactive"}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell textAlign="right">
                        <HStack justify="flex-end" gap="2">
                          <Button size="xs" variant="outline" borderColor="#c8dad5" color="#126b68" onClick={() => openEditModal(item)}>
                            <FontAwesomeIcon icon={faPen} />
                            &nbsp; Edit
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            borderColor="#d5dfdc"
                            color={item.active ? "#a34258" : "#22633e"}
                            onClick={() => void toggle(item)}
                          >
                            {item.active ? "Deactivate" : "Activate"}
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
              {visible.length ? `Showing ${firstRecord}-${lastRecord} of ${visible.length}` : "No records"}
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

      {/* Test Add / Edit Modal */}
      {showModal && (
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
            maxW="560px"
            boxShadow="0 20px 40px rgba(0,0,0,0.2)"
            overflow="hidden"
          >
            <Flex justify="space-between" align="center" px="28px" py="20px" bg="#123d3b" color="white">
              <HStack gap="3">
                <Flex w="36px" h="36px" bg="#d6e66c" color="#123d3b" borderRadius="10px" align="center" justify="center">
                  <FontAwesomeIcon icon={editing ? faPen : faFlask} />
                </Flex>
                <Box>
                  <Heading size="sm">{editing ? "Edit Test Entry" : `Add New Test to ${module}`}</Heading>
                  <Text fontSize="xs" color="#a8c5bd">
                    Configured pricing will take effect immediately across diagnostic counters.
                  </Text>
                </Box>
              </HStack>
              <Button
                variant="ghost"
                color="white"
                _hover={{ bg: "#255d58" }}
                p="2"
                minW="auto"
                onClick={() => setShowModal(false)}
              >
                <FontAwesomeIcon icon={faXmark} size="lg" />
              </Button>
            </Flex>

            <form onSubmit={submit}>
              <Box p="28px" maxH="75vh" overflowY="auto">


                <Grid templateColumns="1fr" gap="5">
                  {!editing && (
                    <Field.Root required>
                      <Field.Label fontWeight="700">Diagnostic Module</Field.Label>
                      <NativeSelect.Root>
                        <NativeSelect.Field value={module} onChange={(event) => setModule(event.target.value)}>
                          {moduleOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </NativeSelect.Field>
                      </NativeSelect.Root>
                    </Field.Root>
                  )}

                  <Field.Root required>
                    <Field.Label fontWeight="700">Test Name</Field.Label>
                    <Input
                      placeholder="e.g. Complete Blood Count (CBC)"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label fontWeight="700">Price (PKR)</Field.Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="800"
                      value={price}
                      onChange={(event) => setPrice(event.target.value)}
                    />
                  </Field.Root>
                </Grid>
              </Box>

              <Flex justify="flex-end" gap="3" px="28px" py="18px" bg="#f7faf9" borderTop="1px solid #e2e9e6">
                <Button variant="outline" borderColor="#c8dad5" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={saving} bg="#123d3b" color="white" _hover={{ bg: "#255d58" }}>
                  {editing ? "Save Pricing" : "Add Test"}
                </Button>
              </Flex>
            </form>
          </Box>
        </Flex>
      )}
    </Box>
  );
}
