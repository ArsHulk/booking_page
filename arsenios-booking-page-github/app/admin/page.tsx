import { redirect } from "next/navigation";
import { hasAdminSession } from "../../lib/admin-auth";
import { AdminDashboard } from "./AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await hasAdminSession())) redirect("/admin/login");
  return <AdminDashboard teacherName="Arsenios" />;
}
