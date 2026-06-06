import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import MockModeBanner from "@/components/MockModeBanner";
import GlobalSavingIndicator from "@/components/GlobalSavingIndicator";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { APP_AUTH_COOKIE, verifyCookie } from "@/lib/appAuth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Stage-1 internal auth: shared password + role cookie. (NextAuth/OAuth path
  // is kept in the codebase for later but is no longer the active gate.)
  const cookie = cookies().get(APP_AUTH_COOKIE)?.value;
  const session = verifyCookie(cookie);
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar role={session.role} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar role={session.role} />
        <MockModeBanner />
        <main className="flex-1 p-6 lg:p-8 overflow-x-auto">{children}</main>
      </div>
      <GlobalSavingIndicator />
    </div>
  );
}
