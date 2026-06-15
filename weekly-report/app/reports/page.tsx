import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, verifySession } from "@/lib/auth";
import { listReports } from "@/lib/store";
import ReportsClient from "../ReportsClient";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: { searchParams?: { id?: string } }) {
  const session = verifySession(cookies().get(AUTH_COOKIE)?.value);
  if (!session) redirect("/login");

  const reports = await listReports();
  return <ReportsClient initialReports={reports} session={session} initialOpenId={searchParams?.id ?? ""} />;
}
