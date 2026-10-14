import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { db } from "../../../lib/db";

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

// Singleton settings row — always id 1.
async function getOrCreateSettings() {
  const existing = await db.hospitalSettings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return db.hospitalSettings.create({ data: { id: 1, name: "Al Qamar Hospital" } });
}

export async function GET() {
  // Branding (name/logo) is shown on the pre-auth login screen too, so this is public.
  const settings = await getOrCreateSettings();
  return NextResponse.json({ settings });
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "MANAGEMENT") return NextResponse.json({ error: "Management access is required." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const name = text(body?.name);
  const nameUrdu = text(body?.nameUrdu) || null;
  const address = text(body?.address) || null;
  const addressUrdu = text(body?.addressUrdu) || null;
  const phone = text(body?.phone) || null;
  const email = text(body?.email) || null;
  const logoDataUrl = typeof body?.logoDataUrl === "string" ? (body.logoDataUrl.trim() || null) : undefined;

  if (!name) {
    return NextResponse.json({ error: "Hospital name is required." }, { status: 400 });
  }
  if (logoDataUrl && !/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/.test(logoDataUrl)) {
    return NextResponse.json({ error: "Logo must be an uploaded image file." }, { status: 400 });
  }

  await getOrCreateSettings();

  const settings = await db.hospitalSettings.update({
    where: { id: 1 },
    data: {
      name,
      nameUrdu,
      address,
      addressUrdu,
      phone,
      email,
      ...(logoDataUrl !== undefined ? { logoDataUrl } : {}),
    },
  });

  await db.auditLog.create({
    data: {
      action: "UPDATE",
      entity: "HospitalSettings",
      entityId: "1",
      userId: user.id,
      afterJson: JSON.stringify({ name, nameUrdu, address, addressUrdu, phone, email }),
    },
  });

  return NextResponse.json({ settings });
}
