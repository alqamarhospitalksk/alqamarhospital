import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { db } from "../../../lib/db";

const modules = ["LABORATORY", "ECO", "X-RAY", "ECG", "ULTRASOUND"];
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "LAB") return NextResponse.json({ error: "Lab access is required." }, { status: 403 });
  const items = await db.diagnosticCatalogItem.findMany({ orderBy: [{ module: "asc" }, { name: "asc" }] });
  return NextResponse.json({ items: items.map((item) => ({ ...item, price: item.price.toString() })) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "LAB") return NextResponse.json({ error: "Lab access is required." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const serviceModule = text(body?.module).toUpperCase();
  const name = text(body?.name);
  const price = Number(body?.price);
  if (!modules.includes(serviceModule) || !name || !Number.isFinite(price) || price < 0) return NextResponse.json({ error: "Enter a valid module, test name, and price." }, { status: 400 });
  try {
    const item = await db.diagnosticCatalogItem.create({ data: { module: serviceModule, name, price } });
    await db.auditLog.create({ data: { action: "CREATE", entity: "DiagnosticCatalogItem", entityId: String(item.id), userId: user.id, afterJson: JSON.stringify({ module: serviceModule, name, price }) } });
    return NextResponse.json({ item: { ...item, price: item.price.toString() } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "A test with this name already exists in the selected module." }, { status: 409 });
  }
}
