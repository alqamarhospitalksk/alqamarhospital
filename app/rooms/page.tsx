"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Box, Button, Field, Flex, Grid, Heading, HStack, Input, Link, NativeSelect, Table, Text } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faBed, faPen, faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";

type Room = {
  id: number;
  name: string;
  roomType: string;
  dailyRate: string;
  active: boolean;
};

const emptyForm = { name: "", roomType: "", dailyRate: "" };

export default function RoomsPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  async function loadRooms() {
    const response = await fetch("/api/rooms");
    const data = await response.json();
    if (response.ok) setRooms(data.rooms);
    else toast.error(data.error ?? "Unable to load rooms and beds.");
  }

  useEffect(() => {
    async function loadInitial() {
      await loadRooms();
    }
    void loadInitial();
  }, []);

  function openAddModal() {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEditModal(room: Room) {
    setEditing(room.id);
    setForm({ name: room.name, roomType: room.roomType, dailyRate: room.dailyRate });
    setShowModal(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const endpoint = editing ? `/api/rooms/${editing}` : "/api/rooms";
      const response = await fetch(endpoint, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, dailyRate: Number(form.dailyRate) }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Unable to save room or bed.");
        return;
      }
      toast.success(editing ? "Room or bed details updated." : "Room or bed added successfully.");
      setForm(emptyForm);
      setEditing(null);
      setShowModal(false);
      await loadRooms();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(room: Room) {
    const response = await fetch(`/api/rooms/${room.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !room.active }),
    });
    if (!response.ok) toast.error("Unable to update room status.");
    else {
      toast.success(`Room ${room.name} status updated.`);
      await loadRooms();
    }
  }

  const pageCount = Math.max(1, Math.ceil(rooms.length / pageSize));
  const visibleRooms = rooms.slice((page - 1) * pageSize, page * pageSize);
  const firstRecord = rooms.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRecord = Math.min(page * pageSize, rooms.length);

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
              Rooms & Beds
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
          &nbsp; Add Room / Bed
        </Button>
      </Flex>

      {/* Main Content */}
      <Box as="main" px={{ base: "20px", md: "42px" }} py={{ base: "28px", md: "38px" }}>



        {/* Room & Bed Register Table */}
        <Box bg="white" border="1px solid #e1e9e6" borderRadius="14px" boxShadow="0 2px 12px rgba(14,36,32,0.04)" overflow="hidden">
          <Box p="5" borderBottom="1px solid #edf2f0">
            <HStack justify="space-between">
              <HStack gap="3">
                <Flex w="34px" h="34px" bg="#e9f1ef" color="#126b68" borderRadius="9px" align="center" justify="center">
                  <FontAwesomeIcon icon={faBed} />
                </Flex>
                <Box>
                  <Heading size="sm">Room and Bed Register</Heading>
                </Box>
              </HStack>
            </HStack>
          </Box>

          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg="#fafcfb">
                  <Table.ColumnHeader>Name</Table.ColumnHeader>
                  <Table.ColumnHeader>Type</Table.ColumnHeader>
                  <Table.ColumnHeader>Daily Rate</Table.ColumnHeader>
                  <Table.ColumnHeader>Status</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Actions</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {rooms.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={5}>
                      <Text py="8" textAlign="center" color="#77908b">
                        No rooms or beds configured.
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  visibleRooms.map((room) => (
                    <Table.Row key={room.id} _hover={{ bg: "#f9fbfa" }}>
                      <Table.Cell fontWeight="700">{room.name}</Table.Cell>
                      <Table.Cell fontSize="sm">{room.roomType}</Table.Cell>
                      <Table.Cell fontWeight="700" color="#126b68">
                        PKR {room.dailyRate}
                      </Table.Cell>
                      <Table.Cell>
                        <Badge colorPalette={room.active ? "green" : "gray"} borderRadius="full">
                          {room.active ? "Active" : "Inactive"}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell textAlign="right">
                        <HStack justify="flex-end" gap="2">
                          <Button size="xs" variant="outline" borderColor="#c8dad5" color="#126b68" onClick={() => openEditModal(room)}>
                            <FontAwesomeIcon icon={faPen} />
                            &nbsp; Edit
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            borderColor="#d5dfdc"
                            color={room.active ? "#a34258" : "#22633e"}
                            onClick={() => void toggle(room)}
                          >
                            {room.active ? "Deactivate" : "Activate"}
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
              {rooms.length ? `Showing ${firstRecord}-${lastRecord} of ${rooms.length}` : "No records"}
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

      {/* Add / Edit Room Modal */}
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
            maxW="540px"
            boxShadow="0 20px 40px rgba(0,0,0,0.2)"
            overflow="hidden"
          >
            <Flex justify="space-between" align="center" px="28px" py="20px" bg="#123d3b" color="white">
              <HStack gap="3">
                <Flex w="36px" h="36px" bg="#d6e66c" color="#123d3b" borderRadius="10px" align="center" justify="center">
                  <FontAwesomeIcon icon={editing ? faPen : faBed} />
                </Flex>
                <Box>
                  <Heading size="sm">{editing ? "Edit Room / Bed" : "Add New Room or Bed"}</Heading>
                  <Text fontSize="xs" color="#a8c5bd">
                    Bed capacity and daily charges for OT admission.
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
                  <Field.Root required>
                    <Field.Label fontWeight="700">Room / Bed Name</Field.Label>
                    <Input
                      placeholder="e.g. Room 201 / Bed A"
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label fontWeight="700">Room Type</Field.Label>
                    <Input
                      placeholder="e.g. Private Deluxe or General Ward"
                      value={form.roomType}
                      onChange={(event) => setForm({ ...form, roomType: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label fontWeight="700">Daily Rate (PKR)</Field.Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="3500"
                      value={form.dailyRate}
                      onChange={(event) => setForm({ ...form, dailyRate: event.target.value })}
                    />
                  </Field.Root>
                </Grid>
              </Box>

              <Flex justify="flex-end" gap="3" px="28px" py="18px" bg="#f7faf9" borderTop="1px solid #e2e9e6">
                <Button variant="outline" borderColor="#c8dad5" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={saving} bg="#123d3b" color="white" _hover={{ bg: "#255d58" }}>
                  {editing ? "Save Changes" : "Add Room / Bed"}
                </Button>
              </Flex>
            </form>
          </Box>
        </Flex>
      )}
    </Box>
  );
}
