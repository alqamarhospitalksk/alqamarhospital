"use client";

import { Button, Flex, HStack, NativeSelect, Text } from "@chakra-ui/react";

// Same footer markup the other list pages use inline (Sell, Suppliers, Catalog, …).
export function TablePagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
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
        {total ? `Showing ${first}-${last} of ${total}` : "No records"}
      </Text>
      <HStack gap="2" flexWrap="wrap">
        <Text fontSize="sm" color="#607d76">Rows per page</Text>
        <NativeSelect.Root width="90px" size="sm">
          <NativeSelect.Field
            value={String(pageSize)}
            onChange={(event) => {
              onPageSizeChange(Number(event.target.value));
              onPageChange(1);
            }}
          >
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </NativeSelect.Field>
        </NativeSelect.Root>
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>
          Previous
        </Button>
        {Array.from({ length: pageCount }, (_, index) => index + 1).map((p) => (
          <Button
            key={p}
            size="sm"
            variant={p === page ? "solid" : "outline"}
            bg={p === page ? "#123d3b" : undefined}
            color={p === page ? "white" : undefined}
            onClick={() => onPageChange(p)}
          >
            {p}
          </Button>
        ))}
        <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => onPageChange(Math.min(pageCount, page + 1))}>
          Next
        </Button>
      </HStack>
    </Flex>
  );
}
