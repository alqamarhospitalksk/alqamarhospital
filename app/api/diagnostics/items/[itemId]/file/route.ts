import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../../lib/auth";
import { roleError } from "../../../../../../lib/roles";
import { db } from "../../../../../../lib/db";

// Serves one uploaded PDF result on demand, kept out of the main results list
// payload so loading the Results/Upload Tests tables doesn't drag every PDF
// attached to every receipt along with it.
export async function GET(_request: Request, context: { params: Promise<{ itemId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["OPERATOR", "MANAGEMENT", "LAB"]);
  if (denied) return denied;

  const { itemId } = await context.params;
  const id = Number(itemId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid test ID." }, { status: 400 });

  const item = await db.diagnosticReceiptItem.findUnique({
    where: { id },
    select: { resultFileName: true, resultFileDataUrl: true },
  });
  if (!item || !item.resultFileDataUrl) {
    return NextResponse.json({ error: "No result file uploaded for this test." }, { status: 404 });
  }

  return NextResponse.json({ fileName: item.resultFileName, fileDataUrl: item.resultFileDataUrl });
}
