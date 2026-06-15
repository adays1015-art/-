import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, verifySession } from "@/lib/auth";
import { listSchedules, listMembers } from "@/lib/store";
import CalendarDashboard from "./CalendarDashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = verifySession(cookies().get(AUTH_COOKIE)?.value);
  if (!session) redirect("/login");
  // 달력 대시보드는 관리자·팀원 모두에게 공개.

  const [schedules, members] = await Promise.all([
    listSchedules().catch(() => []),
    listMembers().catch(() => []),
  ]);
  return <CalendarDashboard initialSchedules={schedules} members={members} />;
}
