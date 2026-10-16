import { redirect } from "next/navigation";
import { hasAdminSession } from "../../../lib/admin-auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await hasAdminSession()) redirect("/admin");
  return <LoginForm />;
}
