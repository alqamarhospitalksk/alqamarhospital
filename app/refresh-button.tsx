"use client";

import { useState } from "react";
import { Button } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotate } from "@fortawesome/free-solid-svg-icons";

// Reloads a page's data on demand: rows other staff added or changed since the page was opened
// (a new admission, a lab result, medicine issued by the store…). Pass the page's own load function(s).
export function RefreshButton({ onRefresh, label = "Refresh" }: { onRefresh: () => Promise<unknown> | void; label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      borderColor="#c8dad5"
      color="#126b68"
      bg="white"
      _hover={{ bg: "#eef6f4" }}
      disabled={busy}
      title="Load the latest records"
      onClick={async () => {
        setBusy(true);
        try {
          await onRefresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      <FontAwesomeIcon icon={faRotate} spin={busy} />
      &nbsp; {label}
    </Button>
  );
}
