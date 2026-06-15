import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, verifySession } from "@/lib/auth";
import { listExpenses } from "@/lib/store";
import ExpenseClient from "./ExpenseClient";

export const dynamic = "force-dynamic";

export default async function ExpensePage() {
  const session = verifySession(cookies().get(AUTH_COOKIE)?.value);
  if (!session) redirect("/login");

  const expenses = await listExpenses().catch(() => []);
  return <ExpenseClient initialExpenses={expenses} session={session} />;
}
