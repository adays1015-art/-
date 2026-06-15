import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, verifySession } from "@/lib/auth";
import { listReports, listMembers } from "@/lib/store";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = verifySession(cookies().get(AUTH_COOKIE)?.value);
  if (!session) redirect("/login");
  if (session.role !== "관리자") redirect("/reports");

  const [reports, members] = await Promise.all([
    listReports(),
    listMembers().catch(() => []),
  ]);
  return <DashboardClient initialReports={reports} members={members} />;
}
