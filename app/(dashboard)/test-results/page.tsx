import { listTestResults } from "@/services/testResults";
import TestResultsClient from "./TestResultsClient";

export const dynamic = "force-dynamic";

export default async function TestResultsPage() {
  const results = await listTestResults();
  return <TestResultsClient initial={results} />;
}
