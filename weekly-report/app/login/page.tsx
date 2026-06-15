import { listMembers } from "@/lib/store";
import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  let members: { team: string; name: string }[] = [];
  try { members = (await listMembers()).map((m) => ({ team: m.team, name: m.name })); }
  catch { members = []; }
  return <LoginClient members={members} />;
}
