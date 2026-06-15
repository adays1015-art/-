import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, verifySession } from "@/lib/auth";
import { listSchedules } from "@/lib/store";
import CalendarDashboard from "./CalendarDashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = verifySession(cookies().get(AUTH_COOKIE)?.value);
  if (!session) redirect("/login");
  if (session.role !== "관리자") redirect("/reports");

  const schedules = await listSchedules().catch(() => []);
  return <CalendarDashboard initialSchedules={schedules} />;
}
