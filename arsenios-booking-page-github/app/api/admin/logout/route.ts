import { expiredAdminSessionCookie } from "../../../../lib/admin-auth";

export async function POST(request: Request) {
  const secure = new URL(request.url).protocol === "https:";
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": expiredAdminSessionCookie(secure) } },
  );
}
