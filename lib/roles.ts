import { NextResponse } from "next/server";

export type AppRole = "MANAGEMENT" | "OPERATOR" | "LAB" | "MEDICAL_STORE";

// Returns a 403 response when the signed-in user's role isn't allowed, or null when they are.
// Use right after the "Authentication required" check:
//   const denied = roleError(user, ["OPERATOR", "MANAGEMENT"]); if (denied) return denied;
// The sidebar only hides links; this is what actually stops another role calling the API directly.
export function roleError(user: { role: string }, allowed: readonly AppRole[]) {
  return (allowed as readonly string[]).includes(user.role)
    ? null
    : NextResponse.json({ error: "You do not have access to this." }, { status: 403 });
}
