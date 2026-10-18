import { redirect } from "next/navigation";
import { hasAdminSession } from "../../../lib/admin-auth";
import { StudentsDirectory } from "./StudentsDirectory";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  if (!(await hasAdminSession())) redirect("/admin/login");
  return <StudentsDirectory teacherName="Arsenios" />;
}
