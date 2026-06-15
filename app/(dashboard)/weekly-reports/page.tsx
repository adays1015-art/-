import { listWeeklyReports } from "@/services/weeklyReports";
import WeeklyReportsClient from "./WeeklyReportsClient";

export const dynamic = "force-dynamic";

export default async function WeeklyReportsPage() {
  const reports = await listWeeklyReports();
  return <WeeklyReportsClient initialReports={reports} />;
}
