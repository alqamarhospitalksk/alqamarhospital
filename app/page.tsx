import Dashboard from "./dashboard";
import OperatorDashboard from "./operator-dashboard";
import { getCurrentUser } from "../lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // The front desk lands on its own day-at-a-glance dashboard (limited figures, no shares or expenses).
  if (user.role === "OPERATOR") {
    return <OperatorDashboard />;
  }

  if (user.role === "LAB") {
    redirect("/lab");
  }

  if (user.role === "MEDICAL_STORE") {
    redirect("/medical-store");
  }

  return <Dashboard />;
}
