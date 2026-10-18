import { redirect } from "next/navigation";
import { hasAdminSession } from "../../../lib/admin-auth";
import { CompletedLessons } from "./CompletedLessons";

export const dynamic = "force-dynamic";

export default async function CompletedLessonsPage() {
  if (!(await hasAdminSession())) redirect("/admin/login");
  return <CompletedLessons teacherName="Arsenios" />;
}
