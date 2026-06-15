import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Receipt } from "lucide-react";
import { AUTH_COOKIE, verifySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function ExpensePage() {
  const session = verifySession(cookies().get(AUTH_COOKIE)?.value);
  if (!session) redirect("/login");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink-900 tracking-tight mb-1">지출결의서</h1>
      <p className="text-sm text-ink-600 mb-6">지출 신청·결재 모듈입니다.</p>

      <div className="panel panel-pad flex flex-col items-center justify-center text-center py-16">
        <div className="w-12 h-12 rounded-full bg-bg-subtle flex items-center justify-center mb-3">
          <Receipt size={22} className="text-ink-400" />
        </div>
        <div className="text-ink-800 font-medium">준비 중</div>
        <p className="text-sm text-ink-500 mt-1 max-w-md">
          지출결의서에 들어갈 항목(예: 신청자 · 일자 · 항목 · 금액 · 사유 · 결재상태)을
          알려주시면 이 화면을 그대로 만들어 드립니다.
        </p>
      </div>
    </div>
  );
}
