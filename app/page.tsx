import Dashboard from "./dashboard";
import { getCurrentUser } from "../lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (user.role === "OPERATOR") {
    redirect("/patients");
  }

  if (user.role === "LAB") {
    redirect("/lab");
  }

  if (user.role === "MEDICAL_STORE") {
    redirect("/medical-store");
  }

  return <Dashboard />;
}
