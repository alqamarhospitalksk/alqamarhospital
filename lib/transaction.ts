import type { Prisma } from "@prisma/client";
import { db } from "./db";

// Two people saving at the same instant can both ask for the same "next number" (next OPD token,
// next receipt number...). The database refuses the second one with a duplicate-key error. That is
// not the user's mistake, so run the whole transaction again a few times — by then the other
// save has finished and the next number is free. Everything inside a transaction is rolled back
// on failure (InnoDB), so retrying never double-saves.
function isConflict(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  const message = error instanceof Error ? error.message : "";
  return code === "P2002" || code === "P2034" || /unique constraint|duplicate entry|deadlock|write conflict/i.test(message);
}

export async function runTransaction<T>(fn: (transaction: Prisma.TransactionClient) => Promise<T>, attempts = 8): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.$transaction(fn);
    } catch (error) {
      if (!isConflict(error) || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 15 + Math.random() * 45 * attempt));
    }
  }
}
