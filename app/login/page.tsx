"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LogIn, ShieldCheck, AlertCircle } from "lucide-react";

const ROLES = ["관리자", "생산팀", "조회자"] as const;

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/";
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<typeof ROLES[number]>("생산팀");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, role }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? `로그인 실패 (HTTP ${res.status})`);
        return;
      }
      try {
        localStorage.setItem("bfter.role", role);
        localStorage.setItem("bfter.loggedInAt", String(Date.now()));
      } catch { /* localStorage unavailable — ignore */ }
      router.replace(callbackUrl);
      // Hard-refresh so server components pick up the cookie immediately
      setTimeout(() => router.refresh(), 50);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-6">
      <form onSubmit={submit} className="w-full max-w-md panel panel-pad">
        <div className="text-center">
          <div className="text-[11px] font-medium tracking-[0.22em] text-ink-500 uppercase">
            Another Day · B.fter
          </div>
          <h1 className="mt-2 text-xl font-semibold text-ink-900">
            Another Day 내부 생산관리 시스템
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            내부 공유 비밀번호와 역할을 선택해 로그인하세요.
          </p>
        </div>

        <div className="mt-6 space-y-3">
          <div>
            <label className="label">비밀번호</label>
            <input
              type="password"
              className="input"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="공유 비밀번호"
              required
            />
          </div>
          <div>
            <label className="label">역할 선택</label>
            <div className="grid grid-cols-3 gap-2">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`px-3 py-2 text-sm rounded-md border transition-colors ${
                    role === r
                      ? "bg-ink-900 text-bg border-ink-900"
                      : "bg-bg-panel text-ink-800 border-border hover:bg-bg-subtle"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-ink-500 mt-1.5">
              {role === "관리자" && "모든 기능 사용 + 설정 변경 가능"}
              {role === "생산팀" && "생산·조립·출고 기록 등록 가능, 설정·BOM·원가 편집 불가"}
              {role === "조회자" && "조회 전용 — 등록/수정/삭제 불가"}
            </p>
          </div>
        </div>

        <button type="submit" disabled={submitting} className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-md bg-ink-900 text-bg px-4 py-2.5 text-sm font-medium hover:bg-ink-800 disabled:opacity-60">
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
          로그인
        </button>

        {error && (
          <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-border text-[11px] text-ink-500 flex items-center gap-1.5">
          <ShieldCheck size={11} />
          1단계 내부 접근 제어 — 공유 비밀번호 + 역할 선택. 개별 계정은 추후 단계에서 추가됩니다.
        </div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
